const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// REQUEST MATERIAL — RM-2: pengajuan & meja Admin.
// Keputusan desain: docs/keputusan-desain-request-material.md (R1–R5).
//
// Alur status (5 nilai, diciutkan dari 6 nilai ERD):
//   submitted --(RM-3: Admin susun dana + teruskan)--> waiting_finance_approval
//             --(RM-3: Finance)--> approved | rejected
//   submitted --Admin tolak--> rejected
//   submitted | waiting_finance_approval --pengaju--> cancelled
//
// Di RM-2 Admin hanya menyesuaikan kuantitas (status tetap `submitted`) atau
// menolak. Meneruskan ke Finance menuntut paket dana (ERD aturan 4–5), jadi
// lahir bersama funding di RM-3.
// ============================================================

const REQUEST_DOC_TYPE = 'MRQ';
const REQUEST_DOC_PAD = 6;

// Tahapan/kontrak yang sudah selesai atau batal tidak butuh material lagi.
// `planned` boleh: material wajar dipesan sebelum pekerjaan dimulai (R5).
const CLOSED_CONTEXT_STATUSES = ['completed', 'cancelled'];
const CANCELLABLE_STATUSES = ['submitted', 'waiting_finance_approval'];

const CONTEXT_BY_TYPE = {
  internal_project: { fkField: 'subProjectId', otherField: 'externalSupplyProjectId' },
  external_supply: { fkField: 'externalSupplyProjectId', otherField: 'subProjectId' },
};

// `unit` ikut di setiap item supaya FE menampilkannya di samping angka (D1).
const MATERIAL_TYPE_SELECT = { id: true, materialCode: true, materialName: true, unit: true };

const DETAIL_INCLUDE = {
  subProject: { select: { id: true, subProjectType: true, status: true, constructionProjectId: true } },
  externalSupplyProject: { select: { id: true, supplyProjectCode: true, supplyProjectName: true, status: true, fieldPicId: true } },
  requestedByUser: { select: ACTOR_SELECT },
  adminReviewedByUser: { select: ACTOR_SELECT },
  financeReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: { include: { materialType: { select: MATERIAL_TYPE_SELECT } }, orderBy: { id: 'asc' } },
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

const shapeItem = (item) => {
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
  };
};

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

const shapeDetail = (row) => ({
  ...shapeHeader(row),
  adminReviewedBy: shapeActor(row.adminReviewedByUser),
  adminReviewedAt: row.adminReviewedAt,
  adminNotes: row.adminNotes,
  financeReviewedBy: shapeActor(row.financeReviewedByUser),
  financeReviewedAt: row.financeReviewedAt,
  financeNotes: row.financeNotes,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  items: row.items.map(shapeItem),
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
  return {
    data: rows.map((row) => ({ ...shapeHeader(row), itemCount: row._count.items })),
    total, page, limit,
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// CREATE & CANCEL
// ============================================================

/**
 * internal_project: tahapan & project-nya belum ditutup.
 * external_supply: kontrak belum ditutup, PIC sudah ditentukan, dan HANYA PIC
 * itu yang boleh mengajukan (D5/R5) — kontrak supply adalah tanggung jawab satu
 * orang lapangan yang ditunjuk Admin.
 */
const assertContextAllowed = async (requestType, contextId, userId) => {
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
  if (!supply.fieldPicId) {
    throw httpError(`Supply project ${supply.supplyProjectCode} belum punya PIC Lapangan. Admin perlu menentukannya dulu.`, 409);
  }
  if (supply.fieldPicId !== userId) {
    throw httpError(`Hanya PIC Lapangan supply project ${supply.supplyProjectCode} yang boleh mengajukan request material`, 403);
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

  await assertContextAllowed(requestType, contextId, userId);
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
 * Penolakan diatur per status dan per PERMISSION (bukan nama role), pola yang
 * sama dengan purchase request. RM-3 menambah aturan `waiting_finance_approval`
 * untuk Finance di sini. Alasan wajib (ERD aturan 9).
 */
const REJECT_RULES = {
  submitted: {
    permission: 'material-request:validate',
    deniedMessage: 'Request di antrean Admin hanya bisa ditolak pemegang wewenang validasi Admin',
    data: (userId, notes) => ({ status: 'rejected', adminReviewedBy: userId, adminReviewedAt: new Date(), adminNotes: notes }),
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

module.exports = { list, getById, create, cancel, adminValidate, reject };
