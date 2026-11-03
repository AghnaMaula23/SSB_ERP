const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// KLAIM UPAH PEKERJA (docs/claude_knowledge/plan-divisi-lapangan.md L5–L8).
//
// Alur status (5 nilai, pola pengajuan dana lapangan):
//   submitted --Admin validasi--> waiting_finance_approval --Finance--> approved
//   submitted --Admin tolak--> rejected
//   waiting_finance_approval --Finance tolak--> rejected
//   submitted | waiting_finance_approval --pengaju--> cancelled
//
// L5: Lapangan memilih rentang bebas; SEMUA log tahapan itu dalam rentang yang
// belum ada di klaim aktif ikut utuh. L6: klaim menyalin baris (snapshot) dan
// log di klaim aktif terkunci — dijaga labor-log.service lewat assertLogUnclaimed.
// Klaim aktif = submitted / waiting_finance_approval / approved; ditolak/batal
// membuka lognya lagi. `approved` tidak membuat jurnal: Lapangan membayar di luar
// sistem lalu mengunggah bukti (L8, labor-payment-proof.service). Total tidak disimpan.
//
// Satu log hanya di satu klaim aktif. Dijaga dengan mengunci baris log FOR UPDATE:
// dua klaim bersamaan antre di baris yang sama, dan ubah/hapus log (yang juga
// mengunci barisnya) tidak bisa menyelip di antara snapshot dan simpan.
// ============================================================

const CLAIM_DOC_TYPE = 'LWC';
const CLAIM_DOC_PAD = 6;

const ACTIVE_STATUSES = ['submitted', 'waiting_finance_approval', 'approved'];
const CANCELLABLE_STATUSES = ['submitted', 'waiting_finance_approval'];
const ACTIVE_PROOF_STATUSES = ['submitted', 'validated'];

const SUB_PROJECT_SELECT = {
  id: true, subProjectType: true, status: true,
  constructionProject: { select: { id: true, projectCode: true, projectName: true } },
};
const PROOF_SELECT = { id: true, proofCode: true, paymentDate: true, paidAmount: true, status: true, createdAt: true };

const DETAIL_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  requestedByUser: { select: ACTOR_SELECT },
  adminValidatedByUser: { select: ACTOR_SELECT },
  financeReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: { orderBy: [{ workDate: 'asc' }, { workerName: 'asc' }] },
  paymentProofs: { select: PROOF_SELECT, orderBy: { id: 'asc' } },
};

const LIST_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  requestedByUser: { select: ACTOR_SELECT },
  paymentProofs: { where: { status: { in: ACTIVE_PROOF_STATUSES } }, select: PROOF_SELECT },
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Siapa yang menolak, dibaca dari kolom keputusan (pola request material R1). */
const rejectedBy = (row) => {
  if (row.status !== 'rejected') return null;
  return row.financeReviewedAt ? 'finance' : 'admin';
};

const shapeProof = (p) => ({
  id: p.id, proofCode: p.proofCode, paymentDate: toDateOnly(p.paymentDate), paidAmount: toNumber(p.paidAmount), status: p.status,
});

/** Bukti aktif (submitted/validated) — paling banyak satu (L8, partial unique index). */
const activePayment = (proofs) => {
  const active = proofs.find((p) => ACTIVE_PROOF_STATUSES.includes(p.status));
  return active ? shapeProof(active) : null;
};

/**
 * Total per klaim: Map(id → { totalAmount, workerCount, manDays }).
 * Rumus sama dengan shapeItem (P2: upah + lembur, tanpa pengali).
 */
const claimTotalsOf = async (ids, client = prisma) => {
  if (!ids.length) return new Map();
  const rows = await client.$queryRaw`
    SELECT field_labor_wage_claim_id AS id, SUM(daily_wage + overtime_amount) AS amount,
      COUNT(DISTINCT project_worker_id)::int AS workers, COUNT(*)::int AS man_days
    FROM field_labor_wage_claim_items
    WHERE field_labor_wage_claim_id = ANY(${ids})
    GROUP BY field_labor_wage_claim_id`;
  return new Map(rows.map((r) => [r.id, { totalAmount: toNumber(r.amount), workerCount: r.workers, manDays: r.man_days }]));
};

