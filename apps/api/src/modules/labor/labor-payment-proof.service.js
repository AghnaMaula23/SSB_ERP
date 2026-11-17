const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const { claimTotalsOf } = require('./labor-wage-claim.service.js');
const { postJournal, reverseJournal } = require('../finance-accounting/journal.service.js');
const { assertPeriodOpen } = require('../finance-accounting/accounting-period.service.js');
const { ACCOUNTS } = require('../finance-accounting/accounts.js');

// ============================================================
// BUKTI BAYAR UPAH (docs/claude_knowledge/plan-divisi-lapangan.md L8).
//
// Alur status: submitted --Finance--> validated | rejected
//              submitted --pengunggah--> cancelled
//              validated --Finance--> voided (koreksi: jurnal dibalik, plan Finance F6)
// Lapangan membayar pekerja di luar sistem untuk klaim `approved`, lalu
// mengunggah bukti. `validated` = klaim LUNAS dan sumber jurnal Beban Upah
// Harian Project — jurnalnya lahir di transaksi validasi, bertanggal payment_date
// (plan Finance F2, F3). `paidAmount` boleh beda dari total klaim —
// selisih hanya ditampilkan. Ditolak/batal = final; unggah bukti baru.
//
// Satu bukti AKTIF (submitted/validated) per klaim: dicek di bawah kunci baris
// klaim (FOR UPDATE), partial unique index di migrasi sebagai penjaga terakhir.
// ============================================================

const PROOF_DOC_TYPE = 'LPP';
const PROOF_DOC_PAD = 6;
const FILE_PREFIX = 'labor-payment-proofs';
const ACTIVE_STATUSES = ['submitted', 'validated'];

const CLAIM_SELECT = {
  id: true, claimCode: true, status: true, subProjectId: true, periodStart: true, periodEnd: true,
  subProject: { select: {
    id: true, subProjectType: true, status: true,
    constructionProject: { select: { id: true, projectCode: true, projectName: true } },
  } },
};

const DETAIL_INCLUDE = {
  claim: { select: CLAIM_SELECT },
  submittedByUser: { select: ACTOR_SELECT },
  validatedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
  files: { include: { file: true }, orderBy: { id: 'asc' } },
};

const LIST_INCLUDE = {
  claim: { select: CLAIM_SELECT },
  submittedByUser: { select: ACTOR_SELECT },
  _count: { select: { files: true } },
};

const round2 = (n) => Math.round(n * 100) / 100;

const shapeClaim = (claim, totalAmount) => ({
  id: claim.id,
  claimCode: claim.claimCode,
  status: claim.status,
  subProjectId: claim.subProjectId,
  subProject: claim.subProject,
  periodStart: toDateOnly(claim.periodStart),
  periodEnd: toDateOnly(claim.periodEnd),
  totalAmount,
});

const shapeHeader = (row, totalAmount) => {
  const paidAmount = toNumber(row.paidAmount);
  return {
    id: row.id,
    proofCode: row.proofCode,
    laborWageClaimId: row.fieldLaborWageClaimId,
    claim: shapeClaim(row.claim, totalAmount),
    paymentDate: toDateOnly(row.paymentDate),
    paidAmount,
    // Hanya ditampilkan (L8) — negatif = dibayar melebihi klaim
    difference: round2(totalAmount - paidAmount),
    receiverName: row.receiverName,
    notes: row.notes,
    status: row.status,
    submittedBy: shapeActor(row.submittedByUser),
    createdAt: row.createdAt,
  };
};

