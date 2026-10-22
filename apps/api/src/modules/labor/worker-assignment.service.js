const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, coerceDates, pickWritable } = require('../../utils/shape.js');

// ============================================================
// PENUGASAN PEKERJA per tahapan — kesepakatan kerja (jenis, peran, upah,
// periode). Tanpa kolom status (P5): bertugas = end_date kosong atau >= hari
// ini. "Keluarkan" = isi end_date; hapus hanya untuk salah input.
// ============================================================

// Merekrut sebelum pekerjaan dimulai wajar — sama dengan request material/alat
const ASSIGNABLE_STAGE_STATUSES = ['planned', 'active'];
const CREATE_FIELDS = ['workerType', 'assignedRole', 'dailyWage', 'startDate', 'endDate', 'notes'];

const ASSIGNMENT_INCLUDE = {
  projectWorker: { select: { id: true, workerCode: true, fullName: true, idNumber: true, phone: true, defaultRole: true } },
};

/**
 * Hari ini menurut jam server, sebagai tengah malam UTC — bentuk yang sama dengan
 * kolom @db.Date yang dibaca Prisma. toDateOnly(new Date()) memakai tanggal UTC,
 * yang di WIB sebelum pukul 07.00 masih "kemarin".
 */
const todayDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

const isActiveOn = (row, date) =>
  row.startDate <= date && (row.endDate === null || row.endDate >= date);

const shapeAssignment = (row, loggedDays) => ({
  id: row.id,
  subProjectId: row.subProjectId,
  worker: {
    id: row.projectWorker.id,
    workerCode: row.projectWorker.workerCode,
    fullName: row.projectWorker.fullName,
    idNumber: row.projectWorker.idNumber,
    phone: row.projectWorker.phone,
  },
  workerType: row.workerType,
  assignedRole: row.assignedRole,
  role: row.assignedRole ?? row.projectWorker.defaultRole,
  dailyWage: toNumber(row.dailyWage),
  startDate: toDateOnly(row.startDate),
  endDate: toDateOnly(row.endDate),
  isActive: isActiveOn(row, todayDate()),
  ...(loggedDays !== undefined && { loggedDays }),
  notes: row.notes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Jumlah log tahapan yang memuat tiap pekerja: Map(projectWorkerId → hari). */
const loggedDaysMap = async (subProjectId, workerIds) => {
  if (!workerIds.length) return new Map();
  const rows = await prisma.dailyLaborLogItem.groupBy({
    by: ['projectWorkerId'],
    where: { projectWorkerId: { in: workerIds }, dailyLaborLog: { subProjectId } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.projectWorkerId, r._count._all]));
};

const findOrFail = async (id) => {
  const row = await prisma.subProjectWorkerAssignment.findUnique({ where: { id }, include: ASSIGNMENT_INCLUDE });
  if (!row) throw httpError('Penugasan tidak ditemukan', 404);
  return row;
};

const assertPeriod = (startDate, endDate) => {
  if (endDate && startDate && endDate < startDate) {
    throw httpError('Tanggal selesai tidak boleh sebelum tanggal mulai', 400);
  }
};

/**
 * Satu tahapan (tanpa paginasi — puluhan baris) atau satu pekerja (paginasi
 * tidak perlu juga: riwayat satu orang pendek). `activeOn` dipakai FE mengisi
 * awal log harian.
 */
const list = async ({ subProjectId, projectWorkerId, workerType, active, activeOn, search }) => {
  const date = activeOn ? new Date(activeOn) : todayDate();
  const onDate = { startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] };
  const term = search?.trim();
  const where = {
    ...(subProjectId && { subProjectId }),
    ...(projectWorkerId && { projectWorkerId }),
    ...(workerType && { workerType }),
    ...((activeOn || active === true) && onDate),
    ...(active === false && { NOT: onDate }),
    ...(term && { projectWorker: { OR: [
      { fullName: { contains: term, mode: 'insensitive' } },
      { workerCode: { contains: term, mode: 'insensitive' } },
      { idNumber: { contains: term } },
    ] } }),
  };
  const rows = await prisma.subProjectWorkerAssignment.findMany({
    where, include: ASSIGNMENT_INCLUDE, orderBy: [{ projectWorker: { fullName: 'asc' } }, { id: 'asc' }],
  });

  const counts = subProjectId ? await loggedDaysMap(subProjectId, rows.map((r) => r.projectWorkerId)) : null;
  const data = rows.map((r) => shapeAssignment(r, counts ? (counts.get(r.projectWorkerId) ?? 0) : undefined));
  const activeRows = data.filter((r) => r.isActive);
  return {
    data,
    summary: {
      total: data.length,
      active: activeRows.length,
      activeDailyWage: activeRows.reduce((sum, r) => sum + r.dailyWage, 0),
    },
  };
};

const getById = async (id) => shapeAssignment(await findOrFail(id));

const create = async (payload, userId) => {
  const { subProjectId, projectWorkerId } = payload;
  const [stage, worker] = await Promise.all([
    prisma.subProject.findUnique({ where: { id: subProjectId } }),
    prisma.projectWorker.findUnique({ where: { id: projectWorkerId } }),
  ]);
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);
  if (!worker) throw httpError(`Pekerja dengan ID ${projectWorkerId} tidak ditemukan`, 404);

  const data = coerceDates(pickWritable(payload, CREATE_FIELDS), ['startDate', 'endDate']);
  assertPeriod(data.startDate, data.endDate);

  const duplicate = await prisma.subProjectWorkerAssignment.findUnique({
    where: { subProjectId_projectWorkerId: { subProjectId, projectWorkerId } },
  });
  if (duplicate) {
    throw httpError(`${worker.fullName} sudah ditugaskan di tahapan ini. Ubah penugasan yang ada (mis. kosongkan tanggal selesai).`, 409);
  }

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId });
    // Dibaca ulang di bawah kunci: planned→active tidak masalah, tapi status lain menolak
    const current = await tx.subProject.findUnique({ where: { id: subProjectId }, select: { status: true } });
    if (!ASSIGNABLE_STAGE_STATUSES.includes(current.status)) {
      throw httpError(`Tahapan berstatus "${current.status}" — pekerja hanya bisa ditugaskan ke tahapan planned/active`, 409);
    }
    return tx.subProjectWorkerAssignment.create({
      data: { ...data, subProjectId, projectWorkerId, createdBy: userId },
      include: ASSIGNMENT_INCLUDE,
    });
  });
  return shapeAssignment(row);
};

