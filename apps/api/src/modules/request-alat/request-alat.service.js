const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const poolService = require('../project/pool.service.js');

// ============================================================
// REQUEST ALAT — permintaan alat untuk internal project (dari sub-project,
// dibuat Lapangan, lewat Admin) dan external rental (dibuat Admin, langsung ke
// Divisi Alat). Keputusan desain: docs/keputusan-desain-request-alat.md.
//
// Alur status (5 nilai, diciutkan dari 9 nilai ERD):
//   internal:  submitted --admin forward--> equipment_review --decision--> approved | rejected
//              submitted --admin reject--> rejected
//   external:  equipment_review --decision--> approved | rejected
//   cancel:    submitted | equipment_review --> cancelled (oleh pengaju)
//
// Approval MELAHIRKAN pool item di transaksi yang sama — satu pool item per
// unit yang disetujui. Itu sebabnya tidak ada status `fulfilled`.
// ============================================================

const REQUEST_DOC_TYPE = 'RQA';
const REQUEST_DOC_PAD = 6;

// Tahapan/kontrak yang sudah selesai atau batal tidak butuh alat lagi.
// `planned` boleh: alat wajar diminta sebelum pekerjaan dimulai.
const CLOSED_CONTEXT_STATUSES = ['completed', 'cancelled'];
const LIVE_POOL_STATUSES = ['draft', 'active'];

const CONTEXT_BY_TYPE = {
  internal_project: { fkField: 'subProjectId', otherField: 'externalRentalProjectId', poolOwnerType: 'construction_project' },
  external_rental: { fkField: 'externalRentalProjectId', otherField: 'subProjectId', poolOwnerType: 'external_rental_project' },
};

const DETAIL_INCLUDE = {
  subProject: { select: { id: true, subProjectType: true, status: true, constructionProjectId: true } },
  externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true, status: true } },
  requestedByUser: { select: ACTOR_SELECT },
  adminReviewedByUser: { select: ACTOR_SELECT },
  equipmentReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: {
    include: {
      equipmentType: { select: { id: true, typeCode: true, typeName: true } },
      poolItems: { select: { id: true, equipmentPoolId: true, equipmentItemId: true, status: true } },
    },
    orderBy: { id: 'asc' },
  },
};

const LIST_INCLUDE = {
  subProject: DETAIL_INCLUDE.subProject,
  externalRentalProject: DETAIL_INCLUDE.externalRentalProject,
  requestedByUser: { select: ACTOR_SELECT },
  items: { select: { requestedQuantity: true, approvedQuantity: true } },
};

/** Keputusan per item diturunkan dari kuantitas — tidak disimpan. */
const itemDecision = (item) => {
  if (item.approvedQuantity === null) return 'pending';
  if (item.approvedQuantity === 0) return 'rejected';
  if (item.approvedQuantity < item.requestedQuantity) return 'partially_approved';
  return 'approved';
};

const sumQty = (items, field) => items.reduce((acc, i) => acc + (i[field] ?? 0), 0);

/** `full`/`partial` untuk request approved; null selain itu. Pengganti status `partially_approved`. */
const approvalOutcome = (row) => {
  if (row.status !== 'approved') return null;
  return sumQty(row.items, 'approvedQuantity') < sumQty(row.items, 'requestedQuantity') ? 'partial' : 'full';
};

/** Siapa yang menolak, dibaca dari kolom reviewer — pengganti dua status rejected_by_*. */
const rejectedBy = (row) => {
  if (row.status !== 'rejected') return null;
  return row.equipmentReviewedAt ? 'equipment_division' : 'admin';
};

const shapeItem = (item) => ({
  id: item.id,
  equipmentTypeId: item.equipmentTypeId,
  equipmentType: item.equipmentType,
  requestedQuantity: item.requestedQuantity,
  approvedQuantity: item.approvedQuantity,
  rejectedQuantity: item.approvedQuantity === null ? null : item.requestedQuantity - item.approvedQuantity,
  decision: itemDecision(item),
  estimatedWorkhours: toNumber(item.estimatedWorkhours),
  itemNotes: item.itemNotes,
  decisionNotes: item.decisionNotes,
  poolItems: item.poolItems,
});

