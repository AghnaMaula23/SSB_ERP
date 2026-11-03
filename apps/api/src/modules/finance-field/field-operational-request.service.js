const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen, CLOSED_STATUSES } = require('../project/context-lock.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// KAS LAPANGAN — PENGAJUAN DANA OPERASIONAL (docs/plan-divisi-lapangan.md L1–L3).
//
// Alur status (5 nilai, pola request material):
//   submitted --Admin validasi--> waiting_finance_approval --Finance--> approved
//   submitted --Admin tolak--> rejected
//   waiting_finance_approval --Finance tolak--> rejected
//   submitted | waiting_finance_approval --pengaju--> cancelled
//
// Nominal = PERKIRAAN (L2). `approved` hanya izin belanja: tidak mengubah
// nominal, tidak membuat jurnal — pencairan di luar sistem. Yang kelak jadi
// sumber jurnal adalah laporan realisasi `validated` (T12). Total tidak
// disimpan: baris = quantity × estimated_unit_price, header = SUM barisnya.
// ============================================================

const REQUEST_DOC_TYPE = 'FOR';
const REQUEST_DOC_PAD = 6;

// Izin belanja hanya untuk pekerjaan yang sedang berjalan
const SUBMITTABLE_STAGE_STATUSES = ['active'];
const CANCELLABLE_STATUSES = ['submitted', 'waiting_finance_approval'];

const CATEGORY_SELECT = { id: true, categoryCode: true, categoryName: true, isActive: true };
const SUB_PROJECT_SELECT = {
  id: true, subProjectType: true, status: true,
  constructionProject: { select: { id: true, projectCode: true, projectName: true } },
};

const DETAIL_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  requestedByUser: { select: ACTOR_SELECT },
  adminValidatedByUser: { select: ACTOR_SELECT },
  financeReviewedByUser: { select: ACTOR_SELECT },
  cancelledByUser: { select: ACTOR_SELECT },
  items: { include: { category: { select: CATEGORY_SELECT } }, orderBy: { id: 'asc' } },
};