const EMPTY_TOTALS = { totalAmount: 0, workerCount: 0, manDays: 0 };

/**
 * Klaim AKTIF yang memuat tiap log: Map(logId → { id, claimCode, status }).
 * Dipakai list log (`claim`), pengunci log (L6), dan pemilih log saat mengklaim.
 */
const activeClaimsOfLogs = async (logIds, client = prisma) => {
  if (!logIds.length) return new Map();
  const rows = await client.$queryRaw`
    SELECT DISTINCT li.daily_labor_log_id AS log_id, c.id, c.claim_code, c.status::text AS status
    FROM field_labor_wage_claim_items ci
    JOIN field_labor_wage_claims c ON c.id = ci.field_labor_wage_claim_id
    JOIN daily_labor_log_items li ON li.id = ci.daily_labor_log_item_id
    WHERE li.daily_labor_log_id = ANY(${logIds}) AND c.status::text = ANY(${ACTIVE_STATUSES})`;
  return new Map(rows.map((r) => [r.log_id, { id: r.id, claimCode: r.claim_code, status: r.status }]));
};

/**
 * Di DALAM transaksi ubah/hapus log: kunci baris log (antre dengan klaim yang
 * sedang dibuat) lalu tolak kalau log ada di klaim aktif (L6).
 */
const assertLogUnclaimed = async (tx, logId) => {
  await tx.$queryRaw`SELECT id FROM daily_labor_logs WHERE id = ${logId} FOR UPDATE`;
  const claim = (await activeClaimsOfLogs([logId], tx)).get(logId);
  if (claim) {
    throw httpError(`Log ini masuk klaim upah ${claim.claimCode} (${claim.status}) dan terkunci. Ubah setelah klaim ditolak atau dibatalkan.`, 409);
  }
};

const shapeItem = (item) => {
  const dailyWage = toNumber(item.dailyWage);
  const overtimeAmount = toNumber(item.overtimeAmount);
  return {
    id: item.id,
    workDate: toDateOnly(item.workDate),
    dailyLaborLogItemId: item.dailyLaborLogItemId,
    projectWorkerId: item.projectWorkerId,
    workerCode: item.workerCode,
    workerName: item.workerName,
    workerRole: item.workerRole,
    workerType: item.workerType,
    dailyWage,
    overtimeAmount,
    totalWage: round2(dailyWage + overtimeAmount),
    taskNotes: item.taskNotes,
  };
};

/** Rekap per orang untuk pemeriksa klaim: hari, upah, lembur, total. */
const perWorkerOf = (items) => {
  const byWorker = new Map();
  for (const i of items) {
    const w = byWorker.get(i.projectWorkerId) ?? {
      projectWorkerId: i.projectWorkerId, workerCode: i.workerCode, workerName: i.workerName,
      days: 0, totalDailyWage: 0, totalOvertime: 0, totalWage: 0,
    };
    w.days += 1;
    w.totalDailyWage = round2(w.totalDailyWage + i.dailyWage);
    w.totalOvertime = round2(w.totalOvertime + i.overtimeAmount);
    w.totalWage = round2(w.totalWage + i.totalWage);
    byWorker.set(i.projectWorkerId, w);
  }
  return [...byWorker.values()].sort((a, b) => a.workerName.localeCompare(b.workerName));
};

const shapeHeader = (row, totals) => ({
  id: row.id,
  claimCode: row.claimCode,
  subProjectId: row.subProjectId,
  subProject: row.subProject ?? null,
  periodStart: toDateOnly(row.periodStart),
  periodEnd: toDateOnly(row.periodEnd),
  notes: row.notes,
  status: row.status,
  rejectedBy: rejectedBy(row),
  ...totals,
  payment: activePayment(row.paymentProofs),
  requestedBy: shapeActor(row.requestedByUser),
  createdAt: row.createdAt,
});

