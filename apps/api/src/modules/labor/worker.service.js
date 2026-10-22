const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, toDateOnly, coerceDates, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// MASTER PEKERJA — global, tidak terikat project/tahapan (P5,
// docs/skema-tenaga-kerja-harian.md). Identitas saja: upah milik penugasan.
// ============================================================

const WRITABLE_FIELDS = ['fullName', 'idNumber', 'phone', 'defaultRole', 'joinedAt', 'notes'];

/** Lama kerja dalam tahun penuh — dihitung, tidak disimpan (basi besok pagi). */
const yearsSince = (date) => {
  if (!date) return null;
  const from = new Date(date);
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  if (now < new Date(now.getFullYear(), from.getMonth(), from.getDate())) years -= 1;
  return Math.max(years, 0);
};

const shapeWorker = (row) => ({
  id: row.id,
  workerCode: row.workerCode,
  fullName: row.fullName,
  idNumber: row.idNumber,
  phone: row.phone,
  defaultRole: row.defaultRole,
  joinedAt: toDateOnly(row.joinedAt),
  yearsOfService: yearsSince(row.joinedAt),
  notes: row.notes,
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const INCLUDE = { createdByUser: { select: ACTOR_SELECT } };

const findOrFail = async (id, client = prisma) => {
  const row = await client.projectWorker.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw httpError(`Pekerja dengan ID ${id} tidak ditemukan`, 404);
  return row;
};

/** Teks bebas dirapikan; string kosong = dikosongkan. */
const normalize = (payload) => {
  const data = pickWritable(payload, WRITABLE_FIELDS);
  for (const key of ['fullName', 'idNumber', 'phone', 'defaultRole', 'notes']) {
    if (typeof data[key] === 'string') data[key] = data[key].trim() || null;
  }
  if (data.joinedAt) assertNotFuture(data.joinedAt, 'Tanggal bergabung');
  return coerceDates(data, ['joinedAt']);
};

/** NIK unik di antara yang terisi (partial unique index) — pesan yang bisa ditindaklanjuti. */
const assertIdNumberFree = async (idNumber, exceptId = null) => {
  if (!idNumber) return;
  const other = await prisma.projectWorker.findFirst({ where: { idNumber, NOT: exceptId ? { id: exceptId } : undefined } });
  if (other) throw httpError(`NIK ${idNumber} sudah terdaftar atas nama ${other.fullName} (${other.workerCode})`, 409);
};

const list = async ({ page = 1, limit = 20, search }) => {
  const term = search?.trim();
  const where = term
    ? { OR: [
      { fullName: { contains: term, mode: 'insensitive' } },
      { workerCode: { contains: term, mode: 'insensitive' } },
      { idNumber: { contains: term } },
    ] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.projectWorker.findMany({ where, include: INCLUDE, orderBy: { fullName: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.projectWorker.count({ where }),
  ]);
  return { data: rows.map(shapeWorker), total, page, limit };
};

/** Detail + riwayat penugasan + rekap log per tahapan ("kerja berapa hari di mana"). */
const getById = async (id) => {
  const row = await findOrFail(id);
  const { shapeAssignment, ASSIGNMENT_INCLUDE } = require('./worker-assignment.service.js');
  const [assignments, summary] = await Promise.all([
    prisma.subProjectWorkerAssignment.findMany({
      where: { projectWorkerId: id },
      include: { ...ASSIGNMENT_INCLUDE, subProject: { select: { id: true, subProjectType: true, status: true, constructionProject: { select: { id: true, projectCode: true, projectName: true } } } } },
      orderBy: { startDate: 'desc' },
    }),
    prisma.$queryRaw`
      SELECT l.sub_project_id, COUNT(*)::int AS logged_days,
        SUM(i.daily_wage + i.overtime_amount) AS total_wage
      FROM daily_labor_log_items i
      JOIN daily_labor_logs l ON l.id = i.daily_labor_log_id
      WHERE i.project_worker_id = ${id}
      GROUP BY l.sub_project_id`,
  ]);
  return {
    ...shapeWorker(row),
    assignments: assignments.map((a) => ({ ...shapeAssignment(a), subProject: a.subProject })),
    laborSummary: summary.map((s) => ({ subProjectId: s.sub_project_id, loggedDays: s.logged_days, totalWage: toNumber(s.total_wage) })),
  };
};

const create = async (payload, userId) => {
  const data = normalize(payload);
  if (!data.fullName) throw httpError('Nama lengkap wajib diisi', 400);
  await assertIdNumberFree(data.idNumber);

  const row = await prisma.$transaction(async (tx) => {
    const workerCode = await nextDocumentNumber(tx, 'PWK');
    return tx.projectWorker.create({ data: { ...data, workerCode, createdBy: userId }, include: INCLUDE });
  });
  return shapeWorker(row);
};

/** Perbaikan nama ikut tampil di log lama (log merujuk master, P6) — memang itu tujuannya. */
const update = async (id, payload) => {
  await findOrFail(id);
  const data = normalize(payload);
  if ('fullName' in data && !data.fullName) throw httpError('Nama lengkap tidak boleh dikosongkan', 400);
  await assertIdNumberFree(data.idNumber, id);
  const row = await prisma.projectWorker.update({ where: { id }, data, include: INCLUDE });
  return shapeWorker(row);
};

/** Hanya untuk salah input: pekerja yang sudah punya jejak tidak boleh hilang. */
const remove = async (id) => {
  const row = await findOrFail(id);
  const [assignments, logItems] = await Promise.all([
    prisma.subProjectWorkerAssignment.count({ where: { projectWorkerId: id } }),
    prisma.dailyLaborLogItem.count({ where: { projectWorkerId: id } }),
  ]);
  if (assignments || logItems) {
    throw httpError(
      `${row.fullName} tidak bisa dihapus — sudah punya ${assignments} penugasan dan tercatat di ${logItems} log harian.`,
      409
    );
  }
  // FK RESTRICT tetap penjaga terakhir kalau log tercatat bersamaan (P2003 → 409)
  await prisma.projectWorker.delete({ where: { id } });
  return { id };
};

module.exports = { list, getById, create, update, remove, findOrFail, shapeWorker };