const LIST_INCLUDE = {
  subProject: { select: SUB_PROJECT_SELECT },
  requestedByUser: { select: ACTOR_SELECT },
  _count: { select: { items: true } },
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Siapa yang menolak, dibaca dari kolom keputusan (pola request material R1). */
const rejectedBy = (row) => {
  if (row.status !== 'rejected') return null;
  return row.financeReviewedAt ? 'finance' : 'admin';
};

const shapeItem = (item) => {
  const quantity = toNumber(item.quantity);
  const estimatedUnitPrice = toNumber(item.estimatedUnitPrice);
  return {
    id: item.id,
    categoryId: item.fieldExpenseCategoryId,
    category: item.category,
    itemName: item.itemName,
    quantity,
    unit: item.unit,
    estimatedUnitPrice,
    estimatedAmount: round2(quantity * estimatedUnitPrice),
    notes: item.notes,
  };
};

const shapeHeader = (row, requestedAmount) => ({
  id: row.id,
  requestCode: row.requestCode,
  subProjectId: row.subProjectId,
  subProject: row.subProject ?? null,
  requestDate: toDateOnly(row.requestDate),
  neededDate: toDateOnly(row.neededDate),
  notes: row.notes,
  status: row.status,
  rejectedBy: rejectedBy(row),
  requestedAmount,
  // TODO(T12): SUM laporan realisasi `validated` yang merujuk pengajuan ini.
  // Tabel laporan belum ada, jadi selalu 0 (dan `reports` di detail kosong).
  realizedAmount: 0,
  requestedBy: shapeActor(row.requestedByUser),
  createdAt: row.createdAt,
});

const shapeDetail = (row) => {
  const items = row.items.map(shapeItem);
  const requestedAmount = round2(items.reduce((sum, i) => sum + i.estimatedAmount, 0));
  const header = shapeHeader(row, requestedAmount);
  return {
    ...header,
    difference: round2(requestedAmount - header.realizedAmount),
    adminValidatedBy: shapeActor(row.adminValidatedByUser),
    adminValidatedAt: row.adminValidatedAt,
    adminNotes: row.adminNotes,
    financeReviewedBy: shapeActor(row.financeReviewedByUser),
    financeReviewedAt: row.financeReviewedAt,
    financeNotes: row.financeNotes,
    cancelledBy: shapeActor(row.cancelledByUser),
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    items,
    // TODO(T12): laporan realisasi yang merujuk pengajuan ini (ringkas)
    reports: [],
  };
};

const findOrFail = async (id, client = prisma) => {
  const row = await client.fieldOperationalRequest.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw httpError('Pengajuan dana tidak ditemukan', 404);
  return row;
};

const assertNotOwnRequest = (row, userId, action) => {
  if (row.requestedBy === userId) {
    throw httpError(`Anda mengajukan dana ini, jadi tidak boleh ${action} sendiri`, 403);
  }
};

// ============================================================
// READ
// ============================================================

const list = async ({ page = 1, limit = 20, subProjectId, status, startDate, endDate, search }) => {
  const where = {
    ...(subProjectId && { subProjectId }),
    ...(status && { status }),
    ...((startDate || endDate) && { requestDate: {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    } }),
    ...(search && { OR: [
      { requestCode: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { items: { some: { itemName: { contains: search, mode: 'insensitive' } } } },
    ] }),
  };
  const [rows, total] = await Promise.all([
    prisma.fieldOperationalRequest.findMany({ where, include: LIST_INCLUDE, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.fieldOperationalRequest.count({ where }),
  ]);

  // Total per baris untuk satu halaman — satu query, rumus sama dengan shapeItem
  const ids = rows.map((r) => r.id);
  const sums = ids.length ? await prisma.$queryRaw`
    SELECT field_operational_request_id AS id, SUM(ROUND(quantity * estimated_unit_price, 2)) AS amount
    FROM field_operational_request_items
    WHERE field_operational_request_id = ANY(${ids})
    GROUP BY field_operational_request_id` : [];
  const amountById = new Map(sums.map((s) => [s.id, toNumber(s.amount)]));

  return {
    data: rows.map((row) => ({ ...shapeHeader(row, amountById.get(row.id) ?? 0), itemCount: row._count.items })),
    total, page, limit,
  };
};

const getById = async (id) => shapeDetail(await findOrFail(id));

// ============================================================
// AJUKAN & BATAL
// ============================================================

/** Kategori harus ada dan aktif. Satu kategori boleh muncul di beberapa baris. */
const assertCategories = async (items) => {
  const ids = [...new Set(items.map((i) => i.categoryId))];
  const found = await prisma.fieldExpenseCategory.findMany({ where: { id: { in: ids } }, select: CATEGORY_SELECT });
  const missing = ids.filter((id) => !found.some((c) => c.id === id));
  if (missing.length) throw httpError(`Kategori biaya dengan ID ${missing.join(', ')} tidak ditemukan`, 404);
  const inactive = found.filter((c) => !c.isActive);
  if (inactive.length) throw httpError(`Kategori biaya nonaktif: ${inactive.map((c) => c.categoryName).join(', ')}`, 409);
};

const create = async (payload, userId) => {
  const { subProjectId } = payload;
  const stage = await prisma.subProject.findUnique({
    where: { id: subProjectId }, include: { constructionProject: { select: { status: true } } },
  });
  if (!stage) throw httpError(`Tahapan dengan ID ${subProjectId} tidak ditemukan`, 404);
  if (CLOSED_STATUSES.includes(stage.constructionProject.status)) {
    throw httpError(`Project berstatus "${stage.constructionProject.status}", tidak bisa mengajukan dana`, 409);
  }
  await assertCategories(payload.items);

  const requestDate = assertNotFuture(payload.requestDate, 'Tanggal pengajuan');
  const neededDate = payload.neededDate ? new Date(payload.neededDate) : null;
  if (neededDate && toDateOnly(neededDate) < toDateOnly(requestDate)) {
    throw httpError('Tanggal kebutuhan tidak boleh sebelum tanggal pengajuan', 400);
  }

  const row = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId });
    // Dibaca ulang di bawah kunci: status tahapan bisa berubah sejak pengecekan di atas
    const current = await tx.subProject.findUnique({ where: { id: subProjectId }, select: { status: true } });
    if (!SUBMITTABLE_STAGE_STATUSES.includes(current.status)) {
      throw httpError(`Tahapan berstatus "${current.status}". Dana operasional hanya bisa diajukan untuk tahapan yang sedang aktif.`, 409);
    }
    const requestCode = await nextDocumentNumber(tx, REQUEST_DOC_TYPE, { pad: REQUEST_DOC_PAD });
    const created = await tx.fieldOperationalRequest.create({
      data: {
        requestCode,
        subProjectId,
        requestDate,
        neededDate,
        notes: payload.notes?.trim() || null,
        requestedBy: userId,
        items: {
          create: payload.items.map((i) => ({
            fieldExpenseCategoryId: i.categoryId,
            itemName: i.itemName.trim(),
            quantity: i.quantity,
            unit: i.unit.trim(),
            estimatedUnitPrice: i.estimatedUnitPrice,
            notes: i.notes?.trim() || null,
          })),
        },
      },
    });
    return findOrFail(created.id, tx);
  });
  return shapeDetail(row);
};

