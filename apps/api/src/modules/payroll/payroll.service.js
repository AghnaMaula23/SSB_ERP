const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const { postJournal, reverseJournal } = require('../finance-accounting/journal.service.js');
const { ACCOUNTS } = require('../finance-accounting/accounts.js');

// ============================================================
// PAYROLL BULANAN KARYAWAN TETAP (docs/claude_knowledge/plan-divisi-finance.md F27–F28, 3c).
//
// draft → finalized (nominal terkunci) → paid (jurnal Dr Beban Gaji / Cr Kas bertanggal
// payment_date) → voided (jurnal balik hari ini). cancelled dari draft/finalized.
// Satu payroll aktif per bulan (partial unique). Koreksi setelah paid = void + payroll
// pengganti (`replacesPayrollId`). Tanpa Approval Center: Finance sendiri (ERD).
//
// Total TIDAK disimpan — dihitung dari komponen (`totalsOf`). Gaji Pokok = komponen
// is_system yang dibuat dari gaji berlaku karyawan; komponen manual hanya selama draft.
// Pajak/BPJS tidak dihitung (F27): Finance mencatatnya sebagai potongan manual.
//
// Karyawan ikut payroll bulan M = aktif di bulan itu (join_date ≤ akhir bulan, end_date
// kosong atau ≥ awal bulan) DAN punya gaji berlaku pada akhir bulan. Yang aktif tanpa
// gaji dilaporkan di `skipped`, tidak diam-diam dilewati. Pro-rata tidak otomatis.
// ============================================================

const PAYROLL_DOC_TYPE = 'PRL';
const PAYROLL_DOC_PAD = 6;
const FILE_PREFIX = 'payroll-payment-proofs';
const BASE_SALARY_NAME = 'Gaji Pokok';
const OPEN_STATUSES = ['draft', 'finalized']; // belum dibayar; juga menahan tutup buku (BLOCKERS)

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const monthStart = (year, month) => new Date(Date.UTC(year, month - 1, 1));
const monthEnd = (year, month) => new Date(Date.UTC(year, month, 0)); // hari terakhir, inklusif
const periodLabel = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

const EMPLOYEE_SELECT = { id: true, employeeCode: true, fullName: true, department: true, positionName: true,
  bankName: true, accountNumber: true, accountName: true };

const ACTORS_INCLUDE = {
  createdByUser: { select: ACTOR_SELECT },
  finalizedByUser: { select: ACTOR_SELECT },
  paidByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
  replacesPayroll: { select: { id: true, payrollCode: true } },
  replacedBy: { select: { id: true, payrollCode: true, status: true }, orderBy: { id: 'asc' } },
};

const DETAIL_INCLUDE = {
  ...ACTORS_INCLUDE,
  items: {
    include: {
      employee: { select: EMPLOYEE_SELECT },
      components: { orderBy: [{ isSystem: 'desc' }, { id: 'asc' }] },
    },
    orderBy: { employee: { fullName: 'asc' } },
  },
  files: { include: { file: true }, orderBy: { id: 'asc' } },
};

/** Total per payroll, dihitung dari komponen: Map(id → { employeeCount, earnings, deductions, net }). */
const totalsOf = async (ids, client = prisma) => {
  const map = new Map(ids.map((id) => [id, { employeeCount: 0, earnings: 0, deductions: 0, net: 0 }]));
  if (!ids.length) return map;
  const rows = await client.$queryRaw`
    SELECT i.payroll_id,
      COUNT(DISTINCT i.id)::int AS employee_count,
      COALESCE(SUM(c.amount) FILTER (WHERE c.component_type = 'earning'), 0) AS earnings,
      COALESCE(SUM(c.amount) FILTER (WHERE c.component_type = 'deduction'), 0) AS deductions
    FROM payroll_items i
    LEFT JOIN payroll_item_components c ON c.payroll_item_id = i.id
    WHERE i.payroll_id = ANY(${ids}::int[])
    GROUP BY i.payroll_id`;
  for (const r of rows) {
    const earnings = toNumber(r.earnings);
    const deductions = toNumber(r.deductions);
    map.set(r.payroll_id, { employeeCount: r.employee_count, earnings, deductions, net: round2(earnings - deductions) });
  }
  return map;
};