const shapeDetail = async (row) => {
  const totalAmount = (await claimTotalsOf([row.fieldLaborWageClaimId])).get(row.fieldLaborWageClaimId)?.totalAmount ?? 0;
  return {
    ...shapeHeader(row, totalAmount),
    validatedBy: shapeActor(row.validatedByUser),
    validatedAt: row.validatedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    voidedBy: shapeActor(row.voidedByUser),
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    files: row.files.map(({ file }) => {
      const { id, ...rest } = fileService.shapeFile(file);
      return { fileId: id, ...rest };
    }),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.fieldLaborWagePaymentProof.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Bukti bayar upah tidak ditemukan', 404);
  return row;
};

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, laborWageClaimId, subProjectId, status }) => {
  const where = {
    ...(laborWageClaimId && { fieldLaborWageClaimId: laborWageClaimId }),
    ...(subProjectId && { claim: { subProjectId } }),
    ...(status && { status }),
  };
  const [rows, total] = await Promise.all([
    prisma.fieldLaborWagePaymentProof.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.fieldLaborWagePaymentProof.count({ where }),
  ]);
  const totals = await claimTotalsOf([...new Set(rows.map((r) => r.fieldLaborWageClaimId))]);
  return {
    data: rows.map((row) => ({
      ...shapeHeader(row, totals.get(row.fieldLaborWageClaimId)?.totalAmount ?? 0),
      fileCount: row._count.files,
    })),
    total, page, limit,
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// UNGGAH & BATAL
// ============================================================

const create = async (payload, uploads, userId) => {
  const claimId = payload.laborWageClaimId;
  const claim = await prisma.fieldLaborWageClaim.findUnique({ where: { id: claimId }, select: { id: true, claimCode: true, status: true, subProjectId: true } });
  if (!claim) throw httpError(`Klaim upah dengan ID ${claimId} tidak ditemukan`, 404);
  if (claim.status !== 'approved') {
    throw httpError(`Klaim ${claim.claimCode} berstatus "${claim.status}" — bukti bayar hanya untuk klaim yang sudah disetujui Finance`, 409);
  }
  const paymentDate = assertNotFuture(payload.paymentDate, 'Tanggal bayar');

  const row = await fileService.withUploadedFiles(uploads, { prefix: FILE_PREFIX, userId }, async (tx, files) => {
    await assertContextOpen(tx, { subProjectId: claim.subProjectId });
    await assertPeriodOpen(tx, paymentDate, 'Tanggal bayar');
    // Kunci klaim: dua unggahan bersamaan antre di sini, yang kedua melihat bukti pertama
    await tx.$queryRaw`SELECT id FROM field_labor_wage_claims WHERE id = ${claimId} FOR UPDATE`;
    const active = await tx.fieldLaborWagePaymentProof.findFirst({
      where: { fieldLaborWageClaimId: claimId, status: { in: ACTIVE_STATUSES } }, select: { proofCode: true, status: true },
    });
    if (active) {
      throw httpError(`Klaim ${claim.claimCode} sudah punya bukti bayar ${active.proofCode} (${active.status}). Batalkan atau tunggu keputusan Finance dulu.`, 409);
    }
    const proofCode = await nextDocumentNumber(tx, PROOF_DOC_TYPE, { pad: PROOF_DOC_PAD });
    const created = await tx.fieldLaborWagePaymentProof.create({
      data: {
        proofCode,
        fieldLaborWageClaimId: claimId,
        paymentDate,
        paidAmount: payload.paidAmount,
        receiverName: payload.receiverName?.trim() || null,
        notes: payload.notes?.trim() || null,
        submittedBy: userId,
        files: { create: files.map((f) => ({ fileId: f.id })) },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

/** Satu transisi dari `submitted`: kunci tahapan, klaim status, kembalikan detail. */
const transition = async (row, data, { from = 'submitted', after } = {}) => {
  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.claim.subProjectId });
    await claimTransition(tx.fieldLaborWagePaymentProof, { id: row.id, status: from }, data);
    if (after) await after(tx);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

/**
 * Jurnal Beban Upah Harian Project (plan Finance 1c): Dr Beban Upah Harian Project /
 * Cr Kas/Bank sebesar paid_amount (uang yang benar-benar keluar, L8), bertanggal
 * payment_date. Dipakai juga skrip backfill (gl-backfill.js).
 */
const postProofJournal = async (tx, proofId, userId) => {
  const proof = await tx.fieldLaborWagePaymentProof.findUnique({
    where: { id: proofId },
    select: { proofCode: true, paymentDate: true, paidAmount: true,
      claim: { select: { claimCode: true, subProjectId: true, subProject: { select: { constructionProjectId: true } } } } },
  });
  const amount = toNumber(proof.paidAmount);
  return postJournal(tx, {
    sourceType: 'labor_payment_proof', sourceId: proofId,
    journalDate: proof.paymentDate,
    description: `Bayar upah ${proof.claim.claimCode} (bukti ${proof.proofCode})`,
    lines: [
      { account: ACCOUNTS.EXPENSE_DAILY_WAGES, debit: amount },
      { account: ACCOUNTS.CASH, credit: amount },
    ],
    context: { constructionProjectId: proof.claim.subProject.constructionProjectId, subProjectId: proof.claim.subProjectId },
    userId,
  });
};

/** Pengunggah membatalkan selama belum diputuskan Finance; alasan wajib. */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Bukti bayar berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  if (row.submittedBy !== userId) throw httpError('Hanya pengunggah yang boleh membatalkan bukti bayar ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return transition(row, { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
};

// ============================================================
// KEPUTUSAN FINANCE — tanpa mengubah nominal
// ============================================================

const assertFinanceQueue = (row, userId, action) => {
  if (row.status !== 'submitted') throw httpError(`Bukti bayar berstatus "${row.status}", bukan antrean Finance`, 409);
  if (row.submittedBy === userId) throw httpError(`Anda mengunggah bukti ini, jadi tidak boleh ${action} sendiri`, 403);
};

const validate = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'memvalidasinya');
  return transition(row, { status: 'validated', validatedBy: userId, validatedAt: new Date(), financeNotes: notes?.trim() || null },
    { after: (tx) => postProofJournal(tx, row.id, userId) });
};

const reject = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return transition(row, { status: 'rejected', validatedBy: userId, validatedAt: new Date(), financeNotes: notes.trim() });
};

/**
 * Koreksi setelah sah (plan Finance F6): validated → voided + jurnal balik hari ini. Klaimnya
 * kembali "approved tanpa bukti sah" (partial unique hanya submitted/validated), Lapangan
 * mengunggah bukti baru. Tahapan yang sudah ditutup menolak.
 */
const voidProof = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'validated') throw httpError(`Bukti bayar berstatus "${row.status}" — hanya bukti tervalidasi yang bisa dibatalkan sebagai koreksi`, 409);
  if (row.submittedBy === userId) throw httpError('Anda mengunggah bukti ini, jadi tidak boleh membatalkannya sendiri', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return transition(row, { status: 'voided', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() }, {
    from: 'validated',
    after: (tx) => reverseJournal(tx, { sourceType: 'labor_payment_proof', sourceId: row.id, reason: reason.trim(), userId }),
  });
};

module.exports = { list, getById, create, cancel, validate, reject, voidProof, postProofJournal };
