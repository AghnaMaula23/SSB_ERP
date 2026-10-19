const { Prisma } = require('@prisma/client');
const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// LOG TENAGA KERJA HARIAN — satu tahapan, satu tanggal, satu baris = satu orang
// (docs/skema-tenaga-kerja-harian.md P1–P10).
//
// Tanpa status & tanpa validasi (P1): pemeriksaan Admin → Finance terjadi di
// klaim upah. Selama belum diklaim, log boleh diubah/dihapus; jejaknya
// created_by + updated_by. Total TIDAK disimpan: baris = daily_wage +
// overtime_amount (tanpa pengali, P2), header = SUM barisnya.
//
// Satu orang tidak boleh tercatat di dua log pada tanggal yang sama, lintas
// tahapan/project (P10) — risiko membayar dua kali. Unique index tidak bisa
// menjaganya (tanggal ada di header), jadi dijaga di sini: baris
// project_workers yang terlibat dikunci FOR UPDATE (urut id, bebas deadlock)
// lalu dicek ulang di bawah kunci.
// ============================================================

// Log hanya untuk tahapan yang sedang berjalan — sama dengan progress harian
const RECORDABLE_STAGE_STATUSES = ['active'];
const ITEM_FIELDS = ['workerRole', 'workerType', 'dailyWage', 'overtimeAmount', 'taskNotes'];

const LOG_INCLUDE = {
  createdByUser: { select: ACTOR_SELECT },
  updatedByUser: { select: ACTOR_SELECT },
};
const ITEMS_INCLUDE = {
  items: {
    include: { projectWorker: { select: { id: true, workerCode: true, fullName: true } } },
    orderBy: { projectWorker: { fullName: 'asc' } },
  },
};

const round2 = (n) => Math.round(n * 100) / 100;

const emptySummary = () => ({
  totalWorkers: 0, contractWorkers: 0, dailyWorkers: 0, overtimeWorkers: 0, totalWage: 0, totalOvertime: 0,
});

const shapeSummary = (r) => (r ? {
  totalWorkers: r.total_workers,
  contractWorkers: r.contract_workers,
  dailyWorkers: r.daily_workers,
  overtimeWorkers: r.overtime_workers,
  totalWage: toNumber(r.total_wage),
  totalOvertime: toNumber(r.total_overtime),
} : emptySummary());

const SUMMARY_COLUMNS = Prisma.sql`
  COUNT(i.id)::int AS total_workers,
  COUNT(i.id) FILTER (WHERE i.worker_type = 'contract')::int AS contract_workers,
  COUNT(i.id) FILTER (WHERE i.worker_type = 'daily')::int AS daily_workers,
  COUNT(i.id) FILTER (WHERE i.overtime_amount > 0)::int AS overtime_workers,
  COALESCE(SUM(i.daily_wage + i.overtime_amount), 0) AS total_wage,
  COALESCE(SUM(i.overtime_amount), 0) AS total_overtime`;

