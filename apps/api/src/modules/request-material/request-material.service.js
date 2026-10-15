const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const materialPoolService = require('../project/material-pool.service.js');
const deliveryService = require('./material-delivery.service.js');

// ============================================================
// REQUEST MATERIAL — RM-2 (pengajuan & meja Admin) + RM-3 (biaya & Finance).
// Keputusan desain: docs/keputusan-desain-request-material.md (R1–R5, F1–F5).
//
// Alur status (5 nilai, diciutkan dari 6 nilai ERD):
//   submitted --Admin susun biaya + teruskan--> waiting_finance_approval
//             --Finance--> approved | rejected
//   submitted --Admin tolak--> rejected
//   submitted | waiting_finance_approval --pengaju--> cancelled
//
// Selama `submitted` Admin bebas menyesuaikan kuantitas dan menyusun biaya.
// Begitu diteruskan, keduanya terkunci — revisi = request baru (ERD aturan 10).
// ============================================================

const REQUEST_DOC_TYPE = 'MRQ';
const REQUEST_DOC_PAD = 6;

// Tahapan/kontrak yang sudah selesai atau batal tidak butuh material lagi.
// `planned` boleh: material wajar dipesan sebelum pekerjaan dimulai (R5).
const CLOSED_CONTEXT_STATUSES = ['completed', 'cancelled'];
const CANCELLABLE_STATUSES = ['submitted', 'waiting_finance_approval'];

const CONTEXT_BY_TYPE = {
  internal_project: { fkField: 'subProjectId', otherField: 'externalSupplyProjectId', poolOwnerType: 'construction_project' },
  external_supply: { fkField: 'externalSupplyProjectId', otherField: 'subProjectId', poolOwnerType: 'external_supply_project' },
};

// `unit` ikut di setiap item supaya FE menampilkannya di samping angka (D1).
const MATERIAL_TYPE_SELECT = { id: true, materialCode: true, materialName: true, unit: true };

const DETAIL_INCLUDE = {
  subProject: { select: { id: true, subProjectType: true, status: true, constructionProjectId: true } },
  externalSupplyProject: { select: { id: true, supplyProjectCode: true, supplyProjectName: true, status: true } },
  requestedByUser: { select: ACTOR_SELECT },
  adminReviewedByUser: { select: ACTOR_SELECT },
  financeReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: { include: { materialType: { select: MATERIAL_TYPE_SELECT } }, orderBy: { id: 'asc' } },
  costs: { orderBy: { id: 'asc' } },
};

const LIST_INCLUDE = {
  subProject: DETAIL_INCLUDE.subProject,
  externalSupplyProject: DETAIL_INCLUDE.externalSupplyProject,
  requestedByUser: { select: ACTOR_SELECT },
  _count: { select: { items: true } },
};

/** Siapa yang menolak, dibaca dari kolom reviewer — pengganti rejected_by_* (R1). */
const rejectedBy = (row) => {
  if (row.status !== 'rejected') return null;
  return row.financeReviewedAt ? 'finance' : 'admin';
};

const shapeItem = (item, delivered) => {
  const requested = toNumber(item.requestedQuantity);
  const validated = toNumber(item.adminValidatedQuantity);
  return {
    id: item.id,
    materialTypeId: item.materialTypeId,
    materialType: item.materialType,
    unit: item.materialType?.unit,
    requestedQuantity: requested,
    adminValidatedQuantity: validated,
    // Kuantitas yang berlaku: hasil validasi Admin kalau ada, kalau tidak = diminta
    effectiveQuantity: validated ?? requested,
    materialPoolItemId: item.materialPoolItemId,
    itemNotes: item.itemNotes,
    adminNotes: item.adminNotes,
    // RM-4: jumlahan delivery aktif, dihitung saat dibaca (G4). Boleh melebihi
    // effectiveQuantity — truk yang datang tetap dicatat; penandaannya future feature (G5).
    deliveredQuantity: delivered?.quantity ?? 0,
    deliveryCount: delivered?.count ?? 0,
  };
};

const shapeCost = (cost) => ({
  id: cost.id,
  costType: cost.costType,
  materialRequestItemId: cost.materialRequestItemId,
  description: cost.description,
  amount: toNumber(cost.amount),
  payeeName: cost.payeeName,
  notes: cost.notes,
});

/** Total paket dana dihitung saat dibaca (F1/D3) — tidak disimpan di mana pun. */
const sumAmounts = (amounts) => Math.round(amounts.reduce((acc, a) => acc + Number(a ?? 0), 0) * 100) / 100;

