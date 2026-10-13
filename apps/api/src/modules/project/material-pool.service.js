const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// MATERIAL POOL — daftar material milik construction project atau supply
// project (Request Material RM-1). Generic seperti equipment pool, dengan dua
// perbedaan yang disengaja (docs/keputusan-desain-request-material.md):
// - satu baris per JENIS material per pool, bukan per unit
// - tanpa penghitung total_* (D3) — jumlahan dihitung saat dibaca begitu
//   request/delivery/receipt ada
// ============================================================

const POOL_DOC_TYPE = 'MPL';
const POOL_DOC_PAD = 6;
const LIVE_POOL_STATUSES = ['draft', 'active'];

const OWNER_CONFIG = {
  construction_project: { fkField: 'constructionProjectId', model: 'constructionProject', label: 'Construction project' },
  external_supply_project: { fkField: 'externalSupplyProjectId', model: 'externalSupplyProject', label: 'External supply project' },
};

// Sama dengan equipment pool. Menutup pool tidak dibatasi di RM-1 karena belum
// ada request/inventori yang merujuk itemnya — aturannya menyusul di RM-2/RM-5.
const POOL_STATUS_TRANSITIONS = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

const POOL_INCLUDE = { createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } };
const ITEM_INCLUDE = { materialType: { select: { id: true, materialCode: true, materialName: true, unit: true, isActive: true } } };

const shapePool = (row) => ({
  id: row.id,
  ownerType: row.ownerType,
  constructionProjectId: row.constructionProjectId,
  externalSupplyProjectId: row.externalSupplyProjectId,
  poolCode: row.poolCode,
  status: row.status,
  createdAt: row.createdAt,
  createdBy: shapeActor(row.createdByUser),
  itemCount: row._count?.items,
});

// `unit` selalu ikut di sini, supaya FE bisa menampilkan satuan tepat di samping
// angka — pengaman human error untuk keputusan D1 (satu satuan per material).
const shapeItem = (row) => ({
  id: row.id,
  materialPoolId: row.materialPoolId,
  materialTypeId: row.materialTypeId,
  materialType: row.materialType,
  unit: row.materialType?.unit,
  notes: row.notes,
  createdAt: row.createdAt,
});

const findPoolOrFail = async (id) => {
  const row = await prisma.materialPool.findUnique({ where: { id }, include: POOL_INCLUDE });
  if (!row) throw httpError('Material pool tidak ditemukan', 404);
  return row;
};

const assertPoolLive = (pool) => {
  if (!LIVE_POOL_STATUSES.includes(pool.status)) {
    throw httpError(`Material pool berstatus "${pool.status}", isinya tidak bisa diubah`, 409);
  }
};

const list = async ({ page = 1, limit = 20, ownerType, constructionProjectId, externalSupplyProjectId, status }) => {
  const where = {
    ...(ownerType && { ownerType }),
    ...(constructionProjectId && { constructionProjectId }),
    ...(externalSupplyProjectId && { externalSupplyProjectId }),
    ...(status && { status }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialPool.findMany({ where, include: POOL_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.materialPool.count({ where }),
  ]);
  return { data: rows.map(shapePool), total, page, limit };
};

const getById = async (id) => {
  const pool = await findPoolOrFail(id);
  const items = await prisma.materialPoolItem.findMany({
    where: { materialPoolId: id }, include: ITEM_INCLUDE, orderBy: { id: 'asc' },
  });
  return { ...shapePool(pool), items: items.map(shapeItem) };
};

/** Kode pool dibuat sistem (MPL-000001), mengikuti pola nomor dokumen lain. */
const create = async ({ ownerType, constructionProjectId, externalSupplyProjectId }, userId) => {
  const config = OWNER_CONFIG[ownerType];
  if (!config) throw httpError(`ownerType "${ownerType}" tidak dikenal`, 400);

  const ownerId = ownerType === 'construction_project' ? constructionProjectId : externalSupplyProjectId;
  const otherId = ownerType === 'construction_project' ? externalSupplyProjectId : constructionProjectId;
  if (!ownerId) throw httpError(`${config.fkField} wajib diisi untuk ownerType "${ownerType}"`, 400);
  if (otherId) throw httpError(`Hanya ${config.fkField} yang boleh diisi untuk ownerType "${ownerType}"`, 400);

  const owner = await prisma[config.model].findUnique({ where: { id: ownerId } });
  if (!owner) throw httpError(`${config.label} dengan ID ${ownerId} tidak ditemukan`, 404);

  const pool = await prisma.$transaction(async (tx) => {
    const poolCode = await nextDocumentNumber(tx, POOL_DOC_TYPE, { pad: POOL_DOC_PAD });
    return tx.materialPool.create({
      data: { ownerType, [config.fkField]: ownerId, poolCode, createdBy: userId },
      include: POOL_INCLUDE,
    });
  });
  return shapePool(pool);
};

const changeStatus = async (id, status) => {
  const pool = await findPoolOrFail(id);
  if (pool.status === status) throw httpError(`Material pool sudah berstatus "${status}"`, 409);

  const allowed = POOL_STATUS_TRANSITIONS[pool.status];
  if (!allowed.includes(status)) {
    throw httpError(
      allowed.length === 0
        ? `Material pool berstatus "${pool.status}" yang bersifat final`
        : `Status tidak bisa langsung dari "${pool.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialPool, { id, status: pool.status }, { status });
    return tx.materialPool.findUnique({ where: { id }, include: POOL_INCLUDE });
  });
  return shapePool(updated);
};

const findItemOrFail = async (poolId, itemId) => {
  const row = await prisma.materialPoolItem.findUnique({ where: { id: itemId }, include: ITEM_INCLUDE });
  if (!row || row.materialPoolId !== poolId) throw httpError('Item material pool tidak ditemukan', 404);
  return row;
};

const addItem = async (poolId, { materialTypeId, notes }) => {
  assertPoolLive(await findPoolOrFail(poolId));

  const type = await prisma.materialType.findUnique({ where: { id: materialTypeId } });
  if (!type) throw httpError(`Jenis material dengan ID ${materialTypeId} tidak ditemukan`, 404);
  if (!type.isActive) throw httpError(`Jenis material "${type.materialName}" nonaktif`, 409);

  const existing = await prisma.materialPoolItem.findUnique({
    where: { materialPoolId_materialTypeId: { materialPoolId: poolId, materialTypeId } },
  });
  if (existing) throw httpError(`"${type.materialName}" sudah ada di pool ini`, 409);

  const item = await prisma.materialPoolItem.create({
    data: { materialPoolId: poolId, materialTypeId, notes: notes ?? null },
    include: ITEM_INCLUDE,
  });
  return shapeItem(item);
};

/**
 * Hapus material dari pool. Di RM-1 belum ada yang merujuk pool item; begitu
 * request (RM-2) dan inventori (RM-5) ada, item yang sudah dirujuk wajib
 * ditolak di sini — FK RESTRICT di database juga akan menolaknya.
 */
const removeItem = async (poolId, itemId) => {
  assertPoolLive(await findPoolOrFail(poolId));
  const item = await findItemOrFail(poolId, itemId);
  await prisma.materialPoolItem.delete({ where: { id: itemId } });
  return shapeItem(item);
};

module.exports = { list, getById, create, changeStatus, addItem, removeItem, shapePool, shapeItem };