const shapeDetail = (row) => {
  const items = row.items.map(shapeItem);
  const totals = {
    totalAmount: round2(items.reduce((sum, i) => sum + i.totalWage, 0)),
    workerCount: new Set(items.map((i) => i.projectWorkerId)).size,
    manDays: items.length,
  };
  // Dibayar = bukti `validated` (paling banyak satu). Belum lunas → null, bukan 0.
  const validated = row.paymentProofs.find((p) => p.status === 'validated');
  const paidAmount = validated ? toNumber(validated.paidAmount) : null;
  return {
    ...shapeHeader(row, totals),
    paidAmount,
    // Hanya ditampilkan (L8) — negatif = dibayar melebihi klaim
    difference: paidAmount === null ? null : round2(totals.totalAmount - paidAmount),
    adminValidatedBy: shapeActor(row.adminValidatedByUser),
    adminValidatedAt: row.adminValidatedAt,
    adminNotes: row.adminNotes,
    financeReviewedBy: shapeActor(row.financeReviewedByUser),
    financeReviewedAt: row.financeReviewedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    items,
    perWorker: perWorkerOf(items),
    paymentProofs: row.paymentProofs.map(shapeProof),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.fieldLaborWageClaim.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Klaim upah tidak ditemukan', 404);
  return row;
};

const assertNotOwnClaim = (row, userId, action) => {
  if (row.requestedBy === userId) {
    throw httpError(`Anda mengajukan klaim ini, jadi tidak boleh ${action} sendiri`, 403);
  }
};

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, subProjectId, status, paid }) => {
  const paidProof = { paymentProofs: { some: { status: 'validated' } } };
  const where = {
    ...(subProjectId && { subProjectId }),
    ...(status && { status }),
    ...(paid === true && paidProof),
    ...(paid === false && { NOT: paidProof }),
  };
  const [rows, total] = await Promise.all([
    prisma.fieldLaborWageClaim.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.fieldLaborWageClaim.count({ where }),
  ]);
  const totals = await claimTotalsOf(rows.map((r) => r.id));
  return { data: rows.map((row) => shapeHeader(row, totals.get(row.id) ?? EMPTY_TOTALS)), total, page, limit };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// AJUKAN & BATAL
// ============================================================

const create = async (payload, userId) => {
  const { subProjectId } = payload;
  const stage = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { id: true } });
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);

  const periodEnd = assertNotFuture(payload.periodEnd, 'Akhir periode');
  const periodStart = new Date(payload.periodStart);
  if (toDateOnly(periodStart) > toDateOnly(periodEnd)) throw httpError('Awal periode tidak boleh setelah akhir periode', 400);

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId });
    // Urut id supaya dua klaim yang bersinggungan mengunci dengan urutan sama (bebas deadlock)
    const logs = await tx.$queryRaw`
      SELECT id FROM daily_labor_logs
      WHERE sub_project_id = ${subProjectId} AND work_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      ORDER BY id FOR UPDATE`;
    const claimed = await activeClaimsOfLogs(logs.map((l) => l.id), tx);
    const logIds = logs.map((l) => l.id).filter((id) => !claimed.has(id));
    if (!logIds.length) {
      const period = `${toDateOnly(periodStart)} s/d ${toDateOnly(periodEnd)}`;
      throw httpError(logs.length
        ? `Semua ${logs.length} log tenaga kerja pada ${period} sudah masuk klaim aktif`
        : `Tidak ada log tenaga kerja tahapan ini pada ${period}`, 409);
    }

    const logItems = await tx.dailyLaborLogItem.findMany({
      where: { dailyLaborLogId: { in: logIds } },
      include: {
        dailyLaborLog: { select: { workDate: true } },
        projectWorker: { select: { workerCode: true, fullName: true } },
      },
    });
    const claimCode = await nextDocumentNumber(tx, CLAIM_DOC_TYPE, { pad: CLAIM_DOC_PAD });
    const created = await tx.fieldLaborWageClaim.create({
      data: {
        claimCode,
        subProjectId,
        periodStart,
        periodEnd,
        notes: payload.notes?.trim() || null,
        requestedBy: userId,
        items: {
          create: logItems.map((i) => ({
            dailyLaborLogItemId: i.id,
            projectWorkerId: i.projectWorkerId,
            workDate: i.dailyLaborLog.workDate,
            workerCode: i.projectWorker.workerCode,
            workerName: i.projectWorker.fullName,
            workerRole: i.workerRole,
            workerType: i.workerType,
            dailyWage: i.dailyWage,
            overtimeAmount: i.overtimeAmount,
            taskNotes: i.taskNotes,
          })),
        },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

/** Pengaju membatalkan selama Finance belum menyetujui; alasan wajib. Log terbuka lagi. */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (!CANCELLABLE_STATUSES.includes(row.status)) {
    throw httpError(`Klaim berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  }
  if (row.requestedBy !== userId) throw httpError('Hanya pengaju yang boleh membatalkan klaim ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return decide(row, { in: CANCELLABLE_STATUSES },
    { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
};

// ============================================================
// KEPUTUSAN ADMIN & FINANCE — tanpa mengubah nominal
// ============================================================

/** Satu transisi: kunci tahapan, klaim status, kembalikan detail. */
const decide = async (row, fromStatus, data) => {
  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.fieldLaborWageClaim, { id: row.id, status: fromStatus }, data);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

/** Admin memeriksa kehadiran & upah per baris di sini (P1), lalu meneruskan. */
const validate = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Klaim berstatus "${row.status}", bukan antrean Admin`, 409);
  assertNotOwnClaim(row, userId, 'memvalidasinya');
  return decide(row, 'submitted', {
    status: 'waiting_finance_approval',
    adminValidatedBy: userId,
    adminValidatedAt: new Date(),
    adminNotes: notes?.trim() || null,
  });
};

const approve = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'waiting_finance_approval') throw httpError(`Klaim berstatus "${row.status}", bukan antrean Finance`, 409);
  assertNotOwnClaim(row, userId, 'menyetujuinya');
  // Pemisahan tugas saat role dirangkap (admin + finance): pemeriksa kedua wajib orang lain
  if (row.adminValidatedBy === userId) {
    throw httpError('Anda memvalidasi klaim ini sebagai Admin, jadi tidak boleh menyetujuinya sebagai Finance. Persetujuan butuh orang kedua.', 403);
  }
  return decide(row, 'waiting_finance_approval', {
    status: 'approved',
    financeReviewedBy: userId,
    financeReviewedAt: new Date(),
    financeNotes: notes?.trim() || null,
  });
};

/**
 * Wewenang menolak ditentukan status, diperiksa per PERMISSION (pola pengajuan
 * dana). Alasan wajib dan final — log terbuka lagi untuk diperbaiki & diklaim ulang.
 */
const REJECT_RULES = {
  submitted: {
    permission: 'labor-claim:validate',
    deniedMessage: 'Klaim di antrean Admin hanya bisa ditolak pemegang wewenang validasi Admin',
    data: (userId, notes) => ({ status: 'rejected', adminValidatedBy: userId, adminValidatedAt: new Date(), adminNotes: notes }),
  },
  waiting_finance_approval: {
    permission: 'labor-claim:approve',
    deniedMessage: 'Klaim di antrean Finance hanya bisa ditolak pemegang wewenang approval Finance',
    data: (userId, notes) => ({ status: 'rejected', financeReviewedBy: userId, financeReviewedAt: new Date(), financeNotes: notes }),
  },
};

const reject = async (id, { notes }, user) => {
  const row = await findOrFail(id);
  const rule = REJECT_RULES[row.status];
  if (!rule) throw httpError(`Klaim berstatus "${row.status}" tidak bisa ditolak`, 409);
  if (!user.permissions.includes(rule.permission)) throw httpError(rule.deniedMessage, 403);
  assertNotOwnClaim(row, user.id, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return decide(row, row.status, rule.data(user.id, notes.trim()));
};

// activeClaimsOfLogs & assertLogUnclaimed dipakai labor-log; claimTotalsOf dipakai bukti bayar
module.exports = {
  list, getById, create, cancel, validate, approve, reject,
  activeClaimsOfLogs, assertLogUnclaimed, claimTotalsOf, ACTIVE_STATUSES,
};