const shapeHeader = (row) => ({
  id: row.id,
  requestCode: row.requestCode,
  requestType: row.requestType,
  subProjectId: row.subProjectId,
  subProject: row.subProject ?? null,
  externalRentalProjectId: row.externalRentalProjectId,
  externalRentalProject: row.externalRentalProject ?? null,
  requestDate: toDateOnly(row.requestDate),
  neededDate: toDateOnly(row.neededDate),
  locationDetail: row.locationDetail,
  requestNotes: row.requestNotes,
  status: row.status,
  approvalOutcome: approvalOutcome(row),
  rejectedBy: rejectedBy(row),
  requestedBy: shapeActor(row.requestedByUser),
  createdAt: row.createdAt,
});

const shapeDetail = (row) => ({
  ...shapeHeader(row),
  adminReviewedBy: shapeActor(row.adminReviewedByUser),
  adminReviewedAt: row.adminReviewedAt,
  adminNotes: row.adminNotes,
  equipmentReviewedBy: shapeActor(row.equipmentReviewedByUser),
  equipmentReviewedAt: row.equipmentReviewedAt,
  equipmentNotes: row.equipmentNotes,
  cancelledBy: shapeActor(row.cancelledByUser),
  cancelledAt: row.cancelledAt,
  items: row.items.map(shapeItem),
});

const findOrFail = async (id, client = prisma) => {
  const row = await client.equipmentRequest.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Request alat tidak ditemukan', 404);
  return row;
};

/**
 * Pindah status HANYA kalau status saat ini masih `from`. Dua aksi yang
 * bersaing (mis. pengaju membatalkan saat Divisi Alat sedang memutuskan) tidak
 * bisa sama-sama lolos: yang kalah mendapat 409, bukan menimpa diam-diam —
 * dan untuk approval, tidak melahirkan pool item ganda.
 */
const transition = async (tx, id, from, data) => {
  const { count } = await tx.equipmentRequest.updateMany({ where: { id, status: { in: from } }, data });
  if (count === 0) throw httpError('Request ini baru saja diproses orang lain. Muat ulang datanya.', 409);
};

const assertNotOwnRequest = (row, userId, action) => {
  if (row.requestedBy === userId) {
    throw httpError(`Anda mengajukan request ini, jadi tidak boleh ${action} sendiri`, 403);
  }
};

const canReview = (user) => user.roles.includes('super_admin') || user.permissions.includes('equipment-request:review');

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, status, requestType, subProjectId, externalRentalProjectId }) => {
  const where = {
    ...(status && { status }),
    ...(requestType && { requestType }),
    ...(subProjectId && { subProjectId }),
    ...(externalRentalProjectId && { externalRentalProjectId }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentRequest.findMany({
      where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit,
    }),
    prisma.equipmentRequest.count({ where }),
  ]);

  return {
    data: rows.map((row) => ({
      ...shapeHeader(row),
      totalRequestedQuantity: sumQty(row.items, 'requestedQuantity'),
      totalApprovedQuantity: row.items.some((i) => i.approvedQuantity !== null) ? sumQty(row.items, 'approvedQuantity') : null,
    })),
    total, page, limit,
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// CREATE & CANCEL
// ============================================================

const assertContextOpen = async (requestType, contextId) => {
  if (requestType === 'internal_project') {
    const subProject = await prisma.subProject.findUnique({
      where: { id: contextId }, include: { constructionProject: { select: { status: true } } },
    });
    if (!subProject) throw httpError(`Sub-project dengan ID ${contextId} tidak ditemukan`, 404);
    if (CLOSED_CONTEXT_STATUSES.includes(subProject.status)) {
      throw httpError(`Tahapan berstatus "${subProject.status}", tidak bisa meminta alat`, 409);
    }
    if (CLOSED_CONTEXT_STATUSES.includes(subProject.constructionProject.status)) {
      throw httpError(`Project berstatus "${subProject.constructionProject.status}", tidak bisa meminta alat`, 409);
    }
    return;
  }

  const rental = await prisma.externalRentalProject.findUnique({ where: { id: contextId } });
  if (!rental) throw httpError(`External rental project dengan ID ${contextId} tidak ditemukan`, 404);
  if (CLOSED_CONTEXT_STATUSES.includes(rental.status)) {
    throw httpError(`External rental project berstatus "${rental.status}", tidak bisa meminta alat`, 409);
  }
};

const assertTypesExist = async (items) => {
  const ids = [...new Set(items.map((i) => i.equipmentTypeId))];
  if (ids.length !== items.length) {
    throw httpError('Satu jenis alat hanya boleh muncul sekali per request. Gabungkan kuantitasnya.', 400);
  }
  const found = await prisma.equipmentType.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, typeName: true } });
  const missing = ids.filter((id) => !found.some((t) => t.id === id));
  if (missing.length) throw httpError(`Jenis alat dengan ID ${missing.join(', ')} tidak ditemukan`, 404);
  const inactive = found.filter((t) => !t.isActive);
  if (inactive.length) throw httpError(`Jenis alat nonaktif: ${inactive.map((t) => t.typeName).join(', ')}`, 409);
};

