const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture, todayDate } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const { postJournal } = require('../finance-accounting/journal.service.js');
const { ACCOUNTS } = require('../finance-accounting/accounts.js');
const cash = require('../divisi-alat/cash.service.js');
const { totalsOf } = require('./income-record.service.js');
const { ACTIVE_CLAIM_STATUSES } = require('./billing-lock.js');

// ============================================================
// KLAIM PENDAPATAN ALAT (docs/claude_knowledge/plan-divisi-finance.md F19–F23).
//
// Alur status: submitted --Finance--> approved | rejected
//              submitted --pengaju (Divisi Alat)--> cancelled
// Tanpa tahap Admin (ERD). Klaim = rentang tanggal; SEMUA jam kerja layak di rentang itu
// ikut utuh (F22). Layak = tagihannya LUNAS (F20):
//   rental      — log ada di item tagihan verified yang lunas; tarif = tarif tagihan (100%, F21)
//   konstruksi  — log tahapan bertanggal ≤ akhir periode tagihan tahapan yang lunas;
//                 tarif = tarif default unit saat klaim (F19 — jam tidak pernah ditagih per jam)
// Approve = cash-in Kas Alat + jurnal Dr Beban Alokasi Dana Divisi Alat / Cr Kas/Bank, satu
// transaksi. Approved final (F23). Sengaja tanpa assertContextOpen, sama dengan income (F18).
// ============================================================

const CLAIM_DOC_TYPE = 'EIC';
const CLAIM_DOC_PAD = 6;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const notInActiveClaim = { claimItems: { none: { claim: { status: { in: ACTIVE_CLAIM_STATUSES } } } } };

const UNIT_SELECT = { id: true, assetCode: true, defaultHourlyRate: true, equipmentType: { select: { typeName: true } } };

const parsePeriod = ({ periodStart, periodEnd }) => {
  const start = new Date(periodStart);
  const end = assertNotFuture(periodEnd, 'Akhir periode klaim');
  if (end < start) throw httpError('Akhir periode tidak boleh sebelum awal periode', 400);
  return { start, end };
};

/** Tagihan verified yang LUNAS (total > 0, terbayar ≥ total). */
const paidRecords = async (client) => {
  const verified = await client.incomeRecord.findMany({
    where: { status: 'verified', externalSupplyProjectId: null },
    select: { id: true, subProjectId: true, externalRentalProjectId: true, periodEnd: true },
  });
  const totals = await totalsOf(verified.map((r) => r.id), client);
  return verified.filter((r) => {
    const t = totals.get(r.id);
    return t.total > 0 && t.paid >= t.total;
  });
};

/**
 * Baris layak klaim pada periode: [{ log, rate, incomeRecordItemId, context }] + unit
 * konstruksi tanpa tarif default. `ids` membatasi ke log tertentu (pengecekan ulang di
 * dalam transaksi pembuatan klaim).
 */
const eligibleRows = async (client, { start, end }, { ids, records } = {}) => {
  const paid = records ?? await paidRecords(client);
  const idFilter = ids ? { id: { in: ids } } : {};
  const rows = [];
  const missingRate = new Map();

  const rentalIds = paid.filter((r) => r.externalRentalProjectId).map((r) => r.id);
  if (rentalIds.length) {
    const items = await client.incomeRecordItem.findMany({
      where: {
        incomeRecordId: { in: rentalIds },
        equipmentWorkhourLog: { isVoided: false, workDate: { gte: start, lte: end }, ...notInActiveClaim, ...idFilter },
      },
      include: {
        incomeRecord: { select: { incomeCode: true, externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true } } } },
        equipmentWorkhourLog: { include: { equipmentItem: { select: UNIT_SELECT } } },
      },
    });
    for (const item of items) {
      const p = item.incomeRecord.externalRentalProject;
      rows.push({
        log: item.equipmentWorkhourLog, rate: toNumber(item.unitRate), incomeRecordItemId: item.id, incomeCode: item.incomeRecord.incomeCode,
        context: { contextType: 'rental', id: p.id, code: p.rentalProjectCode, name: p.rentalProjectName, subProjectType: null },
      });
    }
  }

  // Konstruksi: cakupan per tahapan = akhir periode tagihan lunas terakhir
  const coverage = new Map();
  for (const r of paid.filter((x) => x.subProjectId)) {
    if (!coverage.has(r.subProjectId) || r.periodEnd > coverage.get(r.subProjectId)) coverage.set(r.subProjectId, r.periodEnd);
  }
  for (const [subProjectId, covered] of coverage) {
    const upTo = covered < end ? covered : end;
    if (upTo < start) continue;
    const logs = await client.equipmentWorkhourLog.findMany({
      where: {
        sourceType: 'internal_project', isVoided: false, workDate: { gte: start, lte: upTo },
        subProjectEquipmentAllocation: { subProjectId }, ...notInActiveClaim, ...idFilter,
      },
      include: {
        equipmentItem: { select: UNIT_SELECT },
        subProjectEquipmentAllocation: { select: { subProject: { select: { subProjectType: true,
          constructionProject: { select: { id: true, projectCode: true, projectName: true } } } } } },
      },
    });
    for (const log of logs) {
      const sp = log.subProjectEquipmentAllocation.subProject;
      const rate = toNumber(log.equipmentItem.defaultHourlyRate);
      if (!rate) {
        missingRate.set(log.equipmentItem.id, { equipmentItemId: log.equipmentItem.id, assetCode: log.equipmentItem.assetCode });
        continue;
      }
      rows.push({
        log, rate, incomeRecordItemId: null, incomeCode: null,
        context: { contextType: 'construction', id: sp.constructionProject.id, code: sp.constructionProject.projectCode,
          name: sp.constructionProject.projectName, subProjectId, subProjectType: sp.subProjectType },
      });
    }
  }
  rows.sort((a, b) => a.log.workDate - b.log.workDate || a.log.id - b.log.id);
  return { rows, missingRate: [...missingRate.values()], paid };
};

