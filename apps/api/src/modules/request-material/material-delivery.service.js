const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, pickWritable, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');

// ============================================================
// REQUEST MATERIAL — RM-4: delivery + surat jalan.
// Keputusan desain: docs/keputusan-desain-request-material.md (G1–G5).
//
// Satu delivery = satu surat jalan = satu truk = satu material. Tanpa kolom
// status: aktif atau dibatalkan (cancelled_*); diterima/belum diturunkan dari
// receipt di RM-5. Dicatat Divisi Lapangan untuk semua jenis request (G3).
// Koreksi = batalkan (alasan wajib) lalu catat ulang — tidak ada edit bebas.
// ============================================================

const DELIVERY_DOC_TYPE = 'DLV';
const DELIVERY_DOC_PAD = 6;
const FILE_PREFIX = 'delivery-notes';
const CLOSED_CONTEXT_STATUSES = ['completed', 'cancelled'];

// Field yang boleh ditulis klien — whitelist, bukan spread (lihat utils/shape.js)
const WRITABLE_FIELDS = [
  'deliveredQuantity', 'deliveryNoteNumber', 'vehicleType', 'vehicleNumber', 'driverName',
  'driverPhone', 'originLocation', 'destinationLocation', 'notes',
];

const INCLUDE = {
  materialRequest: { select: { id: true, requestCode: true, requestType: true, subProjectId: true, externalSupplyProjectId: true } },
  materialRequestItem: { select: { id: true, materialType: { select: { id: true, materialCode: true, materialName: true, unit: true } } } },
  supplier: { select: { id: true, supplierName: true } },
  deliveryNoteFile: true,
  createdByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
};

const shape = (row) => ({
  id: row.id,
  deliveryCode: row.deliveryCode,
  materialRequestId: row.materialRequestId,
  materialRequest: row.materialRequest,
  materialRequestItemId: row.materialRequestItemId,
  materialType: row.materialRequestItem.materialType,
  // Satuan milik jenis material (D1) — ikut di sini supaya FE menampilkannya di samping angka
  unit: row.materialRequestItem.materialType.unit,
  deliveredQuantity: toNumber(row.deliveredQuantity),
  supplier: row.supplier,
  deliveryNoteNumber: row.deliveryNoteNumber,
  deliveryNoteDate: toDateOnly(row.deliveryNoteDate),
  deliveryNoteFile: fileService.shapeFile(row.deliveryNoteFile),
  vehicleType: row.vehicleType,
  vehicleNumber: row.vehicleNumber,
  driverName: row.driverName,
  driverPhone: row.driverPhone,
  originLocation: row.originLocation,
  destinationLocation: row.destinationLocation,
  notes: row.notes,
  isCancelled: row.cancelledAt !== null,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  cancelReason: row.cancelReason,
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
});

const findOrFail = async (id, client = prisma) => {
  const row = await client.materialDelivery.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw httpError('Delivery tidak ditemukan', 404);
  return row;
};

