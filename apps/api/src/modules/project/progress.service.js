const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('./context-lock.js');
const { assertNotFuture } = require('../../utils/date.js');
const { toNumber, toDateOnly, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const subProjectService = require('./sub-project.service.js');

const PROGRESS_WRITABLE_FIELDS = ['realizedVolume', 'notes'];
const FIELD_CONDITION_WRITABLE_FIELDS = [
  'weatherMorning', 'weatherAfternoon', 'fieldConditionNotes', 'incidentNotes',
];

// Progress hanya boleh dicatat pada tahapan yang sedang jalan. `planned` berarti
// pekerjaannya belum dimulai; mencatat realisasi di sana membuat progress
// bergerak untuk tahapan yang secara kontrak belum berjalan.
const RECORDABLE_SUB_PROJECT_STATUSES = ['active'];

const shapeFieldCondition = (row) =>
  row
    ? {
        id: row.id,
        weatherMorning: row.weatherMorning,
        weatherAfternoon: row.weatherAfternoon,
        fieldConditionNotes: row.fieldConditionNotes,
        incidentNotes: row.incidentNotes,
        createdBy: shapeActor(row.createdByUser),
      }
    : null;

const shapeLog = (row) => ({
  id: row.id,
  subProjectId: row.subProjectId,
  progressDate: toDateOnly(row.progressDate),
  realizedVolume: toNumber(row.realizedVolume),
  notes: row.notes,
  status: row.status,
  validatedAt: row.validatedAt,
  validatedBy: shapeActor(row.validatedByUser),
  validationNotes: row.validationNotes,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: shapeActor(row.createdByUser),
  fieldCondition: row.fieldCondition !== undefined ? shapeFieldCondition(row.fieldCondition) : undefined,
});

const LOG_INCLUDE = {
  createdByUser: { select: ACTOR_SELECT },
  validatedByUser: { select: ACTOR_SELECT },
  fieldCondition: { include: { createdByUser: { select: ACTOR_SELECT } } },
};

const findSubProjectOrFail = async (subProjectId) => {
  const subProject = await prisma.subProject.findUnique({
    where: { id: subProjectId },
    include: { constructionProject: { select: { id: true, projectCode: true, status: true } } },
  });
  if (!subProject) throw httpError('Sub-project tidak ditemukan', 404);
  return subProject;
};

const findLogOrFail = async (subProjectId, id) => {
  const row = await prisma.dailyProgressLog.findUnique({ where: { id }, include: LOG_INCLUDE });
  if (!row) throw httpError('Progress log tidak ditemukan', 404);
  if (row.subProjectId !== subProjectId) {
    throw httpError('Progress log ini bukan milik sub-project tersebut', 404);
  }
  return row;
};

const list = async (subProjectId, { page = 1, limit = 20, startDate, endDate, status }) => {
  await findSubProjectOrFail(subProjectId);

  const where = {
    subProjectId,
    ...(status && { status }),
    ...((startDate || endDate) && {
      progressDate: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

  const [rows, total, agg] = await Promise.all([
    prisma.dailyProgressLog.findMany({
      where,
      include: LOG_INCLUDE,
      orderBy: [{ progressDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dailyProgressLog.count({ where }),
    prisma.dailyProgressLog.groupBy({ by: ['status'], where, _sum: { realizedVolume: true } }),
  ]);

  const volumeOf = (s) => toNumber(agg.find((g) => g.status === s)?._sum.realizedVolume) ?? 0;

  return {
    data: rows.map(shapeLog),
    total,
    page,
    limit,
    // Total pada seluruh rentang filter, bukan cuma halaman yang tampil
    summary: {
      validatedVolume: volumeOf('validated'),
      pendingVolume: volumeOf('submitted'),
      rejectedVolume: volumeOf('rejected'),
    },
  };
};

const getById = async (subProjectId, id) => shapeLog(await findLogOrFail(subProjectId, id));

/**
 * Catat realisasi harian. Kondisi lapangan (cuaca, insiden) opsional dan
 * disimpan bersama dalam satu transaksi — kalau dipisah jadi dua endpoint,
 * progress bisa tercatat tanpa konteksnya dan tidak ada yang tahu itu hilang.
 */
const create = async (subProjectId, payload, userId) => {
  const subProject = await findSubProjectOrFail(subProjectId);

  if (!RECORDABLE_SUB_PROJECT_STATUSES.includes(subProject.status)) {
    throw httpError(
      `Tahapan berstatus "${subProject.status}". Progress harian hanya bisa dicatat pada tahapan yang sedang aktif.`,
      409
    );
  }

  const writable = pickWritable(payload, PROGRESS_WRITABLE_FIELDS);
  const date = assertNotFuture(payload.progressDate, 'Tanggal progress');

  const duplicate = await prisma.dailyProgressLog.findUnique({
    where: { subProjectId_progressDate: { subProjectId, progressDate: date } },
  });
  if (duplicate) {
    throw httpError(
      `Progress tanggal ${toDateOnly(date)} sudah dicatat untuk tahapan ini. Ubah catatan yang ada, jangan buat baru.`,
      409
    );
  }

  const condition = payload.fieldCondition;

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId });
    const created = await tx.dailyProgressLog.create({
      data: { subProjectId, progressDate: date, ...writable, createdBy: userId },
    });

    if (condition) {
      await tx.fieldConditionLog.create({
        data: {
          dailyProgressLogId: created.id,
          ...pickWritable(condition, FIELD_CONDITION_WRITABLE_FIELDS),
          createdBy: userId,
        },
      });
    }

    return tx.dailyProgressLog.findUnique({ where: { id: created.id }, include: LOG_INCLUDE });
  });

  return {
    ...shapeLog(row),
    // Supaya lapangan langsung lihat dampak input ini ke progress tahapannya
    subProjectProgress: await subProjectService.calculateProgress(subProject),
  };
};

/**
 * Baris `validated` TIDAK BISA DIEDIT. Angkanya sudah menjadi dasar tagihan;
 * mengubahnya diam-diam mengubah nilai yang mungkin sudah dikirim ke klien.
 * Untuk memperbaikinya, Admin mencabut validasinya dulu (revalidate ke
 * `submitted`) — pencabutan itu meninggalkan jejak di validatedBy/validatedAt.
 * Pola kunci ini mengikuti daily_labor_logs.locked_at pada ERD Finance Field.
 */
const update = async (subProjectId, id, payload, userId) => {
  const row = await findLogOrFail(subProjectId, id);

  if (row.status === 'validated') {
    throw httpError(
      'Progress yang sudah divalidasi tidak bisa diubah. Minta Admin mencabut validasinya dulu ' +
      '(PUT .../validate dengan status "submitted"), baru catatannya bisa diperbaiki.',
      409
    );
  }

  const writable = pickWritable(payload, PROGRESS_WRITABLE_FIELDS);
  const condition = payload.fieldCondition;

  const updated = await prisma.$transaction(async (tx) => {
    // Tahapan yang ditutup terkunci (L8) — termasuk catatan yang belum divalidasi
    await assertContextOpen(tx, { subProjectId });
    if (Object.keys(writable).length > 0) {
      await tx.dailyProgressLog.update({ where: { id }, data: writable });
    }

    if (condition) {
      const data = pickWritable(condition, FIELD_CONDITION_WRITABLE_FIELDS);
      // Upsert: progress bisa dicatat tanpa kondisi lapangan lalu dilengkapi
      // kemudian, atau kondisinya diperbaiki setelah dicatat.
      await tx.fieldConditionLog.upsert({
        where: { dailyProgressLogId: id },
        update: data,
        create: { dailyProgressLogId: id, ...data, createdBy: userId },
      });
    }

    return tx.dailyProgressLog.findUnique({ where: { id }, include: LOG_INCLUDE });
  });

  return shapeLog(updated);
};

// Transisi status validasi yang sah. `submitted` sebagai TUJUAN berarti
// pencabutan validasi atau pembukaan kembali entri yang ditolak.
const VALIDATION_TRANSITIONS = {
  submitted: ['validated', 'rejected'],
  validated: ['submitted'],
  rejected: ['submitted'],
};

/**
 * Validasi Admin. Inilah gerbang yang memisahkan catatan lapangan dari angka
 * yang boleh menagih klien.
 *
 * `validation_notes` memuat catatan keputusan TERAKHIR (Approval Center A5):
 * wajib saat menolak (dijaga validator), ditimpa setiap transisi — termasuk
 * dikosongkan saat kembali ke `submitted` tanpa catatan.
 */
const setValidationStatus = async (subProjectId, id, status, userId, notes) => {
  const row = await findLogOrFail(subProjectId, id);

  if (row.status === status) throw httpError(`Progress log sudah berstatus "${status}"`, 409);

  const allowed = VALIDATION_TRANSITIONS[row.status];
  if (!allowed.includes(status)) {
    throw httpError(
      `Status tidak bisa langsung dari "${row.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Validasi (atau mencabutnya) mengubah dasar tagihan — terkunci setelah tahapan ditutup
    await assertContextOpen(tx, { subProjectId });
    // Atomik: dua Admin yang bertindak bersamaan pada log yang sama — satu 409.
    await claimTransition(tx.dailyProgressLog, { id, status: row.status }, {
      status,
      // Dicatat juga saat validasi DICABUT — siapa yang membuka kunci sama
      // pentingnya dengan siapa yang menguncinya.
      validatedBy: userId,
      validatedAt: new Date(),
      validationNotes: notes || null,
    });
    return tx.dailyProgressLog.findUnique({ where: { id }, include: LOG_INCLUDE });
  });

  const subProject = await prisma.subProject.findUnique({ where: { id: subProjectId } });

  return {
    ...shapeLog(updated),
    // Dampak langsung ke angka tagihan, supaya Admin lihat akibat keputusannya
    subProjectProgress: await subProjectService.calculateProgress(subProject),
  };
};

module.exports = { list, getById, create, update, setValidationStatus };
