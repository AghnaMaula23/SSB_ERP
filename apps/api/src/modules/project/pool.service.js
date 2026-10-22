const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertContextOpen } = require('./context-lock.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// EQUIPMENT POOL — wadah alat generic di level project (construction ATAU
// external rental). Pool item masuk lewat dua jalan: lahir dari approval
// Request Alat (equipment_request_item_id terisi, lihat request-alat.service.js),
// atau dimasukkan langsung oleh Divisi Alat lewat addItem (kolom itu null).
// ============================================================

const POOL_DOC_TYPE = 'POOL';
const POOL_DOC_PAD = 6;

// Unit yang sedang ditangani tidak boleh direncanakan kerja baru — sama persis
// alasan createWorkhourLog menolak alat maintenance/retired.
const NON_ASSIGNABLE_ITEM_STATUSES = ['maintenance', 'retired'];

// Pool item boleh ditutup manual (completed/cancelled) HANYA saat 'available' —
// tidak bisa mem-pensiunkan unit yang sedang dipakai sub-project.
const POOL_ITEM_CLOSABLE_FROM = ['available'];

const OWNER_CONFIG = {
  construction_project: { fkField: 'constructionProjectId', model: 'constructionProject', label: 'Construction project' },
  external_rental_project: { fkField: 'externalRentalProjectId', model: 'externalRentalProject', label: 'External rental project' },
};

const shapePool = (row) => ({
  id: row.id,
  ownerType: row.ownerType,
  constructionProjectId: row.constructionProjectId,
  externalRentalProjectId: row.externalRentalProjectId,
  poolCode: row.poolCode,
  status: row.status,
  createdAt: row.createdAt,
  createdBy: shapeActor(row.createdByUser),
  itemCount: row._count?.items,
});

const shapePoolItem = (row) => ({
  id: row.id,
  equipmentPoolId: row.equipmentPoolId,
  equipmentTypeId: row.equipmentTypeId,
  equipmentType: row.equipmentType
    ? { id: row.equipmentType.id, typeCode: row.equipmentType.typeCode, typeName: row.equipmentType.typeName }
    : undefined,
  equipmentRequestItemId: row.equipmentRequestItemId,
  equipmentItemId: row.equipmentItemId,
  equipmentItem: row.equipmentItem
    ? { id: row.equipmentItem.id, assetCode: row.equipmentItem.assetCode, currentStatus: row.equipmentItem.currentStatus }
    : undefined,
  requestedQuantity: row.requestedQuantity,
  approvedQuantity: row.approvedQuantity,
  status: row.status,
  operatorName: row.operatorName,
  createdAt: row.createdAt,
});

const findPoolOrFail = async (id) => {
  const row = await prisma.equipmentPool.findUnique({
    where: { id },
    include: { createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } },
  });
  if (!row) throw httpError('Equipment pool tidak ditemukan', 404);
  return row;
};

const findOwnerOrFail = async (ownerType, ownerId) => {
  const config = OWNER_CONFIG[ownerType];
  const owner = await prisma[config.model].findUnique({ where: { id: ownerId } });
  if (!owner) throw httpError(`${config.label} dengan ID ${ownerId} tidak ditemukan`, 404);
  return owner;
};

const list = async ({ page = 1, limit = 20, ownerType, constructionProjectId, externalRentalProjectId, status }) => {
  const where = {
    ...(ownerType && { ownerType }),
    ...(constructionProjectId && { constructionProjectId }),
    ...(externalRentalProjectId && { externalRentalProjectId }),
    ...(status && { status }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentPool.findMany({
      where,
      include: { createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } },
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentPool.count({ where }),
  ]);

  return { data: rows.map(shapePool), total, page, limit };
};

const getById = async (id) => {
  const pool = await findPoolOrFail(id);
  const items = await prisma.equipmentPoolItem.findMany({
    where: { equipmentPoolId: id },
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
    orderBy: { id: 'asc' },
  });
  return { ...shapePool(pool), items: items.map(shapePoolItem) };
};

/**
 * Pool code dibuat sistem (POOL-000001), mengikuti pola nomor dokumen lain —
 * tidak ada alasan membiarkan klien mengarangnya seperti projectCode dulu.
 */
const create = async ({ ownerType, constructionProjectId, externalRentalProjectId }, userId) => {
  const config = OWNER_CONFIG[ownerType];
  if (!config) throw httpError(`ownerType "${ownerType}" tidak dikenal`, 400);

  const ownerId = ownerType === 'construction_project' ? constructionProjectId : externalRentalProjectId;
  if (!ownerId) throw httpError(`${config.fkField} wajib diisi untuk ownerType "${ownerType}"`, 400);
  await findOwnerOrFail(ownerType, ownerId);

  const pool = await prisma.$transaction((tx) => createInTx(tx, ownerType, ownerId, userId));
  return shapePool(pool);
};

/** Dipisah supaya approval Request Alat bisa membuat pool di transaksinya sendiri. */
const createInTx = async (tx, ownerType, ownerId, userId) => {
  const poolCode = await nextDocumentNumber(tx, POOL_DOC_TYPE, { pad: POOL_DOC_PAD });
  return tx.equipmentPool.create({
    data: {
      ownerType,
      constructionProjectId: ownerType === 'construction_project' ? ownerId : null,
      externalRentalProjectId: ownerType === 'external_rental_project' ? ownerId : null,
      poolCode,
      createdBy: userId,
    },
    include: { createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } },
  });
};