const shapeHeader = (row) => ({
  id: row.id,
  requestCode: row.requestCode,
  requestType: row.requestType,
  subProjectId: row.subProjectId,
  subProject: row.subProject ?? null,
  externalSupplyProjectId: row.externalSupplyProjectId,
  externalSupplyProject: row.externalSupplyProject ?? null,
  requestDate: toDateOnly(row.requestDate),
  neededDate: toDateOnly(row.neededDate),
  requestNotes: row.requestNotes,
  status: row.status,
  rejectedBy: rejectedBy(row),
  requestedBy: shapeActor(row.requestedByUser),
  createdAt: row.createdAt,
});

// `deliveredByItem` hanya terisi saat dibaca: delivery baru ada setelah approved,
// dan setelah approved tidak ada aksi lain yang mengembalikan detail.
const shapeDetail = (row, deliveredByItem = new Map()) => ({
  ...shapeHeader(row),
  adminReviewedBy: shapeActor(row.adminReviewedByUser),
  adminReviewedAt: row.adminReviewedAt,
  adminNotes: row.adminNotes,
  financeReviewedBy: shapeActor(row.financeReviewedByUser),
  financeReviewedAt: row.financeReviewedAt,
  financeNotes: row.financeNotes,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  items: row.items.map((item) => shapeItem(item, deliveredByItem.get(item.id))),
  costs: row.costs.map(shapeCost),
  totalCostAmount: sumAmounts(row.costs.map((c) => c.amount)),
});

const findOrFail = async (id, client = prisma) => {
  const row = await client.materialRequest.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Request material tidak ditemukan', 404);
  return row;
};

const assertNotOwnRequest = (row, userId, action) => {
  if (row.requestedBy === userId) {
    throw httpError(`Anda mengajukan request ini, jadi tidak boleh ${action} sendiri`, 403);
  }
};

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, status, requestType, subProjectId, externalSupplyProjectId }) => {
  const where = {
    ...(status && { status }),
    ...(requestType && { requestType }),
    ...(subProjectId && { subProjectId }),
    ...(externalSupplyProjectId && { externalSupplyProjectId }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialRequest.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.materialRequest.count({ where }),
  ]);
  // Total biaya per baris untuk antrean Finance — satu query untuk satu halaman
  const sums = await prisma.materialRequestCost.groupBy({
    by: ['materialRequestId'], where: { materialRequestId: { in: rows.map((r) => r.id) } }, _sum: { amount: true },
  });
  const totalById = new Map(sums.map((s) => [s.materialRequestId, sumAmounts([s._sum.amount])]));
  return {
    data: rows.map((row) => ({ ...shapeHeader(row), itemCount: row._count.items, totalCostAmount: totalById.get(row.id) ?? 0 })),
    total, page, limit,
  };
};

const getById = async (id) => {
  const row = await findOrFail(id);
  return shapeDetail(row, row.status === 'approved' ? await deliveryService.deliveredByItem(id) : undefined);
};

// ============================================================
// CREATE & CANCEL
// ============================================================

/**
 * Konteks belum ditutup. Aturan "supply hanya oleh PIC" (D5/R5) DIBUANG 16 Okt
 * 2026: sistem tidak punya proses menugaskan orang lapangan, jadi pemegang
 * material-request:create mana pun boleh mengajukan untuk kedua jenis.
 */
const assertContextAllowed = async (requestType, contextId) => {
  if (requestType === 'internal_project') {
    const subProject = await prisma.subProject.findUnique({
      where: { id: contextId }, include: { constructionProject: { select: { status: true } } },
    });
    if (!subProject) throw httpError(`Sub-project dengan ID ${contextId} tidak ditemukan`, 404);
    if (CLOSED_CONTEXT_STATUSES.includes(subProject.status)) {
      throw httpError(`Tahapan berstatus "${subProject.status}", tidak bisa meminta material`, 409);
    }
    if (CLOSED_CONTEXT_STATUSES.includes(subProject.constructionProject.status)) {
      throw httpError(`Project berstatus "${subProject.constructionProject.status}", tidak bisa meminta material`, 409);
    }
    return;
  }

  const supply = await prisma.externalSupplyProject.findUnique({ where: { id: contextId } });
  if (!supply) throw httpError(`External supply project dengan ID ${contextId} tidak ditemukan`, 404);
  if (CLOSED_CONTEXT_STATUSES.includes(supply.status)) {
    throw httpError(`External supply project berstatus "${supply.status}", tidak bisa meminta material`, 409);
  }
};

