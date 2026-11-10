const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const { assertCategories, requestedAmountsOf } = require('./field-operational-request.service.js');

// ============================================================
// KAS LAPANGAN — LAPORAN REALISASI + NOTA (docs/plan-divisi-lapangan.md L1, L2, L4).
//
// Alur status: submitted --Finance--> validated | rejected
//              submitted --pelapor--> cancelled
// Tanpa tahap Admin: laporan adalah bukti belanja yang sudah terjadi, yang
// diperiksa Finance terhadap nota. `validated` = sumber jurnal Beban Operasional
// Lapangan (GL, belum dibangun). Koreksi = batalkan/ditolak lalu lapor ulang.
//
// Dua bentuk (L1): merujuk pengajuan `approved` tahapan yang sama, atau MENDESAK
// tanpa pengajuan dengan urgentReason wajib. Harga = harga nota; boleh melebihi
// pengajuan — Finance yang menilai (L2). Total tidak disimpan.
// ============================================================

const REPORT_DOC_TYPE = 'FER';
const REPORT_DOC_PAD = 6;
const FILE_PREFIX = 'field-expense-receipts';

const CATEGORY_SELECT = { id: true, categoryCode: true, categoryName: true };
const SUB_PROJECT_SELECT = {
  id: true, subProjectType: true, status: true,
  constructionProject: { select: { id: true, projectCode: true, projectName: true } },
};
const REQUEST_SELECT = { id: true, requestCode: true, status: true };

const DETAIL_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  request: { select: REQUEST_SELECT },
  submittedByUser: { select: ACTOR_SELECT },
  validatedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: { include: { category: { select: CATEGORY_SELECT } }, orderBy: { id: 'asc' } },
  receipts: { include: { file: true }, orderBy: { id: 'asc' } },
};

const LIST_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  request: { select: REQUEST_SELECT },
  submittedByUser: { select: ACTOR_SELECT },
  _count: { select: { items: true, receipts: true } },
};

const round2 = (n) => Math.round(n * 100) / 100;

const shapeItem = (item) => {
  const quantity = toNumber(item.quantity);
  const unitPrice = toNumber(item.unitPrice);
  return {
    id: item.id,
    categoryId: item.fieldExpenseCategoryId,
    category: item.category,
    fieldOperationalRequestItemId: item.fieldOperationalRequestItemId,
    expenseDate: toDateOnly(item.expenseDate),
    itemName: item.itemName,
    quantity,
    unit: item.unit,
    unitPrice,
    totalPrice: round2(quantity * unitPrice),
    vendorName: item.vendorName,
    notes: item.notes,
  };
};

const shapeHeader = (row, totalAmount) => ({
  id: row.id,
  reportCode: row.reportCode,
  subProjectId: row.subProjectId,
  subProject: row.subProject ?? null,
  fieldOperationalRequestId: row.fieldOperationalRequestId,
  request: row.request ? { id: row.request.id, requestCode: row.request.requestCode } : null,
  isUrgent: row.fieldOperationalRequestId === null,
  urgentReason: row.urgentReason,
  reportDate: toDateOnly(row.reportDate),
  notes: row.notes,
  status: row.status,
  totalAmount,
  submittedBy: shapeActor(row.submittedByUser),
  createdAt: row.createdAt,
});

