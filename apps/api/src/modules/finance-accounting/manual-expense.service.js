const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const { postJournal, reverseJournal } = require('./journal.service.js');
const { ACCOUNTS } = require('./accounts.js');

// ============================================================
// PENGELUARAN MANUAL FINANCE (docs/claude_knowledge/plan-divisi-finance.md F9, 3b).
//
// Untuk pengeluaran yang belum punya modul sendiri. Tanpa draf & tanpa kategori:
// dibuat = sah + jurnal Dr Beban Pengeluaran Manual / Cr Kas bertanggal expense_date
// (F3b — postJournal menolak bulan tertutup). Lampiran WAJIB 1–10. Koreksi = void
// (jurnal balik hari ini) lalu catat ulang.
// ============================================================

const EXPENSE_DOC_TYPE = 'MEX';
const EXPENSE_DOC_PAD = 6;
const FILE_PREFIX = 'manual-expense-attachments';
const MIN_ATTACHMENTS = 1;
const MAX_ATTACHMENTS = 10;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const LIST_INCLUDE = {
  recordedByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
  _count: { select: { files: true } },
};
const DETAIL_INCLUDE = { ...LIST_INCLUDE, files: { include: { file: true }, orderBy: { id: 'asc' } } };

const shapeHeader = (row) => ({
  id: row.id,
  expenseCode: row.expenseCode,
  expenseDate: toDateOnly(row.expenseDate),
  amount: toNumber(row.amount),
  payeeName: row.payeeName,
  paymentMethod: row.paymentMethod,
  description: row.description,
  reason: row.reason,
  recordedBy: shapeActor(row.recordedByUser),
  createdAt: row.createdAt,
  isVoided: row.voidedAt !== null,
  voidedBy: shapeActor(row.voidedByUser),
  voidedAt: row.voidedAt,
  voidReason: row.voidReason,
  attachmentCount: row._count.files,
});

const shapeDetail = async (row) => {
  const journals = await prisma.journalEntry.findMany({
    where: { sourceType: 'manual_expense', sourceId: row.id },
    select: { id: true, journalCode: true, journalDate: true, reversalOfJournalEntryId: true }, orderBy: { id: 'asc' },
  });
  return {
    ...shapeHeader(row),
    attachments: row.files.map(({ file }) => {
      const { id, ...rest } = fileService.shapeFile(file);
      return { fileId: id, ...rest };
    }),
    journalEntries: journals.map((j) => ({ id: j.id, journalCode: j.journalCode, journalDate: toDateOnly(j.journalDate), isReversal: j.reversalOfJournalEntryId !== null })),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.financeManualExpense.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Pengeluaran manual tidak ditemukan', 404);
  return row;
};

const list = async ({ page = 1, limit = 20, search, startDate, endDate, voided }) => {
  const term = search?.trim();
  const where = {
    ...(voided !== undefined && { voidedAt: voided ? { not: null } : null }),
    ...((startDate || endDate) && { expenseDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
    ...(term && { OR: [
      { expenseCode: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { payeeName: { contains: term, mode: 'insensitive' } },
    ] }),
  };
  const [rows, total] = await Promise.all([
    prisma.financeManualExpense.findMany({ where, include: LIST_INCLUDE, orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.financeManualExpense.count({ where }),
  ]);
  return { data: rows.map(shapeHeader), total, page, limit };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

const create = async (payload, uploads, userId) => {
  // Middleware sudah menolak jumlah file di luar batas; dijaga ulang di sini karena
  // service juga dipanggil seeder/skrip — lampiran adalah syarat sahnya pengeluaran (F9).
  const count = uploads?.length ?? 0;
  if (count < MIN_ATTACHMENTS || count > MAX_ATTACHMENTS) throw httpError(`Lampiran wajib ${MIN_ATTACHMENTS}–${MAX_ATTACHMENTS} file`, 400);
  const expenseDate = assertNotFuture(payload.expenseDate, 'Tanggal pengeluaran');
  const amount = round2(payload.amount);
  const description = payload.description?.trim();
  const reason = payload.reason?.trim();
  if (!description || !reason) throw httpError('Keterangan dan alasan wajib diisi', 400);

  const id = await fileService.withUploadedFiles(uploads, { prefix: FILE_PREFIX, userId }, async (tx, files) => {
    const expenseCode = await nextDocumentNumber(tx, EXPENSE_DOC_TYPE, { pad: EXPENSE_DOC_PAD });
    const created = await tx.financeManualExpense.create({
      data: {
        expenseCode, expenseDate, amount, description, reason,
        payeeName: payload.payeeName?.trim() || null,
        paymentMethod: payload.paymentMethod || null,
        recordedBy: userId,
        files: { create: files.map((f) => ({ fileId: f.id })) },
      },
    });
    await postJournal(tx, {
      sourceType: 'manual_expense', sourceId: created.id,
      journalDate: expenseDate,
      description: `Pengeluaran manual ${expenseCode}: ${description}`,
      lines: [{ account: ACCOUNTS.EXPENSE_MANUAL, debit: amount }, { account: ACCOUNTS.CASH, credit: amount }],
      userId,
    });
    return created.id;
  });
  return getById(id);
};

/** Koreksi (F6): void + jurnal balik hari ini. */
const voidExpense = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.voidedAt) throw httpError(`Pengeluaran ${row.expenseCode} sudah dibatalkan`, 409);
  await prisma.$transaction(async (tx) => {
    await claimTransition(tx.financeManualExpense, { id, voidedAt: null }, { voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() });
    await reverseJournal(tx, { sourceType: 'manual_expense', sourceId: id, reason: reason.trim(), userId });
  });
  return getById(id);
};

module.exports = { list, getById, create, voidExpense, MAX_ATTACHMENTS };