const shapeHeader = (row, totals) => ({
  id: row.id,
  payrollCode: row.payrollCode,
  year: row.payrollYear,
  month: row.payrollMonth,
  period: periodLabel(row.payrollYear, row.payrollMonth),
  status: row.status,
  notes: row.notes,
  employeeCount: totals.employeeCount,
  totalEarnings: totals.earnings,
  totalDeductions: totals.deductions,
  totalNet: totals.net,
  replacesPayroll: row.replacesPayroll ?? null,
  replacedBy: row.replacedBy ?? [],
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
  finalizedBy: shapeActor(row.finalizedByUser),
  finalizedAt: row.finalizedAt,
  paidBy: shapeActor(row.paidByUser),
  paidAt: row.paidAt,
  paymentDate: toDateOnly(row.paymentDate),
  paymentReference: row.paymentReference,
  paymentNotes: row.paymentNotes,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  cancelReason: row.cancelReason,
  voidedBy: shapeActor(row.voidedByUser),
  voidedAt: row.voidedAt,
  voidReason: row.voidReason,
});

const shapeItem = (item) => {
  const sum = (type) => round2(item.components.filter((c) => c.componentType === type).reduce((s, c) => s + toNumber(c.amount), 0));
  const earnings = sum('earning');
  const deductions = sum('deduction');
  return {
    id: item.id,
    employee: item.employee,
    compensationId: item.compensationId,
    components: item.components.map((c) => ({
      id: c.id, componentType: c.componentType, componentName: c.componentName, amount: toNumber(c.amount), isSystem: c.isSystem, notes: c.notes,
    })),
    earnings,
    deductions,
    net: round2(earnings - deductions),
  };
};

