const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture, todayDate } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const { assertPeriodOpen } = require('./accounting-period.service.js');

// ============================================================
// JURNAL GL (docs/claude_knowledge/plan-divisi-finance.md F1–F3, F6, F7, F24).
//
// SATU-SATUNYA penulis journal_entries / journal_entry_lines. Modul sumber memanggil
// postJournal di transaksi yang sama dengan aksi bisnisnya (verify, approve, validasi,
// bayar), sehingga "sumber sah tapi jurnal belum ada" tidak mungkin terjadi. Tidak ada
// draf, tidak ada input debit-kredit bebas. Koreksi = reverseJournal (jurnal balik
// bertanggal hari ini) dari aksi void di modul sumber.
// ============================================================

const JOURNAL_DOC_TYPE = 'JRN';
const JOURNAL_DOC_PAD = 6;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Pemetaan sumber → kode dokumen & endpoint detail, untuk tautan di daftar jurnal.
 * Modul baru yang menjurnal menambah satu baris di sini (dan nilai enum-nya sudah ada).
 */
const SOURCE_REFS = {
  field_expense_report: { model: 'fieldExpenseReport', code: 'reportCode', path: (id) => `/api/field-expense-reports/${id}` },
  labor_payment_proof: { model: 'fieldLaborWagePaymentProof', code: 'proofCode', path: (id) => `/api/labor-payment-proofs/${id}` },
  material_request: { model: 'materialRequest', code: 'requestCode', path: (id) => `/api/request-material/${id}` },
  journal_adjustment: { model: 'journalEntry', code: 'journalCode', path: (id) => `/api/journal-entries/${id}` },
  income_record: { model: 'incomeRecord', code: 'incomeCode', path: (id) => `/api/income-records/${id}` },
  income_payment: { model: 'incomePayment', code: 'paymentCode', path: (id) => `/api/income-payments/${id}` },
  equipment_income_claim: { model: 'equipmentIncomeClaim', code: 'claimCode', path: (id) => `/api/equipment-income-claims/${id}` },
  opening_balance: null,
};

const CONTEXT_FIELDS = ['constructionProjectId', 'subProjectId', 'externalRentalProjectId', 'externalSupplyProjectId'];
const pickContext = (context = {}) => Object.fromEntries(CONTEXT_FIELDS.filter((f) => context[f]).map((f) => [f, context[f]]));

/**
 * Tulis satu jurnal seimbang. `lines`: [{ account: '<kode akun>', debit? | credit?, description? }].
 * Dipanggil dengan `tx` pemanggil — gagal di sini membatalkan aksi sumbernya juga.
 */
const postJournal = async (tx, { sourceType, sourceId, journalDate, description, lines, context, userId, reversalOfJournalEntryId = null }) => {
  if (!(sourceType in SOURCE_REFS)) throw httpError(`Sumber jurnal "${sourceType}" belum terdaftar di SOURCE_REFS`, 500);
  const rows = lines.map((l) => ({ account: l.account, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0), description: l.description ?? null }));
  if (rows.length < 2) throw httpError('Jurnal minimal dua baris', 500);
  for (const r of rows) {
    if (r.debit < 0 || r.credit < 0 || (r.debit > 0) === (r.credit > 0)) {
      throw httpError(`Baris jurnal akun ${r.account} harus berisi tepat satu sisi positif`, 500);
    }
  }
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  if (totalDebit !== totalCredit) throw httpError(`Jurnal tidak seimbang: debit ${totalDebit} ≠ kredit ${totalCredit}`, 500);

  await assertPeriodOpen(tx, journalDate, 'Tanggal jurnal');

  const codes = [...new Set(rows.map((r) => r.account))];
  const accounts = await tx.chartOfAccount.findMany({ where: { accountCode: { in: codes }, isActive: true }, select: { id: true, accountCode: true } });
  const idByCode = new Map(accounts.map((a) => [a.accountCode, a.id]));
  const missing = codes.filter((c) => !idByCode.has(c));
  if (missing.length) throw httpError(`Akun ${missing.join(', ')} tidak ada atau nonaktif di COA — jalankan seeder`, 500);

  const journalCode = await nextDocumentNumber(tx, JOURNAL_DOC_TYPE, { pad: JOURNAL_DOC_PAD });
  return tx.journalEntry.create({
    data: {
      journalCode, journalDate, sourceType, sourceId, description, reversalOfJournalEntryId,
      ...pickContext(context),
      createdBy: userId,
      lines: { create: rows.map((r) => ({ accountId: idByCode.get(r.account), debit: r.debit, credit: r.credit, description: r.description })) },
    },
  });
};