/** Jenis material harus ada, aktif, dan tidak dobel dalam satu request (R3: bebas dari master). */
const assertMaterialTypes = async (items) => {
  const ids = [...new Set(items.map((i) => i.materialTypeId))];
  if (ids.length !== items.length) {
    throw httpError('Satu jenis material hanya boleh muncul sekali per request. Gabungkan kuantitasnya.', 400);
  }
  const found = await prisma.materialType.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, materialName: true } });
  const missing = ids.filter((id) => !found.some((t) => t.id === id));
  if (missing.length) throw httpError(`Jenis material dengan ID ${missing.join(', ')} tidak ditemukan`, 404);
  const inactive = found.filter((t) => !t.isActive);
  if (inactive.length) throw httpError(`Jenis material nonaktif: ${inactive.map((t) => t.materialName).join(', ')}`, 409);
};

const create = async (payload, userId) => {
  const { requestType, items } = payload;
  const config = CONTEXT_BY_TYPE[requestType];
  if (!config) throw httpError(`requestType "${requestType}" tidak dikenal`, 400);

  const contextId = payload[config.fkField];
  if (!contextId) throw httpError(`${config.fkField} wajib diisi untuk requestType "${requestType}"`, 400);
  if (payload[config.otherField]) {
    throw httpError(`${config.otherField} tidak boleh diisi untuk requestType "${requestType}"`, 400);
  }

  await assertContextAllowed(requestType, contextId);
  await assertMaterialTypes(items);

  const requestDate = payload.requestDate ? assertNotFuture(payload.requestDate, 'Tanggal request') : new Date();
  const neededDate = payload.neededDate ? new Date(payload.neededDate) : null;
  if (neededDate && toDateOnly(neededDate) < toDateOnly(requestDate)) {
    throw httpError('Tanggal kebutuhan tidak boleh sebelum tanggal request', 400);
  }

  const row = await prisma.$transaction(async (tx) => {
    const requestCode = await nextDocumentNumber(tx, REQUEST_DOC_TYPE, { pad: REQUEST_DOC_PAD });
    const created = await tx.materialRequest.create({
      data: {
        requestCode,
        requestType,
        [config.fkField]: contextId,
        requestDate,
        neededDate,
        requestNotes: payload.requestNotes ?? null,
        requestedBy: userId,
        items: {
          create: items.map((i) => ({
            materialTypeId: i.materialTypeId,
            requestedQuantity: i.requestedQuantity,
            itemNotes: i.itemNotes ?? null,
          })),
        },
      },
    });
    return findOrFail(created.id, tx);
  });

  return shapeDetail(row);
};