const shapeDetail = async (row, client = prisma) => {
  const [totals, journals] = await Promise.all([
    totalsOf([row.id], client),
    client.journalEntry.findMany({
      where: { sourceType: 'payroll', sourceId: row.id },
      select: { id: true, journalCode: true, journalDate: true, reversalOfJournalEntryId: true }, orderBy: { id: 'asc' },
    }),
  ]);
  return {
    ...shapeHeader(row, totals.get(row.id)),
    items: row.items.map(shapeItem),
    files: row.files.map(({ file }) => {
      const { id, ...rest } = fileService.shapeFile(file);
      return { fileId: id, ...rest };
    }),
    journalEntries: journals.map((j) => ({ id: j.id, journalCode: j.journalCode, journalDate: toDateOnly(j.journalDate), isReversal: j.reversalOfJournalEntryId !== null })),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.payroll.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError(`Payroll dengan ID ${id} tidak ditemukan`, 404);
  return row;
};

/** Kunci baris payroll di transaksi pemanggil, lalu pastikan statusnya masih yang diharapkan. */
const lockInStatus = async (tx, id, statuses, action) => {
  await tx.$queryRaw`SELECT id FROM payrolls WHERE id = ${id} FOR UPDATE`;
  const row = await tx.payroll.findUnique({ where: { id }, select: { id: true, payrollCode: true, status: true, payrollYear: true, payrollMonth: true } });
  if (!row) throw httpError(`Payroll dengan ID ${id} tidak ditemukan`, 404);
  if (!statuses.includes(row.status)) throw httpError(`Payroll ${row.payrollCode} berstatus "${row.status}" — ${action} hanya untuk status ${statuses.join('/')}`, 409);
  return row;
};

const list = async ({ page = 1, limit = 20, year, status }) => {
  const where = { ...(year && { payrollYear: year }), ...(status && { status }) };
  const [rows, total] = await Promise.all([
    prisma.payroll.findMany({ where, include: ACTORS_INCLUDE, orderBy: [{ payrollYear: 'desc' }, { payrollMonth: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.payroll.count({ where }),
  ]);
  const totals = await totalsOf(rows.map((r) => r.id));
  return { data: rows.map((r) => shapeHeader(r, totals.get(r.id))), total, page, limit };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// Isi payroll: karyawan aktif bulan itu × gaji berlaku akhir bulan
// ============================================================

const eligibleFor = async (tx, year, month) => {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const employees = await tx.employee.findMany({
    where: { joinDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
    select: { id: true, employeeCode: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const compensations = await tx.employeeCompensation.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, effectiveStartDate: { lte: end } },
    orderBy: { effectiveStartDate: 'desc' },
  });
  const latest = new Map();
  for (const c of compensations) if (!latest.has(c.employeeId)) latest.set(c.employeeId, c);
  return {
    eligible: employees.filter((e) => latest.has(e.id)).map((e) => ({ employee: e, compensation: latest.get(e.id) })),
    skipped: employees.filter((e) => !latest.has(e.id)).map((e) => ({ ...e, reason: `Belum ada gaji pokok yang berlaku per ${toDateOnly(end)}` })),
  };
};

const createItem = (tx, payrollId, { employee, compensation }) => tx.payrollItem.create({
  data: {
    payrollId, employeeId: employee.id, compensationId: compensation.id,
    components: { create: { componentType: 'earning', componentName: BASE_SALARY_NAME, amount: compensation.baseSalary, isSystem: true } },
  },
});

const create = async ({ year, month, replacesPayrollId, notes }, userId) => {
  const label = periodLabel(year, month);
  if (replacesPayrollId) {
    const replaced = await prisma.payroll.findUnique({ where: { id: replacesPayrollId } });
    if (!replaced) throw httpError(`Payroll yang digantikan (ID ${replacesPayrollId}) tidak ditemukan`, 409);
    if (replaced.status !== 'voided') throw httpError(`Payroll ${replaced.payrollCode} berstatus "${replaced.status}" — hanya payroll yang sudah di-void yang bisa diganti`, 409);
    if (replaced.payrollYear !== year || replaced.payrollMonth !== month) {
      throw httpError(`Payroll ${replaced.payrollCode} untuk bulan ${periodLabel(replaced.payrollYear, replaced.payrollMonth)}, bukan ${label}`, 409);
    }
  }
  const { id, skipped } = await prisma.$transaction(async (tx) => {
    const active = await tx.payroll.findFirst({ where: { payrollYear: year, payrollMonth: month, status: { notIn: ['cancelled', 'voided'] } } });
    if (active) throw httpError(`Bulan ${label} sudah punya payroll aktif ${active.payrollCode} (${active.status})`, 409);
    const payrollCode = await nextDocumentNumber(tx, PAYROLL_DOC_TYPE, { pad: PAYROLL_DOC_PAD });
    // Dua pembuatan bersamaan: yang kalah ditolak partial unique payrolls_active_period_key (409)
    const payroll = await tx.payroll.create({
      data: { payrollCode, payrollYear: year, payrollMonth: month, notes: notes?.trim() || null, replacesPayrollId: replacesPayrollId ?? null, createdBy: userId },
    });
    const { eligible, skipped: missing } = await eligibleFor(tx, year, month);
    for (const entry of eligible) await createItem(tx, payroll.id, entry);
    return { id: payroll.id, skipped: missing };
  });
  return { payroll: await getById(id), skipped };
};

/**
 * Tarik ulang (draft): karyawan baru masuk, yang tidak aktif lagi dibuang, Gaji Pokok
 * diperbarui ke gaji berlaku. Komponen manual karyawan yang tetap ada DIPERTAHANKAN.
 */
const regenerate = async (id) => {
  const skipped = await prisma.$transaction(async (tx) => {
    const payroll = await lockInStatus(tx, id, ['draft'], 'tarik ulang');
    const { eligible, skipped: missing } = await eligibleFor(tx, payroll.payrollYear, payroll.payrollMonth);
    const items = await tx.payrollItem.findMany({ where: { payrollId: id } });
    const itemByEmployee = new Map(items.map((i) => [i.employeeId, i]));
    const keep = new Set(eligible.map((e) => e.employee.id));

    const dropped = items.filter((i) => !keep.has(i.employeeId)).map((i) => i.id);
    if (dropped.length) await tx.payrollItem.deleteMany({ where: { id: { in: dropped } } }); // komponen ikut (CASCADE)
    for (const entry of eligible) {
      const item = itemByEmployee.get(entry.employee.id);
      if (!item) { await createItem(tx, id, entry); continue; }
      if (item.compensationId === entry.compensation.id) continue;
      await tx.payrollItem.update({ where: { id: item.id }, data: { compensationId: entry.compensation.id } });
      await tx.payrollItemComponent.updateMany({ where: { payrollItemId: item.id, isSystem: true }, data: { amount: entry.compensation.baseSalary } });
    }
    return missing;
  });
  return { payroll: await getById(id), skipped };
};

const assertNetNotNegative = (item, employeeName) => {
  const { net } = shapeItem(item);
  if (net < 0) throw httpError(`Gaji bersih ${employeeName} menjadi negatif (Rp${net}) — potongan melebihi pendapatan`, 400);
};

/** Ganti SELURUH komponen manual satu item (draft). Gaji Pokok tidak tersentuh. */
const replaceComponents = async (id, itemId, { components }) => {
  await prisma.$transaction(async (tx) => {
    await lockInStatus(tx, id, ['draft'], 'mengubah komponen');
    const item = await tx.payrollItem.findFirst({ where: { id: itemId, payrollId: id }, include: { employee: { select: { fullName: true } } } });
    if (!item) throw httpError(`Item ${itemId} tidak ada di payroll ini`, 404);
    await tx.payrollItemComponent.deleteMany({ where: { payrollItemId: itemId, isSystem: false } });
    await tx.payrollItemComponent.createMany({
      data: components.map((c) => ({
        payrollItemId: itemId, componentType: c.componentType, componentName: c.componentName.trim(),
        amount: round2(c.amount), notes: c.notes?.trim() || null, isSystem: false,
      })),
    });
    const fresh = await tx.payrollItem.findUnique({ where: { id: itemId }, include: { components: true } });
    assertNetNotNegative(fresh, item.employee.fullName);
  });
  const row = await findOrFail(id);
  return shapeItem(row.items.find((i) => i.id === itemId));
};

/** draft → finalized: nominal dikunci. Dicek di bawah kunci baris yang sama dengan ubah komponen. */
const finalize = async (id, userId) => {
  await prisma.$transaction(async (tx) => {
    const payroll = await lockInStatus(tx, id, ['draft'], 'finalisasi');
    const row = await findOrFail(id, tx);
    if (!row.items.length) throw httpError(`Payroll ${payroll.payrollCode} belum berisi karyawan — tetapkan gaji pokok lalu tarik ulang`, 409);
    for (const item of row.items) assertNetNotNegative(item, item.employee.fullName);
    const { net } = (await totalsOf([id], tx)).get(id);
    if (net <= 0) throw httpError(`Total gaji bersih payroll ${payroll.payrollCode} Rp${net} — tidak ada yang dibayar`, 409);
    await claimTransition(tx.payroll, { id, status: 'draft' }, { status: 'finalized', finalizedBy: userId, finalizedAt: new Date() });
  });
  return getById(id);
};

const cancel = async (id, { reason }, userId) => {
  await prisma.$transaction(async (tx) => {
    await lockInStatus(tx, id, OPEN_STATUSES, 'pembatalan');
    await claimTransition(tx.payroll, { id, status: { in: OPEN_STATUSES } },
      { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
  });
  return getById(id);
};

/** finalized → paid + jurnal bertanggal payment_date (F3b). Bukti 0–10 file. */
const pay = async (id, payload, uploads, userId) => {
  const payroll = await findOrFail(id);
  if (payroll.status !== 'finalized') throw httpError(`Payroll ${payroll.payrollCode} berstatus "${payroll.status}" — hanya payroll finalized yang bisa dibayar`, 409);
  const paymentDate = assertNotFuture(payload.paymentDate, 'Tanggal bayar');
  if (paymentDate < monthStart(payroll.payrollYear, payroll.payrollMonth)) {
    throw httpError(`Tanggal bayar ${toDateOnly(paymentDate)} sebelum bulan payroll ${periodLabel(payroll.payrollYear, payroll.payrollMonth)}`, 400);
  }

  await fileService.withUploadedFiles(uploads ?? [], { prefix: FILE_PREFIX, userId }, async (tx, files) => {
    await lockInStatus(tx, id, ['finalized'], 'pembayaran');
    await claimTransition(tx.payroll, { id, status: 'finalized' }, {
      status: 'paid', paidBy: userId, paidAt: new Date(), paymentDate,
      paymentReference: payload.paymentReference?.trim() || null,
      paymentNotes: payload.notes?.trim() || null,
    });
    if (files.length) await tx.payrollPaymentFile.createMany({ data: files.map((f) => ({ payrollId: id, fileId: f.id })) });
    const { net } = (await totalsOf([id], tx)).get(id);
    await postJournal(tx, {
      sourceType: 'payroll', sourceId: id,
      journalDate: paymentDate,
      description: `Gaji karyawan ${periodLabel(payroll.payrollYear, payroll.payrollMonth)} (${payroll.payrollCode})`,
      lines: [{ account: ACCOUNTS.EXPENSE_SALARIES, debit: net }, { account: ACCOUNTS.CASH, credit: net }],
      userId,
    });
  });
  return getById(id);
};

/** Koreksi (F6): paid → voided + jurnal balik hari ini. Pengganti dibuat lewat POST dengan replacesPayrollId. */
const voidPayroll = async (id, { reason }, userId) => {
  await prisma.$transaction(async (tx) => {
    await lockInStatus(tx, id, ['paid'], 'void');
    await claimTransition(tx.payroll, { id, status: 'paid' }, { status: 'voided', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() });
    await reverseJournal(tx, { sourceType: 'payroll', sourceId: id, reason: reason.trim(), userId });
  });
  return getById(id);
};

module.exports = { list, getById, create, regenerate, replaceComponents, finalize, cancel, pay, voidPayroll };
