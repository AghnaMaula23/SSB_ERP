const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// STOK MATERIAL per tahapan — RM-5 (docs/keputusan-desain-request-material.md H4–H6).
//
// Tidak ada tabel saldo. Saldo satu material di satu tahapan:
//   SUM(receipt aktif .accepted_quantity)   <- stok masuk, dari request konstruksi
// + SUM(adjustment_in) - SUM(used) - SUM(adjustment_out)   <- mutasi manual aktif
// dihitung saat dibaca, sama dengan saldo Kas Alat.
//
// Stok TIDAK BOLEH minus (H6). Setiap aksi yang bisa mengurangi stok (pemakaian,
// koreksi keluar, membatalkan koreksi masuk, membatalkan receipt) dijalankan
// dengan pola yang sama: kunci baris sub_projects -> tulis -> hitung ulang saldo
// -> kalau minus, lempar (transaksi batal). Kunci membuat dua pengurangan
// bersamaan antre, jadi keduanya tidak bisa lolos memakai saldo yang sama.
// ============================================================

const DECREASING = ['used', 'adjustment_out'];

/** Kunci baris tahapan — semua perubahan stok tahapan ini antre di sini. */
const lockSubProject = (tx, subProjectId) =>
  tx.$queryRaw`SELECT id FROM sub_projects WHERE id = ${subProjectId} FOR UPDATE`;

/**
 * Saldo per material untuk satu tahapan (atau satu material saja). Satu query:
 * receipt hanya dihitung dari delivery aktif milik request konstruksi tahapan ini.
 */
const balances = async (client, subProjectId, materialTypeId = null) => {
  const rows = await client.$queryRaw`
    WITH received AS (
      SELECT ri.material_type_id, SUM(r.accepted_quantity) AS qty
      FROM material_receipts r
      JOIN material_deliveries d ON d.id = r.material_delivery_id AND d.cancelled_at IS NULL
      JOIN material_requests mr ON mr.id = d.material_request_id
      JOIN material_request_items ri ON ri.id = d.material_request_item_id
      WHERE r.cancelled_at IS NULL AND mr.sub_project_id = ${subProjectId}
      GROUP BY ri.material_type_id
    ), moved AS (
      SELECT material_type_id,
        SUM(quantity) FILTER (WHERE movement_type = 'adjustment_in') AS adj_in,
        SUM(quantity) FILTER (WHERE movement_type = 'used') AS used,
        SUM(quantity) FILTER (WHERE movement_type = 'adjustment_out') AS adj_out
      FROM material_stock_movements
      WHERE cancelled_at IS NULL AND sub_project_id = ${subProjectId}
      GROUP BY material_type_id
    )
    SELECT mt.id AS material_type_id, mt.material_code, mt.material_name, mt.unit,
      COALESCE(rc.qty, 0) AS received, COALESCE(mv.adj_in, 0) AS adjustment_in,
      COALESCE(mv.used, 0) AS used, COALESCE(mv.adj_out, 0) AS adjustment_out
    FROM material_types mt
    LEFT JOIN received rc ON rc.material_type_id = mt.id
    LEFT JOIN moved mv ON mv.material_type_id = mt.id
    WHERE (rc.material_type_id IS NOT NULL OR mv.material_type_id IS NOT NULL)
      AND (${materialTypeId}::int IS NULL OR mt.id = ${materialTypeId}::int)
    ORDER BY mt.material_name`;

  return rows.map((r) => {
    const [received, adjustmentIn, used, adjustmentOut] = [r.received, r.adjustment_in, r.used, r.adjustment_out].map(toNumber);
    return {
      materialType: { id: r.material_type_id, materialCode: r.material_code, materialName: r.material_name, unit: r.unit },
      unit: r.unit,
      received, adjustmentIn, used, adjustmentOut,
      balance: Math.round((received + adjustmentIn - used - adjustmentOut) * 100) / 100,
    };
  });
};

/** Dipanggil SETELAH menulis, di transaksi yang sama, dengan tahapan sudah terkunci. */
const assertNotNegative = async (tx, subProjectId, materialTypeId) => {
  const [row] = await balances(tx, subProjectId, materialTypeId);
  if (row && row.balance < 0) {
    throw httpError(
      `Stok ${row.materialType.materialName} tidak cukup: perubahan ini membuat saldo menjadi ${row.balance} ${row.unit}. ` +
      'Stok tidak boleh kurang dari nol.',
      409
    );
  }
};