const lineAmount = (hours, rate) => round2(hours * rate);

/** Kelompokkan baris → konteks → unit. Dipakai pratinjau dan detail klaim. */
const groupRows = (rows) => {
  const contexts = new Map();
  for (const row of rows) {
    const key = `${row.context.contextType}:${row.context.subProjectId ?? row.context.id}`;
    if (!contexts.has(key)) contexts.set(key, { ...row.context, totalHours: 0, totalAmount: 0, units: new Map() });
    const ctx = contexts.get(key);
    const unit = row.log.equipmentItem;
    const unitKey = `${unit.id}:${row.rate}`;
    if (!ctx.units.has(unitKey)) {
      ctx.units.set(unitKey, { equipmentItemId: unit.id, assetCode: unit.assetCode, typeName: unit.equipmentType.typeName, rate: row.rate, hours: 0, amount: 0, logs: [] });
    }
    const u = ctx.units.get(unitKey);
    const hours = toNumber(row.log.totalWorkhour);
    const amount = row.amount ?? lineAmount(hours, row.rate);
    u.logs.push({ equipmentWorkhourLogId: row.log.id, workDate: toDateOnly(row.log.workDate), hours, amount, incomeCode: row.incomeCode });
    u.hours = round2(u.hours + hours); u.amount = round2(u.amount + amount);
    ctx.totalHours = round2(ctx.totalHours + hours); ctx.totalAmount = round2(ctx.totalAmount + amount);
  }
  return [...contexts.values()].map((c) => ({ ...c, units: [...c.units.values()] }));
};

/** Jam kerja dalam rentang yang belum layak (tagihannya belum ada/belum lunas) — informasi. */
const pendingOf = async ({ start, end }, eligibleIds) => {
  const logs = await prisma.equipmentWorkhourLog.findMany({
    where: {
      sourceType: { in: ['internal_project', 'external_rental'] }, isVoided: false, workDate: { gte: start, lte: end },
      ...notInActiveClaim, id: { notIn: [...eligibleIds] },
    },
    select: {
      totalWorkhour: true,
      subProjectEquipmentAllocation: { select: { subProject: { select: { id: true, subProjectType: true, constructionProject: { select: { projectCode: true, projectName: true } } } } } },
      equipmentPoolItem: { select: { equipmentPool: { select: { externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true } } } } } },
    },
  });
  const groups = new Map();
  for (const l of logs) {
    const sp = l.subProjectEquipmentAllocation?.subProject;
    const rp = l.equipmentPoolItem?.equipmentPool.externalRentalProject;
    const ctx = sp
      ? { contextType: 'construction', code: sp.constructionProject.projectCode, name: sp.constructionProject.projectName, subProjectType: sp.subProjectType, key: `c${sp.id}` }
      : { contextType: 'rental', code: rp?.rentalProjectCode ?? null, name: rp?.rentalProjectName ?? null, subProjectType: null, key: `r${rp?.id}` };
    if (!groups.has(ctx.key)) groups.set(ctx.key, { ...ctx, hours: 0, logCount: 0, reason: 'Tagihan klien belum dibuat, belum diverifikasi, atau belum lunas' });
    const g = groups.get(ctx.key);
    g.hours = round2(g.hours + toNumber(l.totalWorkhour)); g.logCount += 1;
  }
  return [...groups.values()].map(({ key, ...g }) => g);
};