const POOL_STATUS_TRANSITIONS = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

const changeStatus = async (id, status) => {
  const pool = await findPoolOrFail(id);
  if (pool.status === status) throw httpError(`Pool sudah berstatus "${status}"`, 409);

  const allowed = POOL_STATUS_TRANSITIONS[pool.status];
  if (!allowed.includes(status)) {
    throw httpError(
      allowed.length === 0
        ? `Pool berstatus "${pool.status}" yang bersifat final`
        : `Status tidak bisa langsung dari "${pool.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  // Menutup pool padahal masih ada item yang sedang assigned membuat alat itu
  // menggantung: alokasinya hidup tapi poolnya sudah tidak aktif.
  if (['closed', 'cancelled'].includes(status)) {
    const activeItems = await prisma.equipmentPoolItem.count({
      where: { equipmentPoolId: id, status: 'assigned' },
    });
    if (activeItems > 0) {
      throw httpError(`Masih ada ${activeItems} item pool berstatus assigned. Selesaikan alokasinya dulu.`, 409);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const pool = await tx.equipmentPool.update({ where: { id }, data: { status } });

    // Menutup pool WAJIB menutup item-nya juga. Tanpa ini, item tertinggal
    // berstatus `available` di dalam pool mati — dan karena satu unit fisik
    // tidak boleh dipegang dua pool item hidup sekaligus, unitnya jadi terkunci
    // selamanya dan tidak bisa dipakai pool manapun. Ditemukan saat pengujian P4.
    if (['closed', 'cancelled'].includes(status)) {
      await tx.equipmentPoolItem.updateMany({
        where: { equipmentPoolId: id, status: 'available' },
        data: { status: status === 'closed' ? 'completed' : 'cancelled' },
      });
    }

    return tx.equipmentPool.findUnique({
      where: { id: pool.id },
      include: { createdByUser: { select: ACTOR_SELECT }, _count: { select: { items: true } } },
    });
  });
  return shapePool(updated);
};

// ============================================================
// POOL ITEMS
// ============================================================

const findPoolItemOrFail = async (poolId, id) => {
  const row = await prisma.equipmentPoolItem.findUnique({
    where: { id },
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true, equipmentTypeId: true } } },
  });
  if (!row) throw httpError('Pool item tidak ditemukan', 404);
  if (row.equipmentPoolId !== poolId) throw httpError('Pool item ini bukan milik pool tersebut', 404);
  return row;
};

/**
 * Divisi Alat memasukkan item langsung, tanpa Request Alat. Status awal
 * `available`: tidak ada permintaan yang menunggu disetujui.
 * `requestedQuantity`/`approvedQuantity` kolom sisa ERD yang dijadwalkan
 * di-drop (tahap contract) — keputusan kuantitas hidup di
 * equipment_request_items. Sampai itu, keduanya disamakan.
 */
const addItem = async (poolId, payload) => {
  const pool = await findPoolOrFail(poolId);
  if (pool.status !== 'active' && pool.status !== 'draft') {
    throw httpError(`Pool berstatus "${pool.status}", tidak bisa ditambah item`, 409);
  }

  const { equipmentTypeId, equipmentItemId, requestedQuantity = 1 } = payload;

  const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);

  if (equipmentItemId) {
    await assertItemAssignable(equipmentTypeId, equipmentItemId);
  }

  const item = await prisma.equipmentPoolItem.create({
    data: {
      equipmentPoolId: poolId,
      equipmentTypeId,
      equipmentItemId: equipmentItemId ?? null,
      requestedQuantity,
      approvedQuantity: requestedQuantity,
      status: 'available',
    },
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
  });

  return shapePoolItem(item);
};

/**
 * Unit yang boleh dibawa masuk ke pool: tipe cocok, tidak sedang
 * maintenance/retired (sama alasan dengan createWorkhourLog), dan tidak
 * sedang dipegang pool item lain yang masih hidup (available/assigned) —
 * satu unit fisik tidak bisa berada di dua pool aktif sekaligus.
 */
const assertItemAssignable = async (equipmentTypeId, equipmentItemId, excludePoolItemId) => {
  const item = await prisma.equipmentItem.findUnique({ where: { id: equipmentItemId } });
  if (!item) throw httpError(`Unit alat dengan ID ${equipmentItemId} tidak ditemukan`, 404);
  if (!item.isActive) throw httpError(`Unit alat "${item.assetCode}" nonaktif`, 409);
  if (item.equipmentTypeId !== equipmentTypeId) {
    throw httpError(`Unit alat "${item.assetCode}" bukan jenis alat yang dipilih`, 400);
  }
  if (NON_ASSIGNABLE_ITEM_STATUSES.includes(item.currentStatus)) {
    throw httpError(`Unit alat "${item.assetCode}" berstatus "${item.currentStatus}", tidak bisa dimasukkan pool`, 409);
  }

  // "Dipegang pool lain" hanya berlaku untuk pool yang MASIH HIDUP. Pool yang
  // sudah closed/cancelled tidak boleh menahan unitnya — jaring pengaman untuk
  // data yang terlanjur tertinggal sebelum cascade di changeStatus ada.
  const heldElsewhere = await prisma.equipmentPoolItem.findFirst({
    where: {
      equipmentItemId,
      status: { in: ['available', 'assigned'] },
      equipmentPool: { status: { in: ['draft', 'active'] } },
      ...(excludePoolItemId && { id: { not: excludePoolItemId } }),
    },
    include: { equipmentPool: { select: { poolCode: true } } },
  });
  if (heldElsewhere) {
    throw httpError(
      `Unit alat "${item.assetCode}" sudah terikat pool item lain (#${heldElsewhere.id}) ` +
      `pada pool ${heldElsewhere.equipmentPool.poolCode}`,
      409
    );
  }

  return item;
};

/** Mengikat unit spesifik ke pool item yang sebelumnya belum punya unit. */
const bindItemUnit = async (poolId, id, equipmentItemId) => {
  const poolItem = await findPoolItemOrFail(poolId, id);
  if (poolItem.equipmentItemId) {
    throw httpError('Pool item ini sudah terikat unit alat. Lepaskan dulu kalau mau mengganti.', 409);
  }
  if (poolItem.status !== 'available') {
    throw httpError(`Pool item berstatus "${poolItem.status}", tidak bisa diikat unit baru`, 409);
  }

  await assertItemAssignable(poolItem.equipmentTypeId, equipmentItemId, id);

  const updated = await prisma.equipmentPoolItem.update({
    where: { id },
    data: { equipmentItemId },
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
  });
  return shapePoolItem(updated);
};

/**
 * Operator yang ikut bersama unit rental (dasar timesheet & tagihan). Satu nama
 * per unit per kontrak; string kosong menghapusnya. Hanya pool rental, dan
 * terkunci begitu kontraknya ditutup — sama dengan jam kerjanya.
 */
const setItemOperator = async (poolId, id, operatorName) => {
  const pool = await prisma.equipmentPool.findUnique({
    where: { id: poolId },
    select: { ownerType: true, externalRentalProject: { select: { id: true, rentalProjectCode: true, status: true } } },
  });
  if (!pool) throw httpError('Equipment pool tidak ditemukan', 404);
  if (pool.ownerType !== 'external_rental_project') {
    throw httpError('Operator hanya dicatat untuk unit rental', 400);
  }
  if (['completed', 'cancelled'].includes(pool.externalRentalProject.status)) {
    throw httpError(`Kontrak rental ${pool.externalRentalProject.rentalProjectCode} berstatus "${pool.externalRentalProject.status}", datanya terkunci`, 409);
  }
  const poolItem = await findPoolItemOrFail(poolId, id);
  if (['rejected', 'cancelled'].includes(poolItem.status)) {
    throw httpError(`Pool item berstatus "${poolItem.status}", tidak bisa diberi operator`, 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { externalRentalProjectId: pool.externalRentalProject.id });
    return tx.equipmentPoolItem.update({
      where: { id },
      data: { operatorName: operatorName?.trim() || null },
      include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
    });
  });
  return shapePoolItem(updated);
};

/** Divisi Alat menutup pool item manual — hanya saat bebas (available). */
const closeItem = async (poolId, id, status) => {
  if (!['completed', 'cancelled'].includes(status)) {
    throw httpError('Status penutupan pool item hanya boleh "completed" atau "cancelled"', 400);
  }
  const poolItem = await findPoolItemOrFail(poolId, id);
  if (!POOL_ITEM_CLOSABLE_FROM.includes(poolItem.status)) {
    throw httpError(
      `Pool item berstatus "${poolItem.status}". Hanya item berstatus "available" yang bisa ditutup manual — ` +
      'item yang sedang "assigned" harus diselesaikan lewat alokasinya dulu.',
      409
    );
  }

  const updated = await prisma.equipmentPoolItem.update({
    where: { id },
    data: { status },
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
  });
  return shapePoolItem(updated);
};

module.exports = {
  list, getById, create, createInTx, changeStatus,
  findPoolOrFail, findPoolItemOrFail, addItem, bindItemUnit, setItemOperator, closeItem, assertItemAssignable,
  shapePoolItem,
};
