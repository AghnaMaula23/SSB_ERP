const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const poolService = require('./pool.service.js');

// ============================================================
// SUB_PROJECT_EQUIPMENT_ALLOCATIONS — SUMBER KEBENARAN PENUGASAN ALAT.
// "Alat ini sedang dipakai proyek mana" dijawab di sini, bukan
// equipment_items.current_status (itu murni KONDISI alat). Lihat CLAUDE.md
// dan keputusan-desain-project.md.
//
// Alur: Divisi Alat ASSIGN (pool item -> sub-project) → Lapangan RECEIVE
// (konfirmasi unit sampai di lokasi) → berjalan → Divisi Alat tutup lewat
// status completed/returned/cancelled.
// ============================================================

const shapeAllocation = (row) => ({
  id: row.id,
  subProjectId: row.subProjectId,
  equipmentPoolItemId: row.equipmentPoolItemId,
  poolItem: row.equipmentPoolItem ? poolService.shapePoolItem(row.equipmentPoolItem) : undefined,
  equipmentItemId: row.equipmentItemId,
  equipmentItem: row.equipmentItem
    ? { id: row.equipmentItem.id, assetCode: row.equipmentItem.assetCode, currentStatus: row.equipmentItem.currentStatus }
    : undefined,
  status: row.status,
  allocatedAt: row.allocatedAt,
  allocatedBy: shapeActor(row.allocatedByUser),
  receivedAt: row.receivedAt,
  receivedBy: shapeActor(row.receivedByUser),
  createdAt: row.createdAt,
});

const ALLOCATION_INCLUDE = {
  equipmentPoolItem: {
    include: { equipmentType: true, equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } } },
  },
  equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } },
  allocatedByUser: { select: ACTOR_SELECT },
  receivedByUser: { select: ACTOR_SELECT },
};

const findSubProjectOrFail = async (subProjectId) => {
  const subProject = await prisma.subProject.findUnique({ where: { id: subProjectId } });
  if (!subProject) throw httpError('Sub-project tidak ditemukan', 404);
  return subProject;
};

const findOrFail = async (subProjectId, id) => {
  const row = await prisma.subProjectEquipmentAllocation.findUnique({ where: { id }, include: ALLOCATION_INCLUDE });
  if (!row) throw httpError('Alokasi alat tidak ditemukan', 404);
  if (row.subProjectId !== subProjectId) throw httpError('Alokasi ini bukan milik sub-project tersebut', 404);
  return row;
};

const list = async (subProjectId, { status } = {}) => {
  await findSubProjectOrFail(subProjectId);
  const rows = await prisma.subProjectEquipmentAllocation.findMany({
    where: { subProjectId, ...(status && { status }) },
    include: ALLOCATION_INCLUDE,
    orderBy: { id: 'desc' },
  });
  return rows.map(shapeAllocation);
};

const getById = async (subProjectId, id) => shapeAllocation(await findOrFail(subProjectId, id));

/**
 * Divisi Alat mengalokasikan satu pool item ke sub-project. Pool item harus
 * `available` — tidak bisa mengalokasikan unit yang sedang dipakai tahapan
 * lain. Tahapan tujuan harus `active`: mengirim alat ke tahapan yang belum
 * jalan (`planned`) atau sudah selesai tidak ada gunanya.
 *
 * Pool item dan alokasi bergerak BERSAMA dalam satu transaksi: pool item
 * jadi `assigned` di saat yang sama alokasinya dibuat, supaya tidak pernah
 * ada jeda di mana unit terlihat `available` padahal sudah terikat.
 */
