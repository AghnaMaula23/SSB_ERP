const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { toNumber, toDateOnly, coerceDates, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// Urutan tahapan baku. Dipakai sebagai sequenceOrder default dan sebagai acuan
// peringatan urutan — BUKAN sebagai blokir, karena ERD menyebut "atau
// berdasarkan kesepakatan kontrak baru": perusahaan bisa dapat kontrak tahapan
// akhir lebih dulu.
const STAGE_ORDER = { galian: 1, timbunan: 2, line_clearing: 3, aspal: 4 };

// Kontrak dan target volume tidak boleh diubah setelah tahapan ditutup —
// angkanya sudah jadi dasar tagihan yang dikirim ke klien.
const IMMUTABLE_STATUSES = ['completed', 'cancelled'];

const SUB_PROJECT_DATE_FIELDS = ['contractDate', 'contractStartDate', 'contractEndDate'];

const SUB_PROJECT_WRITABLE_FIELDS = [
  'sequenceOrder', 'targetVolume', 'dailyTargetVolume', 'volumeUnit',
  'contractValue', 'contractNo', 'contractDate', 'contractStartDate', 'contractEndDate',
];

/**
 * Progress dan nilai tagihan satu sub-project.
 *
 * ATURAN BISNIS INTI: tagihan klien = progress % × contract_value, dan progress
 * dihitung SUM(realized_volume) / target_volume × 100.
 *
 * Hanya baris `validated` yang menghasilkan angka tagihan. Baris `submitted`
 * dilaporkan terpisah sebagai pendingVolume supaya lapangan tahu apa yang belum
 * diperiksa, tapi tidak pernah ikut menghitung uang — kalau ikut, nominal
 * tagihan bisa turun setelah validator menolak sebuah entri, padahal tagihannya
 * mungkin sudah dikirim.
 */
const calculateProgress = async (subProject, client = prisma) => {
  const grouped = await client.dailyProgressLog.groupBy({
    by: ['status'],
    where: { subProjectId: subProject.id },
    _sum: { realizedVolume: true },
    _count: true,
  });

  const bucket = (status) => grouped.find((g) => g.status === status);
  const volumeOf = (status) => toNumber(bucket(status)?._sum.realizedVolume) ?? 0;

  const target = toNumber(subProject.targetVolume) ?? 0;
  const contractValue = toNumber(subProject.contractValue) ?? 0;

  const validatedVolume = volumeOf('validated');
  const pendingVolume = volumeOf('submitted');
  const rejectedVolume = volumeOf('rejected');

  // Target 0 tidak pernah lolos validator, tapi kalau sampai ada di data lama
  // jangan balas Infinity — nol lebih jujur daripada angka yang tidak berarti.
  const pct = (volume) => (target > 0 ? Math.min((volume / target) * 100, 100) : 0);
  const round2 = (n) => Math.round(n * 100) / 100;

  const billableProgress = round2(pct(validatedVolume));

  return {
    targetVolume: target,
    volumeUnit: subProject.volumeUnit,
    contractValue,

    // Dasar tagihan — hanya dari progress yang sudah divalidasi Admin
    validatedVolume,
    billableProgress,
    billableAmount: round2((billableProgress / 100) * contractValue),

    // Belum diperiksa. Sengaja dipisah supaya tidak tercampur ke angka uang.
    pendingVolume,
    pendingProgress: round2(pct(pendingVolume)),
    rejectedVolume,

    remainingVolume: round2(Math.max(target - validatedVolume, 0)),
    logCount: {
      validated: bucket('validated')?._count ?? 0,
      submitted: bucket('submitted')?._count ?? 0,
      rejected: bucket('rejected')?._count ?? 0,
    },
    // Nominal yang sudah dibayar klien milik modul Income (Build Order langkah 6).
    // Dilaporkan null, bukan 0 — 0 akan terbaca "sudah ditagih, belum dibayar".
    paidAmount: null,
  };
};

const shapeSubProject = (row, progress) => ({
  id: row.id,
  constructionProjectId: row.constructionProjectId,
  constructionProject: row.constructionProject
    ? {
        id: row.constructionProject.id,
        projectCode: row.constructionProject.projectCode,
        projectName: row.constructionProject.projectName,
        status: row.constructionProject.status,
      }
    : undefined,
  subProjectType: row.subProjectType,
  status: row.status,
  sequenceOrder: row.sequenceOrder,
  targetVolume: toNumber(row.targetVolume),
  dailyTargetVolume: toNumber(row.dailyTargetVolume),
  volumeUnit: row.volumeUnit,
  contractValue: toNumber(row.contractValue),
  contractNo: row.contractNo,
  contractDate: toDateOnly(row.contractDate),
  contractStartDate: toDateOnly(row.contractStartDate),
  contractEndDate: toDateOnly(row.contractEndDate),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: shapeActor(row.createdByUser),
  ...(progress && { progress }),
});

const findProjectOrFail = async (projectId) => {
  const project = await prisma.constructionProject.findUnique({ where: { id: projectId } });
  if (!project) throw httpError('Construction project tidak ditemukan', 404);
  return project;
};

/** Sub-project selalu dibaca dalam konteks project-nya — id di URL harus cocok. */
const findOrFail = async (projectId, id) => {
  const row = await prisma.subProject.findUnique({
    where: { id },
    include: {
      constructionProject: true,
      createdByUser: { select: ACTOR_SELECT },
    },
  });
  if (!row) throw httpError('Sub-project tidak ditemukan', 404);
  if (row.constructionProjectId !== projectId) {
    throw httpError('Sub-project ini bukan milik construction project tersebut', 404);
  }
  return row;
};

const list = async (projectId, { status } = {}) => {
  await findProjectOrFail(projectId);

  const rows = await prisma.subProject.findMany({
    where: { constructionProjectId: projectId, ...(status && { status }) },
    include: { createdByUser: { select: ACTOR_SELECT } },
    orderBy: [{ sequenceOrder: 'asc' }, { id: 'asc' }],
  });

  // Tahapan selalu sedikit (maksimal 4 per project), jadi progress-nya dihitung
  // untuk semuanya sekaligus — tanpa paginasi dan tanpa N+1 yang berarti.
  const withProgress = await Promise.all(
    rows.map(async (row) => shapeSubProject(row, await calculateProgress(row)))
  );

  // Tahapan yang DIBATALKAN tidak ikut menghitung nilai kontrak project —
  // pekerjaannya tidak akan dikerjakan, jadi memasukkannya membuat nilai kontrak
  // project terlihat lebih besar dari komitmen yang sebenarnya ada.
  const live = withProgress.filter((s) => s.status !== 'cancelled');
  const sumBy = (rows, get) => Math.round(rows.reduce((total, r) => total + (get(r) ?? 0), 0) * 100) / 100;

  return {
    data: withProgress,
    summary: {
      stageCount: withProgress.length,
      activeStageCount: live.length,
      // Nilai kontrak project = jumlah kontrak tahapan yang DIKERJAKAN perusahaan.
      // Tahapan yang dikerjakan perusahaan lain tidak pernah tercatat di sistem ini.
      totalContractValue: sumBy(live, (s) => s.contractValue),
      totalBillableAmount: sumBy(live, (s) => s.progress?.billableAmount),
      cancelledContractValue: sumBy(
        withProgress.filter((s) => s.status === 'cancelled'), (s) => s.contractValue),
    },
  };
};

const getById = async (projectId, id) => {
  const row = await findOrFail(projectId, id);
  return shapeSubProject(row, await calculateProgress(row));
};

/**
 * Detail tahapan TANPA perlu tahu project-nya lebih dulu.
 *
 * Ditambahkan 5 Okt 2026: UI mengakses tahapan lewat pohon navigasi dan lewat
 * tautan langsung, di mana project id tidak selalu ada di tangan. Tanpa ini,
 * klien terpaksa menelusuri seluruh daftar project untuk menemukan satu
 * tahapan — N+1 yang lahir dari lubang di API, bukan dari kebutuhan.
 *
 * Project induknya ikut dikembalikan supaya klien bisa membangun breadcrumb
 * tanpa permintaan kedua.
 */
const getByIdDirect = async (id) => {
  const row = await prisma.subProject.findUnique({
    where: { id },
    include: {
      constructionProject: true,
      createdByUser: { select: ACTOR_SELECT },
    },
  });
  if (!row) throw httpError('Sub-project tidak ditemukan', 404);
  return shapeSubProject(row, await calculateProgress(row));
};

const getProgress = async (projectId, id) => {
  const row = await findOrFail(projectId, id);
  return {
    subProjectId: row.id,
    subProjectType: row.subProjectType,
    status: row.status,
    ...(await calculateProgress(row)),
  };
};

const assertContractDateOrder = (merged) => {
  const { contractStartDate: start, contractEndDate: end } = merged;
  if (start && end && new Date(start) > new Date(end)) {
    throw httpError('contractStartDate tidak boleh setelah contractEndDate', 400);
  }
};

const create = async (projectId, payload, userId) => {
  const project = await findProjectOrFail(projectId);
  if (['completed', 'cancelled'].includes(project.status)) {
    throw httpError(`Construction project berstatus "${project.status}", tidak bisa ditambah tahapan baru`, 409);
  }

  const { subProjectType } = payload;
  const writable = coerceDates(pickWritable(payload, SUB_PROJECT_WRITABLE_FIELDS), SUB_PROJECT_DATE_FIELDS);

  const duplicate = await prisma.subProject.findUnique({
    where: { constructionProjectId_subProjectType: { constructionProjectId: projectId, subProjectType } },
  });
  if (duplicate) {
    throw httpError(
      `Project ini sudah punya tahapan "${subProjectType}". Satu tahapan per tipe per project.`,
      409
    );
  }

  assertContractDateOrder(writable);

  const row = await prisma.subProject.create({
    data: {
      constructionProjectId: projectId,
      subProjectType,
      // Urutan baku tahapan dipakai kalau klien tidak menentukan sendiri
      sequenceOrder: writable.sequenceOrder ?? STAGE_ORDER[subProjectType],
      ...writable,
      createdBy: userId,
    },
    include: { constructionProject: true, createdByUser: { select: ACTOR_SELECT } },
  });

  return shapeSubProject(row, await calculateProgress(row));
};

const update = async (projectId, id, payload) => {
  const row = await findOrFail(projectId, id);

  if (IMMUTABLE_STATUSES.includes(row.status)) {
    throw httpError(
      `Sub-project berstatus "${row.status}" dan kontraknya tidak bisa diubah lagi`,
      409
    );
  }

  const writable = coerceDates(pickWritable(payload, SUB_PROJECT_WRITABLE_FIELDS), SUB_PROJECT_DATE_FIELDS);
  assertContractDateOrder({ ...row, ...writable });

  // Target volume tidak boleh turun di bawah realisasi yang sudah divalidasi —
  // kalau boleh, progress-nya jadi >100% dan tagihannya melebihi nilai kontrak.
  if (writable.targetVolume !== undefined) {
    const validated = await prisma.dailyProgressLog.aggregate({
      where: { subProjectId: id, status: 'validated' },
      _sum: { realizedVolume: true },
    });
    const done = toNumber(validated._sum.realizedVolume) ?? 0;
    if (Number(writable.targetVolume) < done) {
      throw httpError(
        `Target volume ${writable.targetVolume} lebih kecil dari realisasi yang sudah divalidasi (${done} ${row.volumeUnit})`,
        409
      );
    }
  }

  const updated = await prisma.subProject.update({
    where: { id },
    data: writable,
    include: { constructionProject: true, createdByUser: { select: ACTOR_SELECT } },
  });
  return shapeSubProject(updated, await calculateProgress(updated));
};

const STATUS_TRANSITIONS = {
  planned: ['active', 'cancelled'],
  active: ['planned', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Tahapan pendahulu yang belum selesai. PERINGATAN, bukan blokir — ERD menyebut
 * urutan bisa dilanggar "berdasarkan kesepakatan kontrak baru", dan perusahaan
 * memang bisa hanya dapat kontrak tahapan akhir. Pola yang sama dengan
 * balanceWarning pada purchase request: kasih tahu, jangan halangi.
 */
const buildSequenceWarning = async (subProject) => {
  const earlier = await prisma.subProject.findMany({
    where: {
      constructionProjectId: subProject.constructionProjectId,
      sequenceOrder: { lt: subProject.sequenceOrder },
      status: { in: ['planned', 'active'] },
    },
    orderBy: { sequenceOrder: 'asc' },
    select: { id: true, subProjectType: true, sequenceOrder: true, status: true },
  });

  if (earlier.length === 0) return null;

  const names = earlier.map((s) => `${s.subProjectType} (${s.status})`).join(', ');
  return {
    unfinishedPredecessors: earlier,
    message:
      `Tahapan "${subProject.subProjectType}" diaktifkan padahal tahapan sebelumnya belum selesai: ${names}. ` +
      'Dibiarkan jalan karena kontrak bisa disepakati di luar urutan baku, tapi pastikan ini memang disengaja.',
  };
};

const changeStatus = async (projectId, id, status) => {
  const row = await findOrFail(projectId, id);

  if (row.status === status) throw httpError(`Sub-project sudah berstatus "${status}"`, 409);

  const allowed = STATUS_TRANSITIONS[row.status];
  if (!allowed.includes(status)) {
    throw httpError(
      allowed.length === 0
        ? `Sub-project berstatus "${row.status}" yang bersifat final dan tidak bisa diubah lagi`
        : `Status tidak bisa langsung dari "${row.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  // Menutup tahapan sementara alat masih terikat padanya membuat alat itu
  // menggantung: alokasinya hidup tapi tahapannya tidak lagi mencatat progress.
  if (status === 'completed') {
    const activeAllocations = await prisma.subProjectEquipmentAllocation.count({
      where: { subProjectId: id, status: 'assigned' },
    });
    if (activeAllocations > 0) {
      throw httpError(
        `Masih ada ${activeAllocations} alat teralokasi ke tahapan ini. Selesaikan atau kembalikan alatnya dulu.`,
        409
      );
    }
  }

  const updated = await prisma.subProject.update({
    where: { id },
    data: { status },
    include: { constructionProject: true, createdByUser: { select: ACTOR_SELECT } },
  });

  return {
    ...shapeSubProject(updated, await calculateProgress(updated)),
    // Hanya relevan saat tahapan mulai dijalankan
    sequenceWarning: status === 'active' ? await buildSequenceWarning(updated) : null,
  };
};

module.exports = {
  STAGE_ORDER, calculateProgress, findOrFail, findProjectOrFail,
  list, getById, getByIdDirect, getProgress, create, update, changeStatus,
};