const shapeDetail = async (row) => {
  const items = row.items.map(shapeItem);
  const header = shapeHeader(row, round2(items.reduce((sum, i) => sum + i.totalPrice, 0)));
  const requestedAmount = row.request ? (await requestedAmountsOf([row.request.id])).get(row.request.id) ?? 0 : null;
  return {
    ...header,
    request: row.request ? { ...header.request, status: row.request.status, requestedAmount } : null,
    validatedBy: shapeActor(row.validatedByUser),
    validatedAt: row.validatedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    items,
    receipts: row.receipts.map(({ file }) => {
      const { id, ...rest } = fileService.shapeFile(file);
      return { fileId: id, ...rest };
    }),
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.fieldExpenseReport.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Laporan realisasi tidak ditemukan', 404);
  return row;
};

/** Total realisasi per laporan: Map(reportId → amount). Rumus sama dengan shapeItem. */
const totalsOf = async (reportIds) => {
  if (!reportIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT field_expense_report_id AS id, SUM(ROUND(quantity * unit_price, 2)) AS amount
    FROM field_expense_report_items
    WHERE field_expense_report_id = ANY(${reportIds})
    GROUP BY field_expense_report_id`;
  return new Map(rows.map((r) => [r.id, toNumber(r.amount)]));
};

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, subProjectId, fieldOperationalRequestId, urgent, status, startDate, endDate }) => {
  const where = {
    ...(subProjectId && { subProjectId }),
    ...(urgent !== undefined && { fieldOperationalRequestId: urgent ? null : { not: null } }),
    ...(fieldOperationalRequestId && { fieldOperationalRequestId }),
    ...(status && { status }),
    ...((startDate || endDate) && { reportDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
  };
  // urgent=true + fieldOperationalRequestId bertentangan: tidak ada hasil
  if (urgent === true && fieldOperationalRequestId) return { data: [], total: 0, page, limit };

  const [rows, total] = await Promise.all([
    prisma.fieldExpenseReport.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.fieldExpenseReport.count({ where }),
  ]);
  const totals = await totalsOf(rows.map((r) => r.id));
  return {
    data: rows.map((row) => ({
      ...shapeHeader(row, totals.get(row.id) ?? 0),
      itemCount: row._count.items,
      receiptCount: row._count.receipts,
    })),
    total, page, limit,
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// LAPOR & BATAL
// ============================================================

/**
 * Pengajuan yang dirujuk: ada, `approved`, tahapan yang sama, dan setiap
 * fieldOperationalRequestItemId milik pengajuan itu. `approved` tidak punya
 * transisi keluar, jadi pengecekan di luar transaksi tidak bisa basi.
 */
const assertRequest = async (requestId, subProjectId, items) => {
  const request = await prisma.fieldOperationalRequest.findUnique({
    where: { id: requestId }, select: { id: true, requestCode: true, status: true, subProjectId: true, items: { select: { id: true } } },
  });
  if (!request) throw httpError(`Pengajuan dana dengan ID ${requestId} tidak ditemukan`, 404);
  if (request.status !== 'approved') {
    throw httpError(`Pengajuan ${request.requestCode} berstatus "${request.status}" — laporan hanya untuk pengajuan yang sudah disetujui Finance`, 409);
  }
  if (request.subProjectId !== subProjectId) {
    throw httpError(`Pengajuan ${request.requestCode} milik tahapan lain`, 409);
  }
  const own = new Set(request.items.map((i) => i.id));
  const foreign = items.filter((i) => i.fieldOperationalRequestItemId && !own.has(i.fieldOperationalRequestItemId));
  if (foreign.length) {
    throw httpError(`Baris pengajuan ${foreign.map((i) => i.fieldOperationalRequestItemId).join(', ')} bukan milik ${request.requestCode}`, 400);
  }
};

const create = async (payload, uploads, userId) => {
  const { subProjectId, items } = payload;
  // Multipart mengirim field kosong sebagai "" — perlakukan sama dengan tidak dikirim
  const requestId = payload.fieldOperationalRequestId || null;
  const urgentReason = payload.urgentReason?.trim() || null;
  // L1: tepat satu dari keduanya
  if (requestId && urgentReason) throw httpError('urgentReason hanya untuk laporan tanpa pengajuan — kosongkan salah satunya', 400);
  if (!requestId && !urgentReason) {
    throw httpError('Laporan tanpa pengajuan dana wajib menyertakan urgentReason (alasan mendesak)', 400);
  }

  const stage = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { id: true } });
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);

  const reportDate = assertNotFuture(payload.reportDate, 'Tanggal laporan');
  for (const [index, item] of items.entries()) {
    if (toDateOnly(item.expenseDate) > toDateOnly(reportDate)) {
      throw httpError(`Baris ${index + 1}: tanggal belanja tidak boleh setelah tanggal laporan`, 400);
    }
    if (!requestId && item.fieldOperationalRequestItemId) {
      throw httpError(`Baris ${index + 1}: laporan tanpa pengajuan tidak bisa merujuk baris pengajuan`, 400);
    }
  }
  await assertCategories(items);
  if (requestId) await assertRequest(requestId, subProjectId, items);

  const row = await fileService.withUploadedFiles(uploads, { prefix: FILE_PREFIX, userId }, async (tx, files) => {
    await assertContextOpen(tx, { subProjectId });
    const reportCode = await nextDocumentNumber(tx, REPORT_DOC_TYPE, { pad: REPORT_DOC_PAD });
    const created = await tx.fieldExpenseReport.create({
      data: {
        reportCode,
        fieldOperationalRequestId: requestId,
        subProjectId,
        reportDate,
        urgentReason,
        notes: payload.notes?.trim() || null,
        submittedBy: userId,
        items: {
          create: items.map((i) => ({
            fieldExpenseCategoryId: i.categoryId,
            fieldOperationalRequestItemId: i.fieldOperationalRequestItemId ?? null,
            expenseDate: new Date(i.expenseDate),
            itemName: i.itemName.trim(),
            quantity: i.quantity,
            unit: i.unit.trim(),
            unitPrice: i.unitPrice,
            vendorName: i.vendorName?.trim() || null,
            notes: i.notes?.trim() || null,
          })),
        },
        receipts: { create: files.map((f) => ({ fileId: f.id })) },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

/**
 * Pelapor boleh mengubah isi laporan selama Finance belum memutuskan. Tahapan, dasar
 * pengajuan, dan nota tetap: nota menempel pada pengajuan ke Finance, jadi menggantinya
 * lewat batalkan lalu lapor ulang supaya jejaknya utuh.
 */
const update = async (id, payload, userId) => {
  const row = await findOrFail(id);
  if (row.submittedBy !== userId) throw httpError('Hanya pelapor yang boleh mengubah laporan ini', 403);
  if (row.status !== 'submitted') throw httpError(`Laporan berstatus "${row.status}" sudah tidak bisa diubah`, 409);
  const urgentReason = payload.urgentReason?.trim() || null;
  if (row.fieldOperationalRequestId && urgentReason) throw httpError('urgentReason hanya untuk laporan tanpa pengajuan', 400);
  if (!row.fieldOperationalRequestId && !urgentReason) {
    throw httpError('Laporan tanpa pengajuan dana wajib menyertakan urgentReason (alasan mendesak)', 400);
  }

  const reportDate = assertNotFuture(payload.reportDate, 'Tanggal laporan');
  for (const [index, item] of payload.items.entries()) {
    if (toDateOnly(item.expenseDate) > toDateOnly(reportDate)) {
      throw httpError(`Baris ${index + 1}: tanggal belanja tidak boleh setelah tanggal laporan`, 400);
    }
    if (!row.fieldOperationalRequestId && item.fieldOperationalRequestItemId) {
      throw httpError(`Baris ${index + 1}: laporan tanpa pengajuan tidak bisa merujuk baris pengajuan`, 400);
    }
  }
  await assertCategories(payload.items);
  if (row.fieldOperationalRequestId) await assertRequest(row.fieldOperationalRequestId, row.subProjectId, payload.items);

  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.fieldExpenseReport, { id, status: 'submitted' }, {
      reportDate, urgentReason, notes: payload.notes?.trim() || null,
    });
    await tx.fieldExpenseReportItem.deleteMany({ where: { fieldExpenseReportId: id } });
    await tx.fieldExpenseReportItem.createMany({
      data: payload.items.map((i) => ({
        fieldExpenseReportId: id,
        fieldExpenseCategoryId: i.categoryId,
        fieldOperationalRequestItemId: i.fieldOperationalRequestItemId ?? null,
        expenseDate: new Date(i.expenseDate),
        itemName: i.itemName.trim(),
        quantity: i.quantity,
        unit: i.unit.trim(),
        unitPrice: i.unitPrice,
        vendorName: i.vendorName?.trim() || null,
        notes: i.notes?.trim() || null,
      })),
    });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

/** Pelapor membatalkan selama belum diputuskan Finance; alasan wajib. */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Laporan berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  if (row.submittedBy !== userId) throw httpError('Hanya pelapor yang boleh membatalkan laporan ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);
  return transition(row, { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
};

// ============================================================
// KEPUTUSAN FINANCE — tanpa mengubah nominal
// ============================================================

const transition = async (row, data) => {
  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.fieldExpenseReport, { id: row.id, status: 'submitted' }, data);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

const assertFinanceQueue = (row, userId, action) => {
  if (row.status !== 'submitted') throw httpError(`Laporan berstatus "${row.status}", bukan antrean Finance`, 409);
  if (row.submittedBy === userId) throw httpError(`Anda melaporkan realisasi ini, jadi tidak boleh ${action} sendiri`, 403);
};

const validate = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'memvalidasinya');
  return transition(row, { status: 'validated', validatedBy: userId, validatedAt: new Date(), financeNotes: notes?.trim() || null });
};

const reject = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  assertFinanceQueue(row, userId, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return transition(row, { status: 'rejected', validatedBy: userId, validatedAt: new Date(), financeNotes: notes.trim() });
};

module.exports = { list, getById, create, update, cancel, validate, reject };
