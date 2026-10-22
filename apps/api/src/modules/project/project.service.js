const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toDateOnly, coerceDates, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { CLOSED_STATUSES, lockForClosing, assertNothingOpen } = require('./context-lock.js');
const closingArchive = require('../project-file/closing-archive.service.js');

// ============================================================
// Tiga tipe project sengaja DIPISAH FISIK (keputusan PM), bukan satu tabel
// dengan kolom tipe. Konsekuensinya bentuk CRUD-nya mirip tapi kolomnya beda,
// jadi yang dibagi di sini hanya mekanismenya — bukan tabelnya.
// ============================================================

/**
 * Konfigurasi per tipe project. Satu tempat supaya menambah tipe project baru
 * tidak berarti menyalin lima fungsi CRUD.
 */
const PROJECT_TYPES = {
  construction: {
    model: 'constructionProject',
    label: 'Construction project',
    docType: 'PRJ',
    codeField: 'projectCode',
    nameField: 'projectName',
    // Kolom yang boleh ditulis klien. Kode project TIDAK di sini — dibuat sistem.
    writable: ['projectName', 'clientName', 'location', 'startDate', 'endDate'],
    dateFields: ['startDate', 'endDate'],
  },
  'external-rental': {
    model: 'externalRentalProject',
    label: 'External rental project',
    docType: 'RNT',
    codeField: 'rentalProjectCode',
    nameField: 'rentalProjectName',
    writable: ['rentalProjectName', 'clientName', 'location', 'contractNo',
      'contractStartDate', 'contractEndDate', 'billingMethod'],
    dateFields: ['contractStartDate', 'contractEndDate'],
  },
  'external-supply': {
    model: 'externalSupplyProject',
    label: 'External supply project',
    docType: 'SPL',
    codeField: 'supplyProjectCode',
    nameField: 'supplyProjectName',
    writable: ['supplyProjectName', 'clientName', 'location', 'contractNo',
      'contractStartDate', 'contractEndDate'],
    dateFields: ['contractStartDate', 'contractEndDate'],
  },
};

const PROJECT_DOC_PAD = 6;

// Project yang sudah selesai atau dibatalkan tidak boleh diubah lagi — angkanya
// sudah dipakai laporan dan (untuk construction) sudah jadi dasar tagihan.
const IMMUTABLE_STATUSES = ['completed', 'cancelled'];

const includeFor = (config) => ({ createdByUser: { select: ACTOR_SELECT }, ...config.extraInclude });

const typeConfigOrFail = (kind) => {
  const config = PROJECT_TYPES[kind];
  if (!config) throw httpError(`Tipe project "${kind}" tidak dikenal`, 400);
  return config;
};

const shapeProject = (config, row) => ({
  id: row.id,
  projectCode: row[config.codeField],
  projectName: row[config.nameField],
  projectKind: Object.keys(PROJECT_TYPES).find((k) => PROJECT_TYPES[k] === config),
  clientName: row.clientName,
  location: row.location,
  ...(config.codeField === 'projectCode'
    ? { startDate: toDateOnly(row.startDate), endDate: toDateOnly(row.endDate) }
    : {
        contractNo: row.contractNo,
        contractStartDate: toDateOnly(row.contractStartDate),
        contractEndDate: toDateOnly(row.contractEndDate),
      }),
  ...(config.model === 'externalRentalProject' && { billingMethod: row.billingMethod }),
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: shapeActor(row.createdByUser),
  ...(row._count && { subProjectCount: row._count.subProjects }),
});

const findOrFail = async (kind, id) => {
  const config = typeConfigOrFail(kind);
  const row = await prisma[config.model].findUnique({
    where: { id },
    include: includeFor(config),
  });
  if (!row) throw httpError(`${config.label} tidak ditemukan`, 404);
  return { config, row };
};

const list = async (kind, { page = 1, limit = 20, status, search }) => {
  const config = typeConfigOrFail(kind);
  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { [config.codeField]: { contains: search, mode: 'insensitive' } },
        { [config.nameField]: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma[config.model].findMany({
      where,
      include: {
        ...includeFor(config),
        ...(config.model === 'constructionProject' && { _count: { select: { subProjects: true } } }),
      },
      orderBy: { [config.codeField]: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma[config.model].count({ where }),
  ]);

  return { data: rows.map((r) => shapeProject(config, r)), total, page, limit };
};

/**
 * Tanggal mulai tidak boleh melewati tanggal selesai. Dicek di service, bukan
 * validator, karena saat UPDATE hanya satu dari dua tanggal mungkin dikirim —
 * pembandingnya harus nilai yang tersimpan.
 */
const assertDateOrder = (config, merged) => {
  const [startKey, endKey] = config.dateFields;
  const start = merged[startKey];
  const end = merged[endKey];
  if (start && end && new Date(start) > new Date(end)) {
    throw httpError(`${startKey} tidak boleh setelah ${endKey}`, 400);
  }
};

const create = async (kind, payload, user) => {
  const config = typeConfigOrFail(kind);
  const writable = coerceDates(pickWritable(payload, config.writable), config.dateFields);
  // Kode project SELALU dibuat sistem. Override manual (dulu khusus super_admin,
  // untuk migrasi data lama) dibuang 15 Okt 2026: super_admin kini read-only, dan
  // migrasi data lama dikerjakan lewat skrip impor sekali jalan, bukan API.

  assertDateOrder(config, writable);

  const row = await prisma.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, config.docType, { pad: PROJECT_DOC_PAD });
    return tx[config.model].create({
      data: { ...writable, [config.codeField]: code, createdBy: user.id },
      include: includeFor(config),
    });
  });

  return shapeProject(config, row);
};