/** Pengaju boleh membatalkan selama Finance belum memutuskan — sama dengan purchase request. */
const cancel = async (id, userId) => {
  const row = await findOrFail(id);
  if (!CANCELLABLE_STATUSES.includes(row.status)) {
    throw httpError(`Request berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  }
  if (row.requestedBy !== userId) throw httpError('Hanya pengaju yang boleh membatalkan request ini', 403);

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialRequest, { id, status: { in: CANCELLABLE_STATUSES } },
      { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date() });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

// ============================================================
// MEJA ADMIN
// ============================================================

/**
 * Admin menyesuaikan kuantitas per item (R4): boleh dikurangi, tidak boleh
 * dinaikkan maupun 0. `adminValidatedQuantity: null` mengembalikan ke kuantitas
 * yang diminta. Status tetap `submitted` — keputusan Admin yang mengikat terjadi
 * saat meneruskan ke Finance (RM-3) atau menolak.
 *
 * Header ikut diklaim (updatedAt) supaya penyesuaian tidak bisa mendarat pada
 * request yang baru saja dibatalkan atau ditolak di saat yang sama.
 */
const adminValidate = async (id, { items: changes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Request berstatus "${row.status}", bukan antrean Admin`, 409);
  assertNotOwnRequest(row, userId, 'memvalidasinya');

  const byId = new Map(changes.map((c) => [c.itemId, c]));
  if (byId.size !== changes.length) throw httpError('Satu item hanya boleh diubah sekali per permintaan', 400);

  for (const change of changes) {
    const item = row.items.find((i) => i.id === change.itemId);
    if (!item) throw httpError(`Item ${change.itemId} bukan milik request ini`, 400);
    if (change.adminValidatedQuantity !== null && change.adminValidatedQuantity !== undefined
      && change.adminValidatedQuantity > Number(item.requestedQuantity)) {
      throw httpError(
        `${item.materialType.materialName}: kuantitas validasi ${change.adminValidatedQuantity} ${item.materialType.unit} ` +
        `melebihi yang diminta (${Number(item.requestedQuantity)} ${item.materialType.unit}). ` +
        'Kalau Lapangan butuh lebih, mereka mengajukan request baru.',
        400
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialRequest, { id, status: 'submitted' }, { updatedAt: new Date() });
    for (const change of changes) {
      await tx.materialRequestItem.update({
        where: { id: change.itemId },
        data: {
          ...(change.adminValidatedQuantity !== undefined && { adminValidatedQuantity: change.adminValidatedQuantity }),
          ...(change.adminNotes !== undefined && { adminNotes: change.adminNotes }),
        },
      });
    }
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

/**
 * Admin menyusun rincian biaya (F3): mengganti SELURUH daftar sekaligus, hanya
 * selama `submitted`. `material_cost` wajib menunjuk satu item request ini
 * (maksimal satu per item); jenis biaya lain tidak menunjuk item. Kelengkapan
 * (setiap item punya material_cost) baru dituntut saat diteruskan ke Finance,
 * supaya Admin bisa menyimpan bertahap.
 */
const replaceCosts = async (id, { costs }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') {
    throw httpError(`Request berstatus "${row.status}" — biaya hanya bisa disusun selama di antrean Admin`, 409);
  }
  assertNotOwnRequest(row, userId, 'menyusun biayanya');

  const costedItems = new Set();
  for (const cost of costs) {
    const itemId = cost.materialRequestItemId ?? null;
    if (cost.costType !== 'material_cost') {
      if (itemId !== null) throw httpError(`Biaya "${cost.costType}" berlaku untuk seluruh request dan tidak menunjuk item`, 400);
      continue;
    }
    if (itemId === null) throw httpError('Biaya material_cost wajib menunjuk item lewat materialRequestItemId', 400);
    const item = row.items.find((i) => i.id === itemId);
    if (!item) throw httpError(`Item ${itemId} bukan milik request ini`, 400);
    if (costedItems.has(itemId)) {
      throw httpError(`${item.materialType.materialName} punya lebih dari satu material_cost. Satu item, satu baris harga material.`, 400);
    }
    costedItems.add(itemId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Klaim header: penggantian tidak boleh mendarat pada request yang baru saja
    // diteruskan, ditolak, atau dibatalkan di saat yang sama.
    await claimTransition(tx.materialRequest, { id, status: 'submitted' }, { updatedAt: new Date() });
    await tx.materialRequestCost.deleteMany({ where: { materialRequestId: id } });
    await tx.materialRequestCost.createMany({
      data: costs.map((c) => ({
        materialRequestId: id,
        costType: c.costType,
        materialRequestItemId: c.materialRequestItemId ?? null,
        description: c.description,
        amount: c.amount,
        payeeName: c.payeeName ?? null,
        notes: c.notes ?? null,
      })),
    });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

/**
 * Admin meneruskan paket ke Finance. Syarat lengkap (F3) diperiksa DI DALAM
 * transaksi setelah klaim, supaya penyusunan biaya yang berjalan bersamaan
 * tidak bisa menyelipkan daftar yang belum lengkap.
 */
const submitToFinance = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Request berstatus "${row.status}", bukan antrean Admin`, 409);
  assertNotOwnRequest(row, userId, 'meneruskannya');

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialRequest, { id, status: 'submitted' }, {
      status: 'waiting_finance_approval',
      adminReviewedBy: userId,
      adminReviewedAt: new Date(),
      adminNotes: notes ?? null,
    });

    const current = await findOrFail(id, tx);
    const costed = new Set(current.costs.filter((c) => c.costType === 'material_cost').map((c) => c.materialRequestItemId));
    const uncosted = current.items.filter((i) => !costed.has(i.id));
    if (uncosted.length) {
      throw httpError(`Biaya belum lengkap. Item tanpa harga material: ${uncosted.map((i) => i.materialType.materialName).join(', ')}`, 400);
    }
    return current;
  });
  return shapeDetail(updated);
};

// ============================================================
// APPROVAL FINANCE
// ============================================================

/**
 * Kunci baris project pemilik pool (FOR UPDATE). Tanpa kunci, dua approval
 * bersamaan untuk project yang belum punya pool sama-sama melihat "0 pool" dan
 * membuat dua pool — dan approval berikutnya macet menuntut materialPoolId.
 */
const lockPoolOwner = async (tx, ownerType, ownerId) => {
  if (ownerType === 'construction_project') {
    await tx.$queryRaw`SELECT id FROM construction_projects WHERE id = ${ownerId} FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM external_supply_projects WHERE id = ${ownerId} FOR UPDATE`;
  }
};

/**
 * Pool tujuan (F5): pool hidup milik construction project tahapan / supply
 * project. Tidak ada -> dibuat; lebih dari satu -> klien wajib memilih lewat
 * materialPoolId, sistem tidak menebak. Sama dengan Request Alat.
 */
const resolvePool = async (tx, row, materialPoolId, userId) => {
  const ownerType = CONTEXT_BY_TYPE[row.requestType].poolOwnerType;
  const ownerId = row.requestType === 'internal_project' ? row.subProject.constructionProjectId : row.externalSupplyProjectId;
  const ownerWhere = ownerType === 'construction_project' ? { constructionProjectId: ownerId } : { externalSupplyProjectId: ownerId };

  await lockPoolOwner(tx, ownerType, ownerId);
  const livePools = await tx.materialPool.findMany({
    where: { ownerType, ...ownerWhere, status: { in: materialPoolService.LIVE_POOL_STATUSES } }, orderBy: { id: 'asc' },
  });

  if (materialPoolId) {
    const pool = livePools.find((p) => p.id === materialPoolId);
    if (!pool) throw httpError(`Material pool ${materialPoolId} bukan pool aktif milik project request ini`, 400);
    return pool;
  }
  if (livePools.length === 1) return livePools[0];
  if (livePools.length > 1) {
    throw httpError(
      `Project ini punya ${livePools.length} material pool aktif (${livePools.map((p) => p.poolCode).join(', ')}). Pilih salah satu lewat materialPoolId.`,
      400
    );
  }
  return materialPoolService.createInTx(tx, ownerType, ownerId, userId);
};

/**
 * Finance menyetujui paket (F4). Satu transaksi: status -> approved, jejak
 * Finance, dan setiap material masuk pool project (pool item yang sudah ada
 * dipakai ulang). Nominal tidak diisi ulang — yang disetujui = yang diajukan;
 * selisih realisasi dikoreksi lewat financial_correction_requests (GL).
 */
const approve = async (id, { notes, materialPoolId }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'waiting_finance_approval') throw httpError(`Request berstatus "${row.status}", bukan antrean Finance`, 409);
  assertNotOwnRequest(row, userId, 'menyetujuinya');
  // Pemisahan tugas: role bisa dirangkap (admin + finance). Yang menyusun
  // nominal biaya tidak boleh menyetujuinya sendiri — butuh pemeriksa kedua.
  if (row.adminReviewedBy === userId) {
    throw httpError('Anda menyusun dan meneruskan paket ini sebagai Admin, jadi tidak boleh menyetujuinya sebagai Finance. Persetujuan butuh orang kedua.', 403);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialRequest, { id, status: 'waiting_finance_approval' }, {
      status: 'approved',
      financeReviewedBy: userId,
      financeReviewedAt: new Date(),
      financeNotes: notes ?? null,
    });

    const pool = await resolvePool(tx, row, materialPoolId, userId);
    for (const item of row.items) {
      const poolItem = await tx.materialPoolItem.upsert({
        where: { materialPoolId_materialTypeId: { materialPoolId: pool.id, materialTypeId: item.materialTypeId } },
        create: { materialPoolId: pool.id, materialTypeId: item.materialTypeId },
        update: {},
      });
      await tx.materialRequestItem.update({ where: { id: item.id }, data: { materialPoolItemId: poolItem.id } });
    }
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

/**
 * Penolakan diatur per status dan per PERMISSION (bukan nama role), pola yang
 * sama dengan purchase request. Alasan wajib (ERD aturan 9). Tidak ada
 * "kembalikan ke Admin" — revisi = request baru.
 */
const REJECT_RULES = {
  submitted: {
    permission: 'material-request:validate',
    deniedMessage: 'Request di antrean Admin hanya bisa ditolak pemegang wewenang validasi Admin',
    data: (userId, notes) => ({ status: 'rejected', adminReviewedBy: userId, adminReviewedAt: new Date(), adminNotes: notes }),
  },
  waiting_finance_approval: {
    permission: 'material-request:approve',
    deniedMessage: 'Request di antrean Finance hanya bisa ditolak pemegang wewenang approval Finance',
    data: (userId, notes) => ({ status: 'rejected', financeReviewedBy: userId, financeReviewedAt: new Date(), financeNotes: notes }),
  },
};

const reject = async (id, { notes }, user) => {
  const row = await findOrFail(id);
  const rule = REJECT_RULES[row.status];
  if (!rule) throw httpError(`Request berstatus "${row.status}" tidak bisa ditolak`, 409);
  if (!user.permissions.includes(rule.permission)) {
    throw httpError(rule.deniedMessage, 403);
  }
  assertNotOwnRequest(row, user.id, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.materialRequest, { id, status: row.status }, rule.data(user.id, notes.trim()));
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

module.exports = { list, getById, create, cancel, adminValidate, replaceCosts, submitToFinance, approve, reject };