/** Ringkasan per log: Map(logId → summary). */
const summariesFor = async (logIds) => {
  if (!logIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT i.daily_labor_log_id AS log_id, ${SUMMARY_COLUMNS}
    FROM daily_labor_log_items i
    WHERE i.daily_labor_log_id = ANY(${logIds})
    GROUP BY i.daily_labor_log_id`;
  return new Map(rows.map((r) => [r.log_id, shapeSummary(r)]));
};

const shapeLog = (row, summary) => ({
  id: row.id,
  subProjectId: row.subProjectId,
  workDate: toDateOnly(row.workDate),
  notes: row.notes,
  summary,
  createdBy: shapeActor(row.createdByUser),
  updatedBy: shapeActor(row.updatedByUser),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Detail: items + penanda upah yang menyimpang dari penugasan (P7). */
const shapeDetail = async (row) => {
  const workerIds = row.items.map((i) => i.projectWorkerId);
  const assignments = workerIds.length
    ? await prisma.subProjectWorkerAssignment.findMany({
      where: { subProjectId: row.subProjectId, projectWorkerId: { in: workerIds } },
      select: { projectWorkerId: true, dailyWage: true },
    })
    : [];
  const agreedWage = new Map(assignments.map((a) => [a.projectWorkerId, toNumber(a.dailyWage)]));

  const items = row.items.map((i) => {
    const dailyWage = toNumber(i.dailyWage);
    const overtimeAmount = toNumber(i.overtimeAmount);
    const assignmentDailyWage = agreedWage.get(i.projectWorkerId) ?? null;
    return {
      id: i.id,
      worker: i.projectWorker,
      workerRole: i.workerRole,
      workerType: i.workerType,
      dailyWage,
      overtimeAmount,
      totalWage: round2(dailyWage + overtimeAmount),
      taskNotes: i.taskNotes,
      assignmentDailyWage,
      wageDiffersFromAssignment: assignmentDailyWage !== null && assignmentDailyWage !== dailyWage,
    };
  });

  const summary = items.reduce((s, i) => ({
    totalWorkers: s.totalWorkers + 1,
    contractWorkers: s.contractWorkers + (i.workerType === 'contract' ? 1 : 0),
    dailyWorkers: s.dailyWorkers + (i.workerType === 'daily' ? 1 : 0),
    overtimeWorkers: s.overtimeWorkers + (i.overtimeAmount > 0 ? 1 : 0),
    totalWage: round2(s.totalWage + i.totalWage),
    totalOvertime: round2(s.totalOvertime + i.overtimeAmount),
  }), emptySummary());

  return { ...shapeLog(row, summary), items };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.dailyLaborLog.findUnique({ where: { id }, include: { ...LOG_INCLUDE, ...ITEMS_INCLUDE } });
  if (!row) throw httpError('Log tenaga kerja tidak ditemukan', 404);
  return row;
};

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

const list = async ({ page = 1, limit = 20, subProjectId, startDate, endDate, projectWorkerId }) => {
  const stage = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { id: true } });
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);

  const where = {
    subProjectId,
    ...((startDate || endDate) && { workDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
    ...(projectWorkerId && { items: { some: { projectWorkerId } } }),
  };
  const [rows, total] = await Promise.all([
    prisma.dailyLaborLog.findMany({ where, include: LOG_INCLUDE, orderBy: { workDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.dailyLaborLog.count({ where }),
  ]);
  const summaries = await summariesFor(rows.map((r) => r.id));

  // Ringkasan atas SEMUA log yang cocok filter, bukan hanya halaman ini
  const [period] = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT l.id)::int AS logs, COUNT(DISTINCT i.project_worker_id)::int AS distinct_workers, ${SUMMARY_COLUMNS}
    FROM daily_labor_logs l
    LEFT JOIN daily_labor_log_items i ON i.daily_labor_log_id = l.id
    WHERE l.sub_project_id = ${subProjectId}
      AND (${startDate ?? null}::date IS NULL OR l.work_date >= ${startDate ?? null}::date)
      AND (${endDate ?? null}::date IS NULL OR l.work_date <= ${endDate ?? null}::date)
      AND (${projectWorkerId ?? null}::int IS NULL OR EXISTS (
        SELECT 1 FROM daily_labor_log_items x WHERE x.daily_labor_log_id = l.id AND x.project_worker_id = ${projectWorkerId ?? null}::int))`;

  return {
    data: rows.map((r) => shapeLog(r, summaries.get(r.id) ?? emptySummary())),
    total, page, limit,
    summary: {
      logs: period.logs,
      distinctWorkers: period.distinct_workers,
      // totalWorkers di sini = jumlah hari-orang (man-days)
      manDays: period.total_workers,
      contractManDays: period.contract_workers,
      dailyManDays: period.daily_workers,
      totalWage: toNumber(period.total_wage),
      totalOvertime: toNumber(period.total_overtime),
    },
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ------------------------------------------------------------
// WRITE
// ------------------------------------------------------------

/** Baris item dari body: bentuk & duplikat dalam satu log. */
const normalizeItems = (items) => {
  const seen = new Set();
  return items.map((item, index) => {
    if (seen.has(item.projectWorkerId)) {
      throw httpError(`Pekerja ID ${item.projectWorkerId} tercatat dua kali di log ini (baris ${index + 1})`, 400);
    }
    seen.add(item.projectWorkerId);
    const data = Object.fromEntries(ITEM_FIELDS.filter((f) => item[f] !== undefined).map((f) => [f, item[f]]));
    data.workerRole = String(data.workerRole).trim();
    data.taskNotes = typeof data.taskNotes === 'string' ? (data.taskNotes.trim() || null) : (data.taskNotes ?? null);
    data.overtimeAmount = data.overtimeAmount ?? 0;
    return { projectWorkerId: item.projectWorkerId, ...data };
  });
};

/**
 * Di dalam transaksi: kunci baris pekerja (urut id) lalu tolak kalau salah satu
 * sudah tercatat di log LAIN pada tanggal yang sama (P10). Juga memastikan
 * semua pekerja ada.
 */
const lockWorkersForDate = async (tx, workerIds, workDate, exceptLogId) => {
  const ids = [...workerIds].sort((a, b) => a - b);
  const locked = await tx.$queryRaw`SELECT id FROM project_workers WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  if (locked.length !== ids.length) {
    const found = new Set(locked.map((r) => r.id));
    throw httpError(`Pekerja tidak ditemukan: ID ${ids.filter((id) => !found.has(id)).join(', ')}`, 404);
  }

  const clashes = await tx.$queryRaw`
    SELECT w.full_name, w.worker_code, sp.sub_project_type::text AS stage, cp.project_code
    FROM daily_labor_log_items i
    JOIN daily_labor_logs l ON l.id = i.daily_labor_log_id
    JOIN project_workers w ON w.id = i.project_worker_id
    JOIN sub_projects sp ON sp.id = l.sub_project_id
    JOIN construction_projects cp ON cp.id = sp.construction_project_id
    WHERE l.work_date = ${workDate}::date AND i.project_worker_id = ANY(${ids})
      AND (${exceptLogId}::int IS NULL OR l.id <> ${exceptLogId}::int)
    ORDER BY w.full_name`;
  if (clashes.length) {
    const list = clashes.map((c) => `${c.full_name} (${c.worker_code}) di ${c.project_code} tahapan ${c.stage}`).join('; ');
    throw httpError(`Pekerja sudah tercatat di log lain pada ${toDateOnly(workDate)}: ${list}. Satu orang hanya boleh dicatat sekali per hari.`, 409);
  }
};

const create = async (payload, userId) => {
  const { subProjectId } = payload;
  const stage = await prisma.subProject.findUnique({ where: { id: subProjectId } });
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);

  const workDate = assertNotFuture(payload.workDate, 'Tanggal kerja');
  const items = normalizeItems(payload.items);
  const notes = payload.notes?.trim() || null;

  const duplicate = await prisma.dailyLaborLog.findUnique({ where: { subProjectId_workDate: { subProjectId, workDate } } });
  if (duplicate) {
    throw httpError(`Log tenaga kerja tanggal ${toDateOnly(workDate)} sudah ada untuk tahapan ini (ID ${duplicate.id}). Ubah log itu, jangan buat baru.`, 409);
  }

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId });
    const current = await tx.subProject.findUnique({ where: { id: subProjectId }, select: { status: true } });
    if (!RECORDABLE_STAGE_STATUSES.includes(current.status)) {
      throw httpError(`Tahapan berstatus "${current.status}". Log tenaga kerja hanya bisa dicatat pada tahapan yang sedang aktif.`, 409);
    }
    await lockWorkersForDate(tx, items.map((i) => i.projectWorkerId), workDate, null);

    const log = await tx.dailyLaborLog.create({ data: { subProjectId, workDate, notes, createdBy: userId } });
    await tx.dailyLaborLogItem.createMany({ data: items.map((i) => ({ ...i, dailyLaborLogId: log.id })) });
    return findOrFail(log.id, tx);
  });
  return shapeDetail(row);
};

/**
 * `items` (kalau dikirim) = daftar LENGKAP. Diselaraskan per pekerja: yang ada
 * diubah (id baris tetap — kelak dirujuk klaim), yang baru dibuat, yang tidak
 * dikirim dihapus (P9). Tanggal & tahapan tidak bisa diubah (P8).
 */
const update = async (id, payload, userId) => {
  const existing = await findOrFail(id);
  const items = payload.items ? normalizeItems(payload.items) : null;

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: existing.subProjectId });
    const data = { updatedBy: userId };
    if (payload.notes !== undefined) data.notes = payload.notes?.trim() || null;
    await tx.dailyLaborLog.update({ where: { id }, data });

    if (items) {
      await lockWorkersForDate(tx, items.map((i) => i.projectWorkerId), existing.workDate, id);
      const current = await tx.dailyLaborLogItem.findMany({ where: { dailyLaborLogId: id }, select: { id: true, projectWorkerId: true } });
      const currentByWorker = new Map(current.map((c) => [c.projectWorkerId, c.id]));
      const keep = new Set(items.map((i) => i.projectWorkerId));

      await tx.dailyLaborLogItem.deleteMany({ where: { dailyLaborLogId: id, projectWorkerId: { notIn: [...keep] } } });
      for (const { projectWorkerId, ...fields } of items) {
        const itemId = currentByWorker.get(projectWorkerId);
        if (itemId) await tx.dailyLaborLogItem.update({ where: { id: itemId }, data: fields });
      }
      const fresh = items.filter((i) => !currentByWorker.has(i.projectWorkerId));
      if (fresh.length) await tx.dailyLaborLogItem.createMany({ data: fresh.map((i) => ({ ...i, dailyLaborLogId: id })) });
    }
    return findOrFail(id, tx);
  });
  return shapeDetail(row);
};

const remove = async (id) => {
  const row = await findOrFail(id);
  await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await tx.dailyLaborLog.delete({ where: { id } }); // items ikut terhapus (CASCADE)
  });
  return { id };
};

module.exports = { list, getById, create, update, remove };