const create = async (subProjectId, { equipmentPoolItemId }, userId) => {
  const subProject = await findSubProjectOrFail(subProjectId);
  if (subProject.status !== 'active') {
    throw httpError(`Tahapan berstatus "${subProject.status}". Alat hanya bisa dialokasikan ke tahapan yang aktif.`, 409);
  }

  const poolItem = await prisma.equipmentPoolItem.findUnique({ where: { id: equipmentPoolItemId } });
  if (!poolItem) throw httpError(`Pool item dengan ID ${equipmentPoolItemId} tidak ditemukan`, 404);
  if (poolItem.status !== 'available') {
    throw httpError(`Pool item berstatus "${poolItem.status}", tidak bisa dialokasikan. Harus "available".`, 409);
  }

  const allocation = await prisma.$transaction(async (tx) => {
    const created = await tx.subProjectEquipmentAllocation.create({
      data: {
        subProjectId,
        equipmentPoolItemId,
        // equipmentItemId KOLOM TERKELOLA SISTEM — diturunkan dari pool item,
        // bukan dikirim klien. Pool item boleh belum terikat unit spesifik
        // (equipmentItemId null) kalau Divisi Alat belum menentukan unitnya;
        // alokasi ikut null sampai pool item diikat lewat bindItemUnit.
        equipmentItemId: poolItem.equipmentItemId,
        allocatedBy: userId,
        allocatedAt: new Date(),
      },
    });

    await tx.equipmentPoolItem.update({ where: { id: equipmentPoolItemId }, data: { status: 'assigned' } });

    return tx.subProjectEquipmentAllocation.findUnique({ where: { id: created.id }, include: ALLOCATION_INCLUDE });
  });

  return shapeAllocation(allocation);
};

/**
 * Lapangan mengonfirmasi unit sudah sampai di lokasi. BUKAN perubahan status —
 * status tetap `assigned`. received_at/received_by cukup menjawab "sudah
 * diterima belum", sejalan dengan keputusan menghapus received_at_site dari
 * enum (sudah terekam penuh oleh dua kolom timestamp ini).
 */
const receive = async (subProjectId, id, userId) => {
  const row = await findOrFail(subProjectId, id);
  if (row.status !== 'assigned') {
    throw httpError(`Alokasi berstatus "${row.status}", tidak relevan lagi untuk dikonfirmasi terima`, 409);
  }
  if (row.receivedAt) {
    throw httpError(`Alokasi ini sudah dikonfirmasi terima pada ${row.receivedAt.toISOString()}`, 409);
  }

  const updated = await prisma.subProjectEquipmentAllocation.update({
    where: { id },
    data: { receivedBy: userId, receivedAt: new Date() },
    include: ALLOCATION_INCLUDE,
  });
  return shapeAllocation(updated);
};

const ALLOCATION_STATUS_TRANSITIONS = {
  assigned: ['completed', 'returned', 'cancelled'],
  completed: [],
  returned: [],
  cancelled: [],
};

/**
 * Menutup alokasi. Pool item dibebaskan kembali ke `available` di transaksi
 * yang SAMA — baik tahapan selesai (completed), unit ditarik balik sebelum
 * tahapan selesai (returned), maupun batal sebelum sempat dipakai (cancelled).
 * Ketiganya sama-sama berarti "unit ini bebas dialokasikan lagi" — satu pool
 * item memang bisa dipakai beberapa alokasi berurutan (1:N pada ERD).
 */
const changeStatus = async (subProjectId, id, status, userId) => {
  const row = await findOrFail(subProjectId, id);
  if (row.status === status) throw httpError(`Alokasi sudah berstatus "${status}"`, 409);

  const allowed = ALLOCATION_STATUS_TRANSITIONS[row.status];
  if (!allowed.includes(status)) {
    throw httpError(
      allowed.length === 0
        ? `Alokasi berstatus "${row.status}" yang bersifat final`
        : `Status tidak bisa langsung dari "${row.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.subProjectEquipmentAllocation.update({ where: { id }, data: { status } });
    await tx.equipmentPoolItem.update({
      where: { id: row.equipmentPoolItemId },
      data: { status: 'available' },
    });
    return tx.subProjectEquipmentAllocation.findUnique({ where: { id: result.id }, include: ALLOCATION_INCLUDE });
  });

  return shapeAllocation(updated);
};

module.exports = { list, getById, create, receive, changeStatus, findSubProjectOrFail, findOrFail };
