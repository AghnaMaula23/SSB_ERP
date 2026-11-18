const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const { postJournal, reverseJournal } = require('../finance-accounting/journal.service.js');
const { ACCOUNTS } = require('../finance-accounting/accounts.js');
const records = require('./income-record.service.js');
const { assertRecordNotClaimed } = require('./billing-lock.js');

// ============================================================
// PEMBAYARAN KLIEN (docs/claude_knowledge/plan-divisi-finance.md F15–F16).
//
// Finance mencatat uang yang sudah masuk rekening = langsung sah, tanpa verifikasi kedua.
// Jurnal Dr Kas/Bank / Cr Piutang Usaha bertanggal payment_date (tanggal di rekening
// koran, F3b). Tanpa kolom status: pembatalan = voided_* + jurnal balik hari ini.
// Σ pembayaran tidak boleh melebihi tagihan; dicek di bawah kunci baris income record,
// yang juga dikunci void record — keduanya tidak bisa saling melewati.
// PPh/potongan klien belum ditangani (F16): lunas = Σ amount = tagihan.
// ============================================================

// PAY, bukan RCV: RCV milik penerimaan material (RM-5) — berbagi counter membuat nomor dua
// dokumen berbeda saling menyela dan ambigu (plan Finance bagian 8, perubahan 17 Nov 2026).
const PAYMENT_DOC_TYPE = 'PAY';
const PAYMENT_DOC_PAD = 6;
const FILE_PREFIX = 'income-payment-proofs';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const RECORD_SELECT = { id: true, incomeCode: true, status: true };

const LIST_INCLUDE = {
  incomeRecord: { select: RECORD_SELECT },
  recordedByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
  _count: { select: { files: true } },
};

const DETAIL_INCLUDE = { ...LIST_INCLUDE, files: { include: { file: true }, orderBy: { id: 'asc' } } };

const shapeHeader = (row) => ({
  id: row.id,
  paymentCode: row.paymentCode,
  incomeRecordId: row.incomeRecordId,
  incomeRecord: row.incomeRecord,
  paymentDate: toDateOnly(row.paymentDate),
  amount: toNumber(row.amount),
  payerName: row.payerName,
  paymentMethod: row.paymentMethod,
  referenceNumber: row.referenceNumber,
  notes: row.notes,
  recordedBy: shapeActor(row.recordedByUser),
  createdAt: row.createdAt,
  isVoided: row.voidedAt !== null,
  voidedBy: shapeActor(row.voidedByUser),
  voidedAt: row.voidedAt,
  voidReason: row.voidReason,
  fileCount: row._count.files,
});