const update = async (kind, id, payload) => {
  const { config, row } = await findOrFail(kind, id);

  if (IMMUTABLE_STATUSES.includes(row.status)) {
    throw httpError(
      `${config.label} berstatus "${row.status}" dan tidak bisa diubah lagi`,
      409
    );
  }

  const writable = coerceDates(pickWritable(payload, config.writable), config.dateFields);
  assertDateOrder(config, { ...row, ...writable });

  const updated = await prisma[config.model].update({
    where: { id },
    data: writable,
    include: includeFor(config),
  });
  return shapeProject(config, updated);
};

// Transisi status yang sah. planned dan active bisa saling bolak-balik (project
// ditunda lalu jalan lagi); completed dan cancelled terminal.
const STATUS_TRANSITIONS = {
  planned: ['active', 'cancelled'],
  active: ['planned', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Project yang ditutup (completed ATAU cancelled) terkunci datanya (L8) — tidak
 * boleh ada urusan tertinggal. Dihitung setelah baris project dikunci FOR UPDATE.
 * - Construction: semua tahapan sudah ditutup — data hidup di tahapan, dan
 *   tahapan punya syaratnya sendiri (sub-project.service).
 * - Supply: request material menunggu keputusan, surat jalan belum diterima.
 * - Rental: request alat menunggu keputusan Divisi Alat.
 */
const assertProjectClosable = async (tx, config, id) => {
  if (config.model === 'constructionProject') {
    await tx.$queryRaw`SELECT id FROM construction_projects WHERE id = ${id} FOR UPDATE`;
    const openStages = await tx.subProject.count({ where: { constructionProjectId: id, status: { in: ['planned', 'active'] } } });
    return assertNothingOpen('Project', [[openStages, 'tahapan belum ditutup (selesaikan atau batalkan tahapannya dulu)']]);
  }
  if (config.model === 'externalSupplyProject') {
    await lockForClosing(tx, 'externalSupplyProjectId', id);
    const [requests, undelivered] = await Promise.all([
      tx.materialRequest.count({ where: { externalSupplyProjectId: id, status: { in: ['submitted', 'waiting_finance_approval'] } } }),
      tx.materialDelivery.count({
        where: { cancelledAt: null, materialRequest: { externalSupplyProjectId: id }, receipts: { none: { cancelledAt: null } } },
      }),
    ]);
    return assertNothingOpen('Kontrak supply', [
      [requests, 'request material menunggu keputusan'], [undelivered, 'surat jalan belum diterima'],
    ]);
  }
  await lockForClosing(tx, 'externalRentalProjectId', id);
  const requests = await tx.equipmentRequest.count({
    where: { externalRentalProjectId: id, status: { in: ['submitted', 'equipment_review'] } },
  });
  return assertNothingOpen('Kontrak rental', [[requests, 'request alat menunggu keputusan']]);
};

const changeStatus = async (kind, id, status, userId) => {
  const { config, row } = await findOrFail(kind, id);

  if (row.status === status) throw httpError(`${config.label} sudah berstatus "${status}"`, 409);

  const allowed = STATUS_TRANSITIONS[row.status];
  if (!allowed.includes(status)) {
    throw httpError(
      allowed.length === 0
        ? `${config.label} berstatus "${row.status}" yang bersifat final dan tidak bisa diubah lagi`
        : `Status tidak bisa langsung dari "${row.status}" ke "${status}". Yang sah: ${allowed.join(', ')}`,
      409
    );
  }

  // Penutupan membuat Arsip Penutupan (L8) di transaksi yang sama — lihat sub-project.service
  const closing = CLOSED_STATUSES.includes(status);
  const store = closing ? closingArchive.createStore(userId) : null;
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (closing) {
        await assertProjectClosable(tx, config, id);
        await closingArchive.archiveProject(tx, store, config.model, id, status, userId);
      }
      await claimTransition(tx[config.model], { id, status: row.status }, { status });
      return tx[config.model].findUnique({ where: { id }, include: includeFor(config) });
    });
  } catch (err) {
    if (store) await store.discard();
    throw err;
  }
  return shapeProject(config, updated);
};

module.exports = { PROJECT_TYPES, typeConfigOrFail, findOrFail, list, create, update, changeStatus, shapeProject };