/**
 * Balik jurnal NON-balik milik sumber, bertanggal hari ini (F3b-3): koreksi atas bulan
 * yang sudah ditutup masuk ke bulan berjalan. Sumber tanpa jurnal (nominal 0) → null.
 * Dibalik dua kali ditolak unique index reversal_of_journal_entry_id.
 */
const reverseJournal = async (tx, { sourceType, sourceId, reason, userId }) => {
  const original = await tx.journalEntry.findFirst({
    where: { sourceType, sourceId, reversalOfJournalEntryId: null },
    include: { lines: { include: { account: { select: { accountCode: true } } } }, reversedBy: { select: { id: true } } },
  });
  if (!original) return null;
  if (original.reversedBy) throw httpError(`Jurnal ${original.journalCode} sudah pernah dibalik`, 409);
  return postJournal(tx, {
    sourceType, sourceId,
    journalDate: todayDate(),
    description: `Pembatalan ${original.journalCode}: ${reason}`,
    lines: original.lines.map((l) => ({ account: l.account.accountCode, debit: toNumber(l.credit), credit: toNumber(l.debit), description: l.description })),
    context: original,
    userId,
    reversalOfJournalEntryId: original.id,
  });
};

// ============================================================
// READ
// ============================================================

const CONTEXT_INCLUDE = {
  constructionProject: { select: { id: true, projectCode: true, projectName: true } },
  subProject: { select: { id: true, subProjectType: true } },
  externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true } },
  externalSupplyProject: { select: { id: true, supplyProjectCode: true, supplyProjectName: true } },
};

const LIST_INCLUDE = {
  ...CONTEXT_INCLUDE,
  lines: { select: { debit: true } },
  reversalOf: { select: { id: true, journalCode: true } },
  reversedBy: { select: { id: true, journalCode: true } },
  createdByUser: { select: ACTOR_SELECT },
};

/** Kode dokumen sumber per jurnal: Map(`${type}:${id}` → code). Satu query per jenis sumber. */
const sourceCodesOf = async (rows) => {
  const idsByType = new Map();
  for (const r of rows) {
    if (!SOURCE_REFS[r.sourceType]) continue;
    if (!idsByType.has(r.sourceType)) idsByType.set(r.sourceType, new Set());
    idsByType.get(r.sourceType).add(r.sourceId);
  }
  const codes = new Map();
  await Promise.all([...idsByType].map(async ([type, ids]) => {
    const ref = SOURCE_REFS[type];
    const found = await prisma[ref.model].findMany({ where: { id: { in: [...ids] } }, select: { id: true, [ref.code]: true } });
    for (const f of found) codes.set(`${type}:${f.id}`, f[ref.code]);
  }));
  return codes;
};

const shapeSource = (row, codes) => {
  const ref = SOURCE_REFS[row.sourceType];
  return {
    type: row.sourceType,
    id: row.sourceId,
    code: ref ? codes.get(`${row.sourceType}:${row.sourceId}`) ?? null : null,
    detailPath: ref ? ref.path(row.sourceId) : null,
  };
};

const shapeContext = (row) => ({
  constructionProject: row.constructionProject ?? null,
  subProject: row.subProject ?? null,
  externalRentalProject: row.externalRentalProject ?? null,
  externalSupplyProject: row.externalSupplyProject ?? null,
});

const shapeHeader = (row, codes) => ({
  id: row.id,
  journalCode: row.journalCode,
  journalDate: toDateOnly(row.journalDate),
  description: row.description,
  source: shapeSource(row, codes),
  totalAmount: round2(row.lines.reduce((s, l) => s + toNumber(l.debit), 0)),
  isReversal: row.reversalOfJournalEntryId !== null,
  reversalOf: row.reversalOf ?? null,
  reversedBy: row.reversedBy ?? null,
  context: shapeContext(row),
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
});