const shapeDetail = async (row, client = prisma) => {
  const journals = await client.journalEntry.findMany({
    where: { sourceType: 'income_payment', sourceId: row.id },
    select: { id: true, journalCode: true, journalDate: true, reversalOfJournalEntryId: true }, orderBy: { id: 'asc' },
  });
  return {
    ...shapeHeader(row),
    files: row.files.map(({ file }) => {
      const { id, ...rest } = fileService.shapeFile(file);
      return { fileId: id, ...rest };
    }),
    journalEntries: journals.map((j) => ({ id: j.id, journalCode: j.journalCode, journalDate: toDateOnly(j.journalDate), isReversal: j.reversalOfJournalEntryId !== null })),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.incomePayment.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Pembayaran tidak ditemukan', 404);
  return row;
};

const list = async ({ page = 1, limit = 20, incomeRecordId, voided, startDate, endDate }) => {
  const where = {
    ...(incomeRecordId && { incomeRecordId }),
    ...(voided !== undefined && { voidedAt: voided ? { not: null } : null }),
    ...((startDate || endDate) && { paymentDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
  };
  const [rows, total] = await Promise.all([
    prisma.incomePayment.findMany({ where, include: LIST_INCLUDE, orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.incomePayment.count({ where }),
  ]);
  return { data: rows.map(shapeHeader), total, page, limit };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

/** Ringkasan record setelah aksi — FE langsung tahu status bayar terbaru. */
const recordStatusOf = async (recordId, client) => {
  const record = await records.findOrFail(recordId, client);
  const { total, paid } = (await records.totalsOf([recordId], client)).get(recordId);
  return { id: record.id, incomeCode: record.incomeCode, totalAmount: total, paidAmount: paid, outstandingAmount: round2(total - paid),
    paymentStatus: paid <= 0 ? 'unpaid' : paid < total ? 'partially_paid' : 'paid' };
};

const create = async (payload, uploads, userId) => {
  const recordId = payload.incomeRecordId;
  const record = await prisma.incomeRecord.findUnique({ where: { id: recordId }, select: RECORD_SELECT });
  if (!record) throw httpError(`Income record dengan ID ${recordId} tidak ditemukan`, 404);
  if (record.status !== 'verified') throw httpError(`Tagihan ${record.incomeCode} berstatus "${record.status}" — pembayaran hanya untuk tagihan terverifikasi`, 409);
  const paymentDate = assertNotFuture(payload.paymentDate, 'Tanggal bayar');
  const amount = round2(payload.amount);

  const result = await fileService.withUploadedFiles(uploads ?? [], { prefix: FILE_PREFIX, userId }, async (tx, files) => {
    await tx.$queryRaw`SELECT id FROM income_records WHERE id = ${recordId} FOR UPDATE`;
    const current = await records.findOrFail(recordId, tx);
    if (current.status !== 'verified') throw httpError(`Tagihan ${current.incomeCode} baru saja berubah status menjadi "${current.status}"`, 409);
    const { total, paid } = (await records.totalsOf([recordId], tx)).get(recordId);
    if (round2(paid + amount) > total) {
      throw httpError(`Pembayaran melebihi tagihan: sisa tagihan ${current.incomeCode} Rp${round2(total - paid)}`, 409);
    }
    const paymentCode = await nextDocumentNumber(tx, PAYMENT_DOC_TYPE, { pad: PAYMENT_DOC_PAD });
    const created = await tx.incomePayment.create({
      data: {
        paymentCode, incomeRecordId: recordId, paymentDate, amount,
        payerName: payload.payerName?.trim() || null,
        paymentMethod: payload.paymentMethod || null,
        referenceNumber: payload.referenceNumber?.trim() || null,
        notes: payload.notes?.trim() || null,
        recordedBy: userId,
        files: { create: files.map((f) => ({ fileId: f.id })) },
      },
    });
    await postJournal(tx, {
      sourceType: 'income_payment', sourceId: created.id,
      journalDate: paymentDate,
      description: `Pembayaran ${paymentCode} atas tagihan ${current.incomeCode}`,
      lines: [{ account: ACCOUNTS.CASH, debit: amount }, { account: ACCOUNTS.RECEIVABLE, credit: amount }],
      context: records.journalContextOf(current),
      userId,
    });
    return { payment: await findOrFail(created.id, tx), record: await recordStatusOf(recordId, tx) };
  });
  return { ...(await shapeDetail(result.payment)), record: result.record };
};

/** Koreksi (F6): void + jurnal balik hari ini. Ditolak kalau pelunasannya sudah dasar klaim alat (F20). */
const voidPayment = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.voidedAt) throw httpError(`Pembayaran ${row.paymentCode} sudah dibatalkan`, 409);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM income_records WHERE id = ${row.incomeRecordId} FOR UPDATE`;
    await assertRecordNotClaimed(tx, await tx.incomeRecord.findUnique({ where: { id: row.incomeRecordId } }));
    await claimTransition(tx.incomePayment, { id, voidedAt: null }, { voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() });
    await reverseJournal(tx, { sourceType: 'income_payment', sourceId: id, reason: reason.trim(), userId });
    return { payment: await findOrFail(id, tx), record: await recordStatusOf(row.incomeRecordId, tx) };
  });
  return { ...(await shapeDetail(result.payment)), record: result.record };
};

module.exports = { list, getById, create, voidPayment };