/**
 * internal_project mulai dari `submitted` (antrean Admin). external_rental
 * langsung `equipment_review` karena pembuatnya adalah Admin — dan karena itu
 * HANYA pemegang wewenang review Admin yang boleh membuatnya. Tanpa syarat ini,
 * siapa pun yang bisa membuat request bisa melompati review Admin cukup dengan
 * memilih requestType external_rental.
 */
const create = async (payload, user) => {
  const { requestType, items } = payload;
  const config = CONTEXT_BY_TYPE[requestType];
  if (!config) throw httpError(`requestType "${requestType}" tidak dikenal`, 400);

  const contextId = payload[config.fkField];
  if (!contextId) throw httpError(`${config.fkField} wajib diisi untuk requestType "${requestType}"`, 400);
  if (payload[config.otherField]) {
    throw httpError(`${config.otherField} tidak boleh diisi untuk requestType "${requestType}"`, 400);
  }
  if (requestType === 'external_rental' && !canReview(user)) {
    throw httpError('Request external rental dibuat Admin dan melewati review Admin, jadi hanya pemegang equipment-request:review yang boleh membuatnya', 403);
  }

  await assertContextOpen(requestType, contextId);
  await assertTypesExist(items);

  const requestDate = payload.requestDate ? assertNotFuture(payload.requestDate, 'Tanggal request') : new Date();
  const neededDate = payload.neededDate ? new Date(payload.neededDate) : null;
  if (neededDate && toDateOnly(neededDate) < toDateOnly(requestDate)) {
    throw httpError('Tanggal kebutuhan tidak boleh sebelum tanggal request', 400);
  }

  const row = await prisma.$transaction(async (tx) => {
    const requestCode = await nextDocumentNumber(tx, REQUEST_DOC_TYPE, { pad: REQUEST_DOC_PAD });
    const created = await tx.equipmentRequest.create({
      data: {
        requestCode,
        requestType,
        [config.fkField]: contextId,
        requestDate,
        neededDate,
        locationDetail: payload.locationDetail ?? null,
        requestNotes: payload.requestNotes ?? null,
        status: requestType === 'external_rental' ? 'equipment_review' : 'submitted',
        requestedBy: user.id,
        items: {
          create: items.map((i) => ({
            equipmentTypeId: i.equipmentTypeId,
            requestedQuantity: i.requestedQuantity,
            estimatedWorkhours: i.estimatedWorkhours ?? null,
            itemNotes: i.itemNotes ?? null,
          })),
        },
      },
    });
    return findOrFail(created.id, tx);
  });

  return shapeDetail(row);
};