// ============================================================
// READ
// ============================================================

const assertSubProject = async (subProjectId) => {
  const sub = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { id: true } });
  if (!sub) throw httpError(`Sub-project dengan ID ${subProjectId} tidak ditemukan`, 404);
};

const getStock = async (subProjectId) => {
  await assertSubProject(subProjectId);
  return balances(prisma, subProjectId);
};

const MOVEMENT_INCLUDE = {
  materialType: { select: { id: true, materialCode: true, materialName: true, unit: true } },
  createdByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
};

const shapeMovement = (row) => ({
  id: row.id,
  subProjectId: row.subProjectId,
  materialType: row.materialType,
  unit: row.materialType.unit,
  movementType: row.movementType,
  quantity: toNumber(row.quantity),
  movementDate: toDateOnly(row.movementDate),
  notes: row.notes,
  isCancelled: row.cancelledAt !== null,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  cancelReason: row.cancelReason,
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
});

/**
 * Mutasi MANUAL saja. Stok masuk dari penerimaan dibaca lewat
 * GET /material-receipts?subProjectId=... — datanya tidak disalin ke sini (H4).
 */
const listMovements = async ({ page = 1, limit = 20, subProjectId, materialTypeId, movementType }) => {
  const where = {
    subProjectId,
    ...(materialTypeId && { materialTypeId }),
    ...(movementType && { movementType }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialStockMovement.findMany({ where, include: MOVEMENT_INCLUDE, orderBy: [{ movementDate: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.materialStockMovement.count({ where }),
  ]);
  return { data: rows.map(shapeMovement), total, page, limit };
};

// ============================================================
// WRITE
// ============================================================

/**
 * Pemakaian & koreksi opname oleh Lapangan. Koreksi wajib beralasan (CHECK).
 * Koreksi masuk boleh untuk material yang belum pernah diterima lewat sistem
 * (mis. sisa material sebelum sistem dipakai); pemakaian dibatasi saldo.
 */
const createMovement = async (payload, userId) => {
  const { subProjectId, materialTypeId, movementType, quantity } = payload;
  await assertSubProject(subProjectId);
  const type = await prisma.materialType.findUnique({ where: { id: materialTypeId } });
  if (!type) throw httpError(`Jenis material dengan ID ${materialTypeId} tidak ditemukan`, 404);
  const notes = payload.notes?.trim() || null;
  if (movementType !== 'used' && !notes) throw httpError('Koreksi stok wajib menyertakan alasan di notes', 400);
  const movementDate = assertNotFuture(payload.movementDate, 'Tanggal mutasi');

  const row = await prisma.$transaction(async (tx) => {
    await lockSubProject(tx, subProjectId);
    await assertContextOpen(tx, { subProjectId });
    const created = await tx.materialStockMovement.create({
      data: { subProjectId, materialTypeId, movementType, quantity, movementDate, notes, createdBy: userId },
    });
    if (DECREASING.includes(movementType)) await assertNotNegative(tx, subProjectId, materialTypeId);
    return tx.materialStockMovement.findUnique({ where: { id: created.id }, include: MOVEMENT_INCLUDE });
  });
  return shapeMovement(row);
};

/**
 * Salah input dikoreksi dengan membatalkan barisnya (alasan wajib), bukan baris
 * lawan — supaya total pemakaian tetap benar. Hanya pencatatnya. Membatalkan
 * koreksi masuk mengurangi stok, jadi ikut dijaga tidak minus.
 */
const cancelMovement = async (id, { reason }, userId) => {
  const row = await prisma.materialStockMovement.findUnique({ where: { id } });
  if (!row) throw httpError('Mutasi stok tidak ditemukan', 404);
  if (row.cancelledAt) throw httpError('Mutasi stok ini sudah dibatalkan', 409);
  if (row.createdBy !== userId) throw httpError('Hanya pencatat mutasi ini yang boleh membatalkannya', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await lockSubProject(tx, row.subProjectId);
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.materialStockMovement, { id, cancelledAt: null },
      { cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason.trim() });
    if (row.movementType === 'adjustment_in') await assertNotNegative(tx, row.subProjectId, row.materialTypeId);
    return tx.materialStockMovement.findUnique({ where: { id }, include: MOVEMENT_INCLUDE });
  });
  return shapeMovement(updated);
};

module.exports = { getStock, listMovements, createMovement, cancelMovement, lockSubProject, assertNotNegative, balances };