const list = async ({ page = 1, limit = 20, materialRequestId, subProjectId, externalSupplyProjectId, supplierId, cancelled }) => {
  const where = {
    ...(materialRequestId && { materialRequestId }),
    ...(supplierId && { supplierId }),
    ...((subProjectId || externalSupplyProjectId) && {
      materialRequest: { ...(subProjectId && { subProjectId }), ...(externalSupplyProjectId && { externalSupplyProjectId }) },
    }),
    ...(cancelled !== undefined && { cancelledAt: cancelled ? { not: null } : null }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialDelivery.findMany({ where, include: INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.materialDelivery.count({ where }),
  ]);
  return { data: rows.map(shape), total, page, limit };
};

const getById = async (id) => shape(await findOrFail(id));

/** Request harus approved (ERD aturan 11) dan konteksnya belum ditutup (G4). */
const assertRequestDeliverable = async (itemId) => {
  const item = await prisma.materialRequestItem.findUnique({
    where: { id: itemId },
    include: {
      materialRequest: {
        include: {
          subProject: { select: { status: true, constructionProject: { select: { status: true } } } },
          externalSupplyProject: { select: { status: true, supplyProjectCode: true } },
        },
      },
    },
  });
  if (!item) throw httpError(`Item request material dengan ID ${itemId} tidak ditemukan`, 404);
  const request = item.materialRequest;
  if (request.status !== 'approved') {
    throw httpError(`Request ${request.requestCode} berstatus "${request.status}". Delivery hanya untuk request yang sudah disetujui Finance.`, 409);
  }
  const closed = request.requestType === 'internal_project'
    ? [request.subProject.status, request.subProject.constructionProject.status].find((s) => CLOSED_CONTEXT_STATUSES.includes(s))
    : CLOSED_CONTEXT_STATUSES.find((s) => s === request.externalSupplyProject.status);
  if (closed) throw httpError(`Project/tahapan request ${request.requestCode} berstatus "${closed}", tidak bisa menerima delivery`, 409);
  return item;
};

const assertSupplierActive = async (supplierId) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw httpError(`Supplier dengan ID ${supplierId} tidak ditemukan`, 404);
  if (!supplier.isActive) throw httpError(`Supplier "${supplier.supplierName}" nonaktif`, 409);
  return supplier;
};

/** Nomor surat jalan unik per supplier di antara delivery aktif — dijaga index, dicek dulu untuk pesan jelas. */
const assertNoteNumberFree = async (supplier, deliveryNoteNumber) => {
  const clash = await prisma.materialDelivery.findFirst({
    where: { supplierId: supplier.id, deliveryNoteNumber, cancelledAt: null }, select: { deliveryCode: true },
  });
  if (clash) {
    throw httpError(`Surat jalan ${deliveryNoteNumber} dari ${supplier.supplierName} sudah tercatat di ${clash.deliveryCode}. Kalau catatan itu salah, batalkan dulu lalu catat ulang.`, 409);
  }
};

const translateUniqueViolation = (err, deliveryNoteNumber) => {
  if (err.code === 'P2002') {
    return httpError(`Surat jalan ${deliveryNoteNumber} dari supplier ini baru saja dicatat orang lain`, 409);
  }
  return err;
};

/** Multipart mengirim field kosong sebagai "" — simpan sebagai NULL, bukan string kosong. */
const writableFields = (payload) => Object.fromEntries(
  Object.entries(pickWritable(payload, WRITABLE_FIELDS)).map(([k, v]) => [k, v === '' ? null : v])
);

const create = async (payload, upload, userId) => {
  const item = await assertRequestDeliverable(payload.materialRequestItemId);
  const supplier = await assertSupplierActive(payload.supplierId);
  const deliveryNoteNumber = payload.deliveryNoteNumber;
  await assertNoteNumberFree(supplier, deliveryNoteNumber);
  const deliveryNoteDate = assertNotFuture(payload.deliveryNoteDate, 'Tanggal surat jalan');

  try {
    const row = await fileService.withUploadedFile(upload, { prefix: FILE_PREFIX, userId }, async (tx, file) => {
      const deliveryCode = await nextDocumentNumber(tx, DELIVERY_DOC_TYPE, { pad: DELIVERY_DOC_PAD });
      const created = await tx.materialDelivery.create({
        data: {
          ...writableFields(payload),
          deliveryCode,
          materialRequestId: item.materialRequestId,
          materialRequestItemId: item.id,
          supplierId: supplier.id,
          deliveryNoteDate,
          deliveryNoteFileId: file.id,
          createdBy: userId,
        },
      });
      return findOrFail(created.id, tx);
    });
    return shape(row);
  } catch (err) {
    throw translateUniqueViolation(err, deliveryNoteNumber);
  }
};

/** Pencatat yang memperbaiki catatannya sendiri — sama dengan pembatalan request oleh pengaju. */
const assertOwnActiveDelivery = (row, userId, action) => {
  if (row.cancelledAt) throw httpError(`Delivery ${row.deliveryCode} sudah dibatalkan`, 409);
  if (row.createdBy !== userId) throw httpError(`Hanya pencatat delivery ini yang boleh ${action}`, 403);
};

/**
 * Ganti file surat jalan (salah foto, buram). File lama TIDAK dihapus: ditandai
 * `superseded` dan menunjuk penggantinya (L6). Klaim baris memakai file lama di
 * WHERE, supaya dua penggantian bersamaan tidak saling menimpa diam-diam.
 * RM-5: ditolak juga kalau delivery sudah punya receipt.
 */
const replaceDeliveryNote = async (id, upload, userId) => {
  const row = await findOrFail(id);
  assertOwnActiveDelivery(row, userId, 'mengganti surat jalannya');

  const updated = await fileService.withUploadedFile(upload, { prefix: FILE_PREFIX, userId }, async (tx, file) => {
    await claimTransition(tx.materialDelivery,
      { id, cancelledAt: null, deliveryNoteFileId: row.deliveryNoteFileId },
      { deliveryNoteFileId: file.id });
    await fileService.markSuperseded(tx, row.deliveryNoteFileId, file.id);
    return findOrFail(id, tx);
  });
  return shape(updated);
};

/** RM-5: ditolak kalau delivery sudah punya receipt. */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  assertOwnActiveDelivery(row, userId, 'membatalkannya');
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialDelivery, { id, cancelledAt: null },
      { cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason.trim() });
    return findOrFail(id, tx);
  });
  return shape(updated);
};

/** Total terkirim per item request, delivery batal tidak dihitung (G4). Dihitung saat dibaca. */
const deliveredByItem = async (materialRequestId) => {
  const sums = await prisma.materialDelivery.groupBy({
    by: ['materialRequestItemId'], where: { materialRequestId, cancelledAt: null }, _sum: { deliveredQuantity: true }, _count: true,
  });
  return new Map(sums.map((s) => [s.materialRequestItemId, { quantity: toNumber(s._sum.deliveredQuantity), count: s._count }]));
};

module.exports = { list, getById, create, replaceDeliveryNote, cancel, deliveredByItem };