const eligible = async (query) => {
  const period = parsePeriod(query);
  const { rows, missingRate } = await eligibleRows(prisma, period);
  const contexts = groupRows(rows);
  return {
    periodStart: toDateOnly(period.start), periodEnd: toDateOnly(period.end),
    contexts,
    totalHours: round2(contexts.reduce((s, c) => s + c.totalHours, 0)),
    totalAmount: round2(contexts.reduce((s, c) => s + c.totalAmount, 0)),
    pending: await pendingOf(period, new Set(rows.map((r) => r.log.id))),
    missingRate,
  };
};

// ------------------------------------------------------------
// READ
// ------------------------------------------------------------

/** Map(claimId → { hours, amount }) — dibulatkan per baris di SQL, sama dengan VIEW approval_queue. */
const totalsOfClaims = async (ids, client = prisma) => {
  if (!ids.length) return new Map();
  const rows = await client.$queryRaw`
    SELECT i.equipment_income_claim_id AS id, COALESCE(sum(wl.total_workhour), 0) AS hours,
      COALESCE(sum(round(wl.total_workhour * i.hourly_rate, 2)), 0) AS amount
    FROM equipment_income_claim_items i
    JOIN equipment_workhour_logs wl ON wl.id = i.equipment_workhour_log_id
    WHERE i.equipment_income_claim_id = ANY(${ids})
    GROUP BY i.equipment_income_claim_id`;
  return new Map(rows.map((r) => [r.id, { hours: toNumber(r.hours), amount: toNumber(r.amount) }]));
};

const LIST_INCLUDE = { submittedByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } };

const DETAIL_INCLUDE = {
  submittedByUser: { select: ACTOR_SELECT },
  financeReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: {
    include: {
      incomeRecordItem: { select: { incomeRecord: { select: { incomeCode: true, externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true } } } } } },
      equipmentWorkhourLog: { include: {
        equipmentItem: { select: UNIT_SELECT },
        subProjectEquipmentAllocation: { select: { subProjectId: true, subProject: { select: { subProjectType: true,
          constructionProject: { select: { id: true, projectCode: true, projectName: true } } } } } },
      } },
    },
    orderBy: { id: 'asc' },
  },
};

const shapeHeader = (row, totals) => ({
  id: row.id,
  claimCode: row.claimCode,
  periodStart: toDateOnly(row.periodStart),
  periodEnd: toDateOnly(row.periodEnd),
  notes: row.notes,
  status: row.status,
  totalHours: totals?.hours ?? 0,
  totalAmount: totals?.amount ?? 0,
  submittedBy: shapeActor(row.submittedByUser),
  createdAt: row.createdAt,
});