const cancel = async (id, userId) => {
  const row = await findOrFail(id);
  if (!['submitted', 'equipment_review'].includes(row.status)) {
    throw httpError(`Request berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  }
  if (row.requestedBy !== userId) throw httpError('Hanya pengaju yang boleh membatalkan request ini', 403);

  const updated = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ['submitted', 'equipment_review'], { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date() });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

// ============================================================
// REVIEW ADMIN (khusus internal_project)
// ============================================================

/** forward: submitted -> equipment_review. reject: submitted -> rejected (alasan wajib). */
const adminReview = async (id, { action, notes }, userId) => {
  const row = await findOrFail(id);
  if (row.requestType !== 'internal_project') {
    throw httpError('Request external rental dibuat Admin sendiri dan tidak melewati review Admin', 409);
  }
  if (row.status !== 'submitted') throw httpError(`Request berstatus "${row.status}", bukan antrean Admin`, 409);
  assertNotOwnRequest(row, userId, 'mereviewnya');
  if (action === 'reject' && !notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ['submitted'], {
      status: action === 'forward' ? 'equipment_review' : 'rejected',
      adminReviewedBy: userId,
      adminReviewedAt: new Date(),
      adminNotes: notes ?? null,
    });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

// ============================================================
// KEPUTUSAN DIVISI ALAT
// ============================================================

/**
 * Pool tujuan: pool hidup (draft/active) milik project pemilik request.
 * Tidak ada -> dibuat di transaksi ini. Lebih dari satu -> klien wajib memilih,
 * sistem tidak menebak.
 */
const resolvePool = async (tx, row, equipmentPoolId, userId) => {
  const ownerType = CONTEXT_BY_TYPE[row.requestType].poolOwnerType;
  const ownerId = row.requestType === 'internal_project' ? row.subProject.constructionProjectId : row.externalRentalProjectId;
  const ownerWhere = ownerType === 'construction_project' ? { constructionProjectId: ownerId } : { externalRentalProjectId: ownerId };

  const livePools = await tx.equipmentPool.findMany({ where: { ownerType, ...ownerWhere, status: { in: LIVE_POOL_STATUSES } } });

  if (equipmentPoolId) {
    const pool = livePools.find((p) => p.id === equipmentPoolId);
    if (!pool) throw httpError(`Pool ${equipmentPoolId} bukan pool aktif milik project request ini`, 400);
    return pool;
  }
  if (livePools.length === 1) return livePools[0];
  if (livePools.length > 1) {
    throw httpError(
      `Project ini punya ${livePools.length} pool aktif (${livePools.map((p) => p.poolCode).join(', ')}). Pilih salah satu lewat equipmentPoolId.`,
      400
    );
  }
  return poolService.createInTx(tx, ownerType, ownerId, userId);
};

/**
 * Divisi Alat memutuskan SEMUA item sekaligus. Hasil:
 * - total disetujui 0 -> `rejected` (alasan wajib)
 * - selebihnya -> `approved`, dan tiap unit yang disetujui menjadi SATU pool
 *   item `available` tanpa unit (unit dipilih belakangan lewat bind-unit),
 *   di transaksi yang sama.
 */
const equipmentReview = async (id, { items: decisions, notes, equipmentPoolId }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'equipment_review') throw httpError(`Request berstatus "${row.status}", bukan antrean Divisi Alat`, 409);
  assertNotOwnRequest(row, userId, 'memutuskannya');

  const byId = new Map(decisions.map((d) => [d.itemId, d]));
  if (byId.size !== decisions.length) throw httpError('Satu item hanya boleh diputuskan sekali', 400);
  const unknown = decisions.filter((d) => !row.items.some((i) => i.id === d.itemId));
  if (unknown.length) throw httpError(`Item ${unknown.map((d) => d.itemId).join(', ')} bukan milik request ini`, 400);
  const missing = row.items.filter((i) => !byId.has(i.id));
  if (missing.length) throw httpError(`Semua item wajib diputuskan. Belum: ${missing.map((i) => i.id).join(', ')}`, 400);

  for (const item of row.items) {
    const d = byId.get(item.id);
    if (d.approvedQuantity > item.requestedQuantity) {
      throw httpError(`Item ${item.id}: disetujui ${d.approvedQuantity} melebihi yang diminta (${item.requestedQuantity})`, 400);
    }
  }

  const totalApproved = decisions.reduce((acc, d) => acc + d.approvedQuantity, 0);
  if (totalApproved === 0 && !notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ['equipment_review'], {
      status: totalApproved === 0 ? 'rejected' : 'approved',
      equipmentReviewedBy: userId,
      equipmentReviewedAt: new Date(),
      equipmentNotes: notes ?? null,
    });

    for (const item of row.items) {
      const d = byId.get(item.id);
      await tx.equipmentRequestItem.update({
        where: { id: item.id },
        data: { approvedQuantity: d.approvedQuantity, decisionNotes: d.decisionNotes ?? null },
      });
    }

    if (totalApproved > 0) {
      const pool = await resolvePool(tx, row, equipmentPoolId, userId);
      await tx.equipmentPoolItem.createMany({
        data: row.items.flatMap((item) =>
          Array.from({ length: byId.get(item.id).approvedQuantity }, () => ({
            equipmentPoolId: pool.id,
            equipmentRequestItemId: item.id,
            equipmentTypeId: item.equipmentTypeId,
            requestedQuantity: 1,
            approvedQuantity: 1,
            status: 'available',
          }))),
      });
    }

    return findOrFail(id, tx);
  });

  return shapeDetail(updated);
};

module.exports = { list, getById, create, cancel, adminReview, equipmentReview };