const UPDATE_FIELDS = ['workerType', 'assignedRole', 'dailyWage', 'startDate', 'endDate', 'notes'];

/** Upah baru TIDAK mengubah log lama — upah disimpan per baris log. */
const update = async (id, payload) => {
  const row = await findOrFail(id);
  const data = coerceDates(pickWritable(payload, UPDATE_FIELDS), ['startDate', 'endDate']);
  if (typeof data.assignedRole === 'string') data.assignedRole = data.assignedRole.trim() || null;
  assertPeriod(data.startDate ?? row.startDate, data.endDate === undefined ? row.endDate : data.endDate);

  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    return tx.subProjectWorkerAssignment.update({ where: { id }, data, include: ASSIGNMENT_INCLUDE });
  });
  return shapeAssignment(updated);
};

/** Salah input saja. Yang sudah tercatat di log tahapan ini dikeluarkan lewat endDate. */
const remove = async (id) => {
  const row = await findOrFail(id);
  await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    const logged = await tx.dailyLaborLogItem.count({
      where: { projectWorkerId: row.projectWorkerId, dailyLaborLog: { subProjectId: row.subProjectId } },
    });
    if (logged) {
      throw httpError(
        `${row.projectWorker.fullName} sudah tercatat di ${logged} log tahapan ini — keluarkan dengan mengisi tanggal selesai, jangan dihapus.`,
        409
      );
    }
    await tx.subProjectWorkerAssignment.delete({ where: { id } });
  });
  return { id };
};

/**
 * Dipanggil di transaksi penutupan tahapan: penugasan yang masih terbuka
 * diakhiri pada tanggal penutupan. Bukan syarat penutupan (P5) — memaksa puluhan
 * orang diakhiri satu-satu tidak menambah informasi. Penugasan yang mulainya
 * sesudah tanggal penutupan (belum sempat mulai) diakhiri di tanggal mulainya.
 */
const endOpenAssignments = async (tx, subProjectId) => {
  const today = todayDate();
  await tx.subProjectWorkerAssignment.updateMany({
    where: { subProjectId, OR: [{ endDate: null }, { endDate: { gt: today } }], startDate: { lte: today } },
    data: { endDate: today },
  });
  await tx.$executeRaw`
    UPDATE sub_project_worker_assignments SET end_date = start_date, updated_at = NOW()
    WHERE sub_project_id = ${subProjectId} AND start_date > ${today}::date
      AND (end_date IS NULL OR end_date > start_date)`;
};

module.exports = {
  list, getById, create, update, remove, endOpenAssignments, todayDate,
  shapeAssignment, ASSIGNMENT_INCLUDE, isActiveOn,
};
