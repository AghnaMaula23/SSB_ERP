const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');
const stock = require('./material-stock.service.js');
const { lockDelivery } = require('./material-delivery.service.js');

// ============================================================
// REQUEST MATERIAL — RM-5: penerimaan (receipt).
// Keputusan desain: docs/keputusan-desain-request-material.md (H1–H3).
//
// Satu receipt aktif per delivery (= satu truk). Tanpa status validasi: sah
// begitu dicatat Lapangan bersama buktinya (wajib, konstruksi & supply).
// Konstruksi: accepted_quantity = stok masuk tahapan. Supply: dasar tagihan
// Income — penerima pihak klien wajib dicatat.
// Koreksi = batalkan (alasan wajib) lalu catat ulang.
// ============================================================

const RECEIPT_DOC_TYPE = 'RCV';
const RECEIPT_DOC_PAD = 6;
const FILE_PREFIX = 'receipt-proofs';

const INCLUDE = {
  materialDelivery: {
    select: {
      id: true, deliveryCode: true, deliveryNoteNumber: true, deliveryNoteDate: true, deliveredQuantity: true,
      materialRequest: { select: { id: true, requestCode: true, requestType: true, subProjectId: true, externalSupplyProjectId: true } },
      materialRequestItem: { select: { id: true, materialType: { select: { id: true, materialCode: true, materialName: true, unit: true } } } },
    },
  },
  attachments: { include: { file: true }, orderBy: { id: 'asc' } },
  createdByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
};