/** Pengaju boleh membatalkan selama Finance belum memutuskan; alasan wajib. */
const cancel = async (id, { reason }, userId) => {
  const row = await findOrFail(id);
  if (!CANCELLABLE_STATUSES.includes(row.status)) {
    throw httpError(`Pengajuan berstatus "${row.status}" sudah tidak bisa dibatalkan`, 409);
  }
  if (row.requestedBy !== userId) throw httpError('Hanya pengaju yang boleh membatalkan pengajuan ini', 403);
  if (!reason?.trim()) throw httpError('Alasan pembatalan wajib diisi', 400);

  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.fieldOperationalRequest, { id, status: { in: CANCELLABLE_STATUSES } },
      { status: 'cancelled', cancelledBy: userId, cancelledAt: new Date(), cancelReason: reason.trim() });
    return findOrFail(id, tx);
  });
  return shapeDetail(updated);
};

// ============================================================
// KEPUTUSAN ADMIN & FINANCE — tanpa mengubah nominal
// ============================================================

/** Satu transisi keputusan: kunci tahapan, klaim status, kembalikan detail. */
const decide = async (row, fromStatus, data) => {
  const updated = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, { subProjectId: row.subProjectId });
    await claimTransition(tx.fieldOperationalRequest, { id: row.id, status: fromStatus }, data);
    return findOrFail(row.id, tx);
  });
  return shapeDetail(updated);
};

const validate = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'submitted') throw httpError(`Pengajuan berstatus "${row.status}", bukan antrean Admin`, 409);
  assertNotOwnRequest(row, userId, 'memvalidasinya');
  return decide(row, 'submitted', {
    status: 'waiting_finance_approval',
    adminValidatedBy: userId,
    adminValidatedAt: new Date(),
    adminNotes: notes?.trim() || null,
  });
};

const approve = async (id, { notes }, userId) => {
  const row = await findOrFail(id);
  if (row.status !== 'waiting_finance_approval') throw httpError(`Pengajuan berstatus "${row.status}", bukan antrean Finance`, 409);
  assertNotOwnRequest(row, userId, 'menyetujuinya');
  // Pemisahan tugas saat role dirangkap (admin + finance): pemeriksa kedua wajib orang lain
  if (row.adminValidatedBy === userId) {
    throw httpError('Anda memvalidasi pengajuan ini sebagai Admin, jadi tidak boleh menyetujuinya sebagai Finance. Persetujuan butuh orang kedua.', 403);
  }
  return decide(row, 'waiting_finance_approval', {
    status: 'approved',
    financeReviewedBy: userId,
    financeReviewedAt: new Date(),
    financeNotes: notes?.trim() || null,
  });
};

/**
 * Wewenang menolak ditentukan status, diperiksa per PERMISSION (pola request
 * material). Alasan wajib dan final — revisi = pengajuan baru.
 */
const REJECT_RULES = {
  submitted: {
    permission: 'field-cash:validate',
    deniedMessage: 'Pengajuan di antrean Admin hanya bisa ditolak pemegang wewenang validasi Admin',
    data: (userId, notes) => ({ status: 'rejected', adminValidatedBy: userId, adminValidatedAt: new Date(), adminNotes: notes }),
  },
  waiting_finance_approval: {
    permission: 'field-cash:approve',
    deniedMessage: 'Pengajuan di antrean Finance hanya bisa ditolak pemegang wewenang approval Finance',
    data: (userId, notes) => ({ status: 'rejected', financeReviewedBy: userId, financeReviewedAt: new Date(), financeNotes: notes }),
  },
};

const reject = async (id, { notes }, user) => {
  const row = await findOrFail(id);
  const rule = REJECT_RULES[row.status];
  if (!rule) throw httpError(`Pengajuan berstatus "${row.status}" tidak bisa ditolak`, 409);
  if (!user.permissions.includes(rule.permission)) throw httpError(rule.deniedMessage, 403);
  assertNotOwnRequest(row, user.id, 'menolaknya');
  if (!notes?.trim()) throw httpError('Alasan penolakan wajib diisi', 400);
  return decide(row, row.status, rule.data(user.id, notes.trim()));
};

module.exports = { list, getById, create, cancel, validate, approve, reject };