const list = async ({ page = 1, limit = 20, search, startDate, endDate, accountId, sourceType,
  constructionProjectId, subProjectId, externalRentalProjectId, externalSupplyProjectId }) => {
  const where = {
    ...((startDate || endDate) && { journalDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
    ...(accountId && { lines: { some: { accountId } } }),
    ...(sourceType && { sourceType }),
    ...pickContext({ constructionProjectId, subProjectId, externalRentalProjectId, externalSupplyProjectId }),
    ...(search && { OR: [
      { journalCode: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ] }),
  };
  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({ where, include: LIST_INCLUDE, orderBy: [{ journalDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.journalEntry.count({ where }),
  ]);
  const codes = await sourceCodesOf(rows);
  return { data: rows.map((r) => shapeHeader(r, codes)), total, page, limit };
};

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  lines: { include: { account: { select: { id: true, accountCode: true, accountName: true, accountType: true } } }, orderBy: { id: 'asc' } },
};

/** Akun sisi debit jurnal asal — penanda arah penyesuaian (+ menambah beban). */
const debitAccountOf = (journal) => journal.lines.find((l) => toNumber(l.debit) > 0).accountId;

const signedAmount = (adjustment, debitAccountId) => {
  const line = adjustment.lines.find((l) => l.accountId === debitAccountId);
  return round2(toNumber(line.debit) - toNumber(line.credit));
};

const getById = async (id) => {
  const row = await prisma.journalEntry.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Jurnal tidak ditemukan', 404);
  const codes = await sourceCodesOf([row]);
  const adjustments = row.sourceType === 'material_request' && !row.reversalOfJournalEntryId
    ? await prisma.journalEntry.findMany({ where: { sourceType: 'journal_adjustment', sourceId: row.id }, include: { lines: true }, orderBy: { id: 'asc' } })
    : [];
  const debitAccountId = adjustments.length ? debitAccountOf(row) : null;
  return {
    ...shapeHeader(row, codes),
    lines: row.lines.map((l) => ({
      id: l.id,
      account: l.account,
      debit: toNumber(l.debit),
      credit: toNumber(l.credit),
      description: l.description,
    })),
    adjustments: adjustments.map((a) => ({
      id: a.id, journalCode: a.journalCode, journalDate: toDateOnly(a.journalDate),
      amount: signedAmount(a, debitAccountId), description: a.description,
    })),
  };
};

// ============================================================
// PENYESUAIAN SELISIH (F7a) — hanya jurnal bersumber request material
// ============================================================

/** Sumber yang nominalnya estimasi, jadi selisih aktualnya boleh dicatat. */
const ADJUSTABLE_SOURCES = ['material_request'];

const addAdjustment = async (id, { amount, adjustmentDate, reason }, userId) => {
  const value = round2(amount);
  if (!value) throw httpError('amount tidak boleh 0', 400);
  if (!reason?.trim()) throw httpError('Alasan penyesuaian wajib diisi', 400);
  const date = assertNotFuture(adjustmentDate, 'Tanggal penyesuaian');

  const created = await prisma.$transaction(async (tx) => {
    // Kunci jurnal asal: dua penyesuaian bersamaan dihitung berurutan
    await tx.$queryRaw`SELECT id FROM journal_entries WHERE id = ${id} FOR UPDATE`;
    const original = await tx.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: { select: { accountCode: true } } } }, reversedBy: { select: { id: true } } },
    });
    if (!original) throw httpError('Jurnal tidak ditemukan', 404);
    if (!ADJUSTABLE_SOURCES.includes(original.sourceType) || original.reversalOfJournalEntryId) {
      throw httpError('Penyesuaian hanya untuk jurnal request material (nominal estimasi)', 409);
    }
    if (original.reversedBy) throw httpError(`Jurnal ${original.journalCode} sudah dibalik`, 409);
    if (original.lines.length !== 2) throw httpError('Penyesuaian hanya untuk jurnal dua baris', 409);

    const debitLine = original.lines.find((l) => toNumber(l.debit) > 0);
    const creditLine = original.lines.find((l) => toNumber(l.credit) > 0);
    const previous = await tx.journalEntry.findMany({ where: { sourceType: 'journal_adjustment', sourceId: id }, include: { lines: true } });
    const net = round2(toNumber(debitLine.debit) + previous.reduce((s, a) => s + signedAmount(a, debitLine.accountId), 0) + value);
    if (net < 0) throw httpError(`Penyesuaian membuat beban ${original.journalCode} negatif (${net})`, 409);

    const [up, down] = value > 0 ? [debitLine, creditLine] : [creditLine, debitLine];
    return postJournal(tx, {
      sourceType: 'journal_adjustment', sourceId: id,
      journalDate: date,
      description: `Penyesuaian ${original.journalCode}: ${reason.trim()}`,
      lines: [
        { account: up.account.accountCode, debit: Math.abs(value) },
        { account: down.account.accountCode, credit: Math.abs(value) },
      ],
      context: original,
      userId,
    });
  });
  return getById(created.id);
};

module.exports = { postJournal, reverseJournal, list, getById, addAdjustment, SOURCE_REFS };