const shape = (row) => {
  const received = toNumber(row.receivedQuantity);
  const accepted = toNumber(row.acceptedQuantity);
  const delivery = row.materialDelivery;
  return {
    id: row.id,
    receiptCode: row.receiptCode,
    materialDeliveryId: row.materialDeliveryId,
    delivery: {
      id: delivery.id,
      deliveryCode: delivery.deliveryCode,
      deliveryNoteNumber: delivery.deliveryNoteNumber,
      deliveryNoteDate: toDateOnly(delivery.deliveryNoteDate),
      deliveredQuantity: toNumber(delivery.deliveredQuantity),
    },
    materialRequest: delivery.materialRequest,
    materialType: delivery.materialRequestItem.materialType,
    unit: delivery.materialRequestItem.materialType.unit,
    receivedAt: row.receivedAt,
    receivedQuantity: received,
    acceptedQuantity: accepted,
    // Turunan, tidak disimpan (H1)
    rejectedQuantity: Math.round((received - accepted) * 100) / 100,
    externalReceiverName: row.externalReceiverName,
    externalReceiverPhone: row.externalReceiverPhone,
    notes: row.notes,
    attachments: row.attachments.map((a) => fileService.shapeFile(a.file)),
    isCancelled: row.cancelledAt !== null,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    createdBy: shapeActor(row.createdByUser),
    createdAt: row.createdAt,
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.materialReceipt.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw httpError('Receipt tidak ditemukan', 404);
  return row;
};

const list = async ({ page = 1, limit = 20, materialRequestId, materialDeliveryId, subProjectId, externalSupplyProjectId, cancelled }) => {
  const requestWhere = {
    ...(materialRequestId && { id: materialRequestId }),
    ...(subProjectId && { subProjectId }),
    ...(externalSupplyProjectId && { externalSupplyProjectId }),
  };
  const where = {
    ...(materialDeliveryId && { materialDeliveryId }),
    ...(Object.keys(requestWhere).length && { materialDelivery: { materialRequest: requestWhere } }),
    ...(cancelled !== undefined && { cancelledAt: cancelled ? { not: null } : null }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialReceipt.findMany({ where, include: INCLUDE, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.materialReceipt.count({ where }),
  ]);
  return { data: rows.map(shape), total, page, limit };
};

const getById = async (id) => shape(await findOrFail(id));

const create = async (payload, uploads, userId) => {
  const delivery = await prisma.materialDelivery.findUnique({
    where: { id: payload.materialDeliveryId },
    include: { materialRequest: { select: { requestType: true } } },
  });
  if (!delivery) throw httpError(`Delivery dengan ID ${payload.materialDeliveryId} tidak ditemukan`, 404);
  if (delivery.cancelledAt) throw httpError(`Delivery ${delivery.deliveryCode} sudah dibatalkan`, 409);

  const { receivedQuantity, acceptedQuantity } = payload;
  if (acceptedQuantity > receivedQuantity) {
    throw httpError('Kuantitas diterima baik (acceptedQuantity) tidak boleh melebihi kuantitas yang datang (receivedQuantity)', 400);
  }

  const receivedAt = new Date(payload.receivedAt);
  if (receivedAt > new Date()) throw httpError('Waktu penerimaan tidak boleh di masa depan', 400);
  if (toDateOnly(receivedAt) < toDateOnly(delivery.deliveryNoteDate)) {
    throw httpError('Waktu penerimaan tidak boleh sebelum tanggal surat jalan', 400);
  }

  // Supply: material diterima pihak klien — siapa penerimanya wajib tercatat (dasar tagihan).
  // Konstruksi: penerimanya Lapangan sendiri (created_by), kolom klien tidak dipakai.
  const isSupply = delivery.materialRequest.requestType === 'external_supply';
  const receiverName = payload.externalReceiverName?.trim() || null;
  const receiverPhone = payload.externalReceiverPhone?.trim() || null;
  if (isSupply && !receiverName) throw httpError('Nama penerima di pihak klien (externalReceiverName) wajib untuk supply', 400);
  if (!isSupply && (receiverName || receiverPhone)) {
    throw httpError('Penerima eksternal hanya untuk request supply — receipt konstruksi diterima Lapangan sendiri', 400);
  }

  try {
    const row = await fileService.withUploadedFiles(uploads, { prefix: FILE_PREFIX, userId }, async (tx, files) => {
      await lockDelivery(tx, delivery.id);
      const current = await tx.materialDelivery.findUnique({ where: { id: delivery.id }, select: { cancelledAt: true } });
      if (current.cancelledAt) throw httpError(`Delivery ${delivery.deliveryCode} baru saja dibatalkan`, 409);
      const active = await tx.materialReceipt.findFirst({ where: { materialDeliveryId: delivery.id, cancelledAt: null }, select: { receiptCode: true } });
      if (active) {
        throw httpError(`Delivery ${delivery.deliveryCode} sudah diterima di ${active.receiptCode}. Kalau catatan itu salah, batalkan dulu lalu catat ulang.`, 409);
      }

      const receiptCode = await nextDocumentNumber(tx, RECEIPT_DOC_TYPE, { pad: RECEIPT_DOC_PAD });
      const created = await tx.materialReceipt.create({
        data: {
          receiptCode,
          materialDeliveryId: delivery.id,
          receivedAt,
          receivedQuantity,
          acceptedQuantity,
          externalReceiverName: receiverName,
          externalReceiverPhone: receiverPhone,
          notes: payload.notes?.trim() || null,
          createdBy: userId,
          attachments: { create: files.map((f) => ({ fileId: f.id })) },
        },
      });
      return findOrFail(created.id, tx);
    });
    return shape(row);
  } catch (err) {
    // Lapis terakhir: index unik satu receipt aktif per delivery
    if (err.code === 'P2002') throw httpError(`Delivery ${delivery.deliveryCode} baru saja diterima orang lain`, 409);
    throw err;
  }
};

/**
 * Hanya pencatatnya, alasan wajib. Untuk konstruksi, membatalkan receipt
 * mengurangi stok — ditolak kalau material itu sudah terpakai (saldo jadi minus).
 * Supply: begitu Income dibangun, receipt yang sudah ditagihkan ikut dikunci di sini.
 */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (row.cancelledAt) throw httpError(`Receipt ${row.receiptCode} sudah dibatalkan`, 409);
  if (row.createdBy !== userId) throw httpError('Hanya pencatat receipt ini yang boleh membatalkannya', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);

  const { subProjectId } = row.materialDelivery.materialRequest;
  const materialTypeId = row.materialDelivery.materialRequestItem.materialType.id;

  const updated = await prisma.$transaction(async (tx) => {
    if (subProjectId) await stock.lockSubProject(tx, subProjectId);
    await claimTransition(tx.materialReceipt, { id, cancelledAt: null },
      { cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason.trim() });
    if (subProjectId) await stock.assertNotNegative(tx, subProjectId, materialTypeId);
    return findOrFail(id, tx);
  });
  return shape(updated);
};

module.exports = { list, getById, create, cancel };