const shapeDetail = async (row, client = prisma) => {
  const [totals, cashRow, journals] = await Promise.all([
    totalsOfClaims([row.id], client),
    client.equipmentCashTransaction.findUnique({
      where: { sourceType_sourceId: { sourceType: 'equipment_income_claim', sourceId: row.id } },
      select: { id: true, transactionCode: true, transactionDate: true, amount: true },
    }),
    client.journalEntry.findMany({
      where: { sourceType: 'equipment_income_claim', sourceId: row.id },
      select: { id: true, journalCode: true, journalDate: true }, orderBy: { id: 'asc' },
    }),
  ]);
  const rows = row.items.map((item) => {
    const log = item.equipmentWorkhourLog;
    const rental = item.incomeRecordItem?.incomeRecord;
    const sp = log.subProjectEquipmentAllocation?.subProject;
    return {
      log, rate: toNumber(item.hourlyRate), incomeCode: rental?.incomeCode ?? null,
      context: rental
        ? { contextType: 'rental', id: rental.externalRentalProject.id, code: rental.externalRentalProject.rentalProjectCode, name: rental.externalRentalProject.rentalProjectName, subProjectType: null }
        : { contextType: 'construction', id: sp.constructionProject.id, code: sp.constructionProject.projectCode, name: sp.constructionProject.projectName,
          subProjectId: log.subProjectEquipmentAllocation.subProjectId, subProjectType: sp.subProjectType },
    };
  });
  return {
    ...shapeHeader(row, totals.get(row.id)),
    contexts: groupRows(rows),
    cashTransaction: cashRow ? { ...cashRow, transactionDate: toDateOnly(cashRow.transactionDate), amount: toNumber(cashRow.amount) } : null,
    journalEntries: journals.map((j) => ({ ...j, journalDate: toDateOnly(j.journalDate) })),
    financeReviewedBy: shapeActor(row.financeReviewedByUser),
    financeReviewedAt: row.financeReviewedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.equipmentIncomeClaim.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Klaim pendapatan alat tidak ditemukan', 404);
  return row;
};

const list = async ({ page = 1, limit = 20, status, startDate, endDate }) => {
  const where = {
    ...(status && { status }),
    ...((startDate || endDate) && { periodEnd: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
  };
  const [rows, total] = await Promise.all([
    prisma.equipmentIncomeClaim.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.equipmentIncomeClaim.count({ where }),
  ]);
  const totals = await totalsOfClaims(rows.map((r) => r.id));
  return { data: rows.map((r) => ({ ...shapeHeader(r, totals.get(r.id)), logCount: r._count.items })), total, page, limit };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ------------------------------------------------------------
// AJUKAN & BATAL (Divisi Alat)
// ------------------------------------------------------------

const create = async (payload, userId) => {
  const period = parsePeriod(payload);
  const before = await eligibleRows(prisma, period);
  if (!before.rows.length) throw httpError('Tidak ada jam kerja yang layak diklaim pada periode ini — tagihan kliennya belum lunas atau sudah diklaim', 422);
  const ids = before.rows.map((r) => r.log.id).sort((a, b) => a - b);
  const recordIds = before.paid.map((r) => r.id).sort((a, b) => a - b);

  const row = await prisma.$transaction(async (tx) => {
    // Tagihan lunas yang menjadi dasar dikunci FOR SHARE (void pembayaran mengunci FOR UPDATE),
    // log dikunci FOR UPDATE (klaim lain & void jam kerja mengunci baris yang sama).
    await tx.$queryRaw`SELECT id FROM income_records WHERE id = ANY(${recordIds}) ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM equipment_workhour_logs WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const now = await eligibleRows(tx, period, { ids });
    if (now.rows.length !== ids.length) {
      throw httpError('Sebagian jam kerja baru saja diklaim atau tagihannya berubah. Muat ulang pratinjau lalu ajukan lagi.', 409);
    }
    const claimCode = await nextDocumentNumber(tx, CLAIM_DOC_TYPE, { pad: CLAIM_DOC_PAD });
    const created = await tx.equipmentIncomeClaim.create({
      data: {
        claimCode, periodStart: period.start, periodEnd: period.end, notes: payload.notes?.trim() || null, submittedBy: userId,
        items: { create: now.rows.map((r) => ({ equipmentWorkhourLogId: r.log.id, incomeRecordItemId: r.incomeRecordItemId, hourlyRate: r.rate })) },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

const transition = async (row, data, after) => {
  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.equipmentIncomeClaim, { id: row.id, status: 'submitted' }, data);
    if (after) await after(tx);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Klaim berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  if (row.submittedBy !== userId) throw httpError('Hanya pengaju yang boleh membatalkan klaim ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return transition(row, { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
};

// ------------------------------------------------------------
// KEPUTUSAN FINANCE
// ------------------------------------------------------------

const assertFinanceQueue = (row, userId, action) => {
  if (row.status !== 'submitted') throw httpError(`Klaim berstatus "${row.status}", bukan antrean Finance`, 409);
  if (row.submittedBy === userId) throw httpError(`Anda mengajukan klaim ini, jadi tidak boleh ${action} sendiri`, 403);
};

/** Satu transaksi: status → cash-in Kas Alat → jurnal alokasi (tanpa konteks project — klaim lintas konteks). */
const approve = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'menyetujuinya');
  return transition(row, { status: 'approved', financeReviewedBy: userId, financeReviewedAt: new Date(), financeNotes: notes?.trim() || null },
    async (tx) => {
      const { amount } = (await totalsOfClaims([row.id], tx)).get(row.id);
      await cash.recordIncomeClaimCashIn(tx, row, amount, userId);
      await postJournal(tx, {
        sourceType: 'equipment_income_claim', sourceId: row.id,
        journalDate: todayDate(),
        description: `Alokasi dana Divisi Alat — klaim ${row.claimCode}`,
        lines: [{ account: ACCOUNTS.EXPENSE_EQUIPMENT_ALLOCATION, debit: amount }, { account: ACCOUNTS.CASH, credit: amount }],
        userId,
      });
    });
};

const reject = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return transition(row, { status: 'rejected', financeReviewedBy: userId, financeReviewedAt: new Date(), financeNotes: notes.trim() });
};

module.exports = { eligible, list, getById, create, cancel, approve, reject };
