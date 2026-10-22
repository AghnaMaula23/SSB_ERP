const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const maintenance = require('./maintenance.service.js');
const { toNumber, toDateOnly, pickWritable, ACTOR_SELECT } = require('../../utils/shape.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { assertContextOpen } = require('../project/context-lock.js');

const MAX_WORKHOUR_PER_DAY = 24;

// Asset code dibuat sistem dengan format SSB-{typeCode}-{urutan 3 digit},
// mis. SSB-EXC-001. Kode ini distensil fisik di alat, jadi formatnya jangan
// diubah tanpa keputusan sadar.
const ASSET_CODE_PREFIX = 'SSB';
const ASSET_CODE_PAD = 3;

const buildAssetCode = (typeCode, sequence) =>
  `${ASSET_CODE_PREFIX}-${typeCode}-${String(sequence).padStart(ASSET_CODE_PAD, '0')}`;

/**
 * Ambil nomor urut berikutnya untuk satu jenis alat.
 * Increment-nya atomik di database, jadi dua pendaftaran bersamaan tidak
 * mungkin dapat nomor yang sama. Nomor tidak pernah didaur ulang.
 */
const nextAssetCode = async (tx, typeId, typeCode) => {
  const type = await tx.equipmentType.update({
    where: { id: typeId },
    data: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });
  return buildAssetCode(typeCode, type.lastSequence);
};

// Alat yang sedang ditangani tidak boleh diarsipkan. Penugasan proyek TIDAK
// tercermin di current_status — itu murni KONDISI alat — jadi "sedang bertugas"
// dibaca langsung dari sub_project_equipment_allocations dan equipment_pool_items
// lewat findActiveAssignment(). (Backlog C4, ditutup 4 Oktober 2026.)
const NON_ARCHIVABLE_STATUSES = ['maintenance'];

// Alat pada status ini tidak menghasilkan jam operasi
const NON_OPERATIONAL_STATUSES = ['maintenance', 'retired'];


// ============================================================
// EQUIPMENT TYPES
// ============================================================

const shapeType = (type) => ({
  id: type.id,
  typeCode: type.typeCode,
  typeName: type.typeName,
  description: type.description,
  isActive: type.isActive,
  lastSequence: type.lastSequence,
  nextAssetCode: buildAssetCode(type.typeCode, type.lastSequence + 1),
  createdAt: type.createdAt,
  itemCount: type._count?.items ?? 0,
});

const findTypeOrFail = async (id) => {
  const type = await prisma.equipmentType.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!type) throw httpError('Jenis alat tidak ditemukan', 404);
  return type;
};

const listTypes = async ({ page = 1, limit = 20, search, isActive }) => {
  const where = {
    ...(search && {
      OR: [
        { typeCode: { contains: search, mode: 'insensitive' } },
        { typeName: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(isActive !== undefined && { isActive }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentType.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: { typeCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentType.count({ where }),
  ]);

  return { data: rows.map(shapeType), total, page, limit };
};

const getTypeById = async (id) => shapeType(await findTypeOrFail(id));

const createType = async ({ typeCode, typeName, description }) => {
  const exists = await prisma.equipmentType.findUnique({ where: { typeCode } });
  if (exists) throw httpError(`Jenis alat dengan kode "${typeCode}" sudah ada`, 409);

  const type = await prisma.equipmentType.create({
    data: { typeCode, typeName, description },
    include: { _count: { select: { items: true } } },
  });
  return shapeType(type);
};

// typeCode immutable — dipakai sebagai acuan kode aset di lapangan
const updateType = async (id, { typeName, description, isActive }) => {
  await findTypeOrFail(id);

  const type = await prisma.equipmentType.update({
    where: { id },
    data: {
      ...(typeName !== undefined && { typeName }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { _count: { select: { items: true } } },
  });
  return shapeType(type);
};

const removeType = async (id) => {
  const type = await findTypeOrFail(id);

  if (type._count.items > 0) {
    throw httpError(
      `Jenis alat masih dipakai ${type._count.items} unit alat. Nonaktifkan saja (isActive=false) daripada dihapus.`,
      409
    );
  }

  await prisma.equipmentType.delete({ where: { id } });
  return { id, typeCode: type.typeCode };
};

// ============================================================
// EQUIPMENT ITEMS
// ============================================================

/**
 * C3 — "alat ini sedang ditugaskan ke mana?"
 *
 * Dijawab dari ALOKASI dan POOL ITEM, bukan dari equipment_items.current_status.
 * current_status murni KONDISI (operational/maintenance/retired); penugasan
 * milik sub_project_equipment_allocations. Aturan ini ditulis di CLAUDE.md:
 * "alokasi adalah sumber kebenaran penugasan".
 *
 * Dibuat batch (satu query untuk sehalaman alat) supaya listItems tidak jadi
 * N+1. Mengembalikan Map<equipmentItemId, assignment>.
 */
const findActiveAssignment = async (itemIds) => {
  if (itemIds.length === 0) return new Map();

  const [allocations, rentalPoolItems] = await Promise.all([
    // Internal project: alokasi yang masih berjalan
    prisma.subProjectEquipmentAllocation.findMany({
      where: { equipmentItemId: { in: itemIds }, status: 'assigned' },
      include: {
        subProject: {
          select: {
            id: true, subProjectType: true, status: true,
            constructionProject: { select: { id: true, projectCode: true, projectName: true } },
          },
        },
      },
    }),
    // External rental: item pool milik rental project yang masih hidup
    prisma.equipmentPoolItem.findMany({
      where: {
        equipmentItemId: { in: itemIds },
        status: { in: ['available', 'assigned'] },
        equipmentPool: { ownerType: 'external_rental_project', status: { in: ['draft', 'active'] } },
      },
      include: {
        equipmentPool: {
          select: {
            id: true, poolCode: true,
            externalRentalProject: { select: { id: true, rentalProjectCode: true, rentalProjectName: true } },
          },
        },
      },
    }),
  ]);

  const map = new Map();

  for (const pi of rentalPoolItems) {
    const rental = pi.equipmentPool.externalRentalProject;
    map.set(pi.equipmentItemId, {
      type: 'external_rental',
      poolId: pi.equipmentPool.id,
      poolCode: pi.equipmentPool.poolCode,
      poolItemId: pi.id,
      poolItemStatus: pi.status,
      externalRentalProjectId: rental?.id ?? null,
      projectCode: rental?.rentalProjectCode ?? null,
      projectName: rental?.rentalProjectName ?? null,
    });
  }

  // Alokasi internal ditulis BELAKANGAN supaya menang kalau sebuah unit
  // (karena data lama yang tidak konsisten) terbaca di dua jalur sekaligus —
  // alokasi adalah sumber kebenaran, pool item hanya wadahnya.
  for (const a of allocations) {
    const project = a.subProject.constructionProject;
    map.set(a.equipmentItemId, {
      type: 'internal_project',
      allocationId: a.id,
      allocationStatus: a.status,
      subProjectId: a.subProject.id,
      subProjectType: a.subProject.subProjectType,
      subProjectStatus: a.subProject.status,
      constructionProjectId: project.id,
      projectCode: project.projectCode,
      projectName: project.projectName,
      allocatedAt: a.allocatedAt,
      receivedAt: a.receivedAt,
      // Alat sudah dialokasikan tapi belum dikonfirmasi sampai di lokasi
      isReceived: Boolean(a.receivedAt),
    });
  }

  return map;
};

const shapeItem = (item) => ({
  id: item.id,
  assetCode: item.assetCode,
  equipmentTypeId: item.equipmentTypeId,
  equipmentType: item.equipmentType
    ? { id: item.equipmentType.id, typeCode: item.equipmentType.typeCode, typeName: item.equipmentType.typeName }
    : undefined,
  plateNumber: item.plateNumber,
  brand: item.brand,
  model: item.model,
  serialNumber: item.serialNumber,
  manufactureYear: item.manufactureYear,
  currentStatus: item.currentStatus,
  totalWorkhour: toNumber(item.totalWorkhour),
  defaultHourlyRate: toNumber(item.defaultHourlyRate),
  rateNotes: item.rateNotes,
  rateUpdatedAt: item.rateUpdatedAt,
  notes: item.notes,
  isActive: item.isActive,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const shapeStatusLog = (log) => ({
  id: log.id,
  oldStatus: log.oldStatus,
  newStatus: log.newStatus,
  sourceType: log.sourceType,
  sourceId: log.sourceId,
  notes: log.notes,
  changedAt: log.changedAt,
  changedBy: log.changedByUser
    ? { id: log.changedByUser.id, username: log.changedByUser.username, fullName: log.changedByUser.fullName }
    : null,
});

const findItemOrFail = async (id) => {
  const item = await prisma.equipmentItem.findUnique({ where: { id }, include: { equipmentType: true } });
  if (!item) throw httpError('Unit alat tidak ditemukan', 404);
  return item;
};

const listItems = async ({ page = 1, limit = 20, typeId, status, search, isActive }) => {
  const where = {
    ...(typeId && { equipmentTypeId: typeId }),
    ...(status && { currentStatus: status }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { assetCode: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentItem.findMany({
      where,
      include: { equipmentType: true },
      orderBy: { assetCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentItem.count({ where }),
  ]);

  // C3 — satu query untuk sehalaman alat, bukan satu per baris
  const assignments = await findActiveAssignment(rows.map((r) => r.id));

  return {
    data: rows.map((r) => ({ ...shapeItem(r), assignment: assignments.get(r.id) ?? null })),
    total, page, limit,
  };
};

/** Detail alat + riwayat status terakhir + ringkasan workhour */
const getItemById = async (id) => {
  const item = await findItemOrFail(id);

  const [statusLogs, workhourAgg, lastWorkhour] = await Promise.all([
    prisma.equipmentStatusLog.findMany({
      where: { equipmentItemId: id },
      include: { changedByUser: { select: { id: true, username: true, fullName: true } } },
      orderBy: { changedAt: 'desc' },
      take: 10,
    }),
    prisma.equipmentWorkhourLog.aggregate({
      where: { equipmentItemId: id, isVoided: false },
      _sum: { totalWorkhour: true },
      _count: true,
    }),
    prisma.equipmentWorkhourLog.findFirst({
      where: { equipmentItemId: id, isVoided: false },
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
      select: { workDate: true },
    }),
  ]);

  const assignments = await findActiveAssignment([id]);

  return {
    ...shapeItem(item),
    // C3 — penugasan dibaca dari alokasi, bukan dari current_status
    assignment: assignments.get(id) ?? null,
    statusHistory: statusLogs.map(shapeStatusLog),
    workhourSummary: {
      totalLogs: workhourAgg._count,
      totalWorkhourLogged: toNumber(workhourAgg._sum.totalWorkhour) ?? 0,
      lastWorkDate: toDateOnly(lastWorkhour?.workDate),
    },
  };
};

// Hanya field ini yang boleh ditulis klien. currentStatus, totalWorkhour, dan
// rateUpdatedAt dikelola sistem — jangan pernah ambil langsung dari request body.
const ITEM_WRITABLE_FIELDS = [
  'plateNumber', 'brand', 'model', 'serialNumber', 'manufactureYear', 'rateNotes', 'notes',
];

const createItem = async (payload, user) => {
  const { equipmentTypeId, defaultHourlyRate } = payload;
  const writable = pickWritable(payload, ITEM_WRITABLE_FIELDS);

  const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);
  if (!type.isActive) throw httpError(`Jenis alat "${type.typeCode}" sedang nonaktif`, 409);

  // Catat status awal supaya audit trail alat lengkap sejak unit didaftarkan
  const item = await prisma.$transaction(async (tx) => {
    // Kode aset SELALU dibuat sistem. Override manual (dulu khusus super_admin,
    // untuk migrasi) dibuang 15 Okt 2026 — migrasi data lama lewat skrip impor.
    const assetCode = await nextAssetCode(tx, type.id, type.typeCode);

    const created = await tx.equipmentItem.create({
      data: {
        equipmentTypeId,
        assetCode,
        ...writable,
        ...(defaultHourlyRate !== undefined && {
          defaultHourlyRate,
          rateUpdatedAt: new Date(),
        }),
      },
      include: { equipmentType: true },
    });

    await tx.equipmentStatusLog.create({
      data: {
        equipmentItemId: created.id,
        oldStatus: null,
        newStatus: created.currentStatus,
        sourceType: 'manual',
        notes: 'Registrasi unit alat baru',
        changedBy: user.id,
      },
    });

    // Jadwal servis lahir bersama unitnya, dari ambang jenis alat. Baris jenis
    // sudah terkunci oleh nextAssetCode, jadi ambang yang ditambahkan bersamaan
    // tidak terlewat.
    await maintenance.syncItemSettings(tx, created);

    return created;
  });

  return shapeItem(item);
};

/**
 * Update data master alat. `currentStatus` sengaja tidak diterima di sini —
 * perubahan status wajib lewat changeItemStatus() supaya selalu ter-audit.
 */
const updateItem = async (id, payload, user) => {
  const item = await findItemOrFail(id);
  const { equipmentTypeId, defaultHourlyRate, isActive } = payload;
  const writable = pickWritable(payload, ITEM_WRITABLE_FIELDS);

  if (equipmentTypeId !== undefined && equipmentTypeId !== item.equipmentTypeId) {
    const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
    if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);
    if (!type.isActive) throw httpError(`Jenis alat "${type.typeCode}" sedang nonaktif`, 409);
  }

  // rate_updated_at hanya bergerak kalau nominal rate-nya memang berubah
  const rateChanged =
    defaultHourlyRate !== undefined && toNumber(defaultHourlyRate) !== toNumber(item.defaultHourlyRate);

  const typeChanged = equipmentTypeId !== undefined && equipmentTypeId !== item.equipmentTypeId;

  const updated = await prisma.$transaction(async (tx) => {
    if (typeChanged) await maintenance.lockEquipmentType(tx, equipmentTypeId);
    const result = await tx.equipmentItem.update({
      where: { id },
      data: {
        ...writable,
        ...(isActive !== undefined && { isActive }),
        ...(equipmentTypeId !== undefined && { equipmentTypeId }),
        ...(defaultHourlyRate !== undefined && { defaultHourlyRate }),
        ...(rateChanged && { rateUpdatedAt: new Date() }),
      },
      include: { equipmentType: true },
    });
    // Ganti jenis = ganti ambang servis: aspek yang sama tetap membawa hitungannya,
    // aspek jenis lama dinonaktifkan, aspek jenis baru dibuatkan
    if (typeChanged) await maintenance.syncItemSettings(tx, result);
    return result;
  });

  return shapeItem(updated);
};

const changeItemStatus = async (id, { status, notes, sourceType, sourceId }, userId) => {
  const item = await findItemOrFail(id);

  if (item.currentStatus === status) {
    throw httpError(`Alat sudah berstatus "${status}"`, 409);
  }
  if (!item.isActive && status !== 'retired') {
    throw httpError('Alat nonaktif tidak bisa diubah statusnya. Aktifkan dulu unit alatnya.', 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.equipmentItem.update({
      where: { id },
      data: { currentStatus: status },
      include: { equipmentType: true },
    });

    await tx.equipmentStatusLog.create({
      data: {
        equipmentItemId: id,
        oldStatus: item.currentStatus,
        newStatus: status,
        sourceType: sourceType || 'manual',
        sourceId: sourceId ?? null,
        notes,
        changedBy: userId,
      },
    });

    return result;
  });

  return shapeItem(updated);
};

const listItemStatusLogs = async (itemId, { page = 1, limit = 20 }) => {
  await findItemOrFail(itemId);

  const [rows, total] = await Promise.all([
    prisma.equipmentStatusLog.findMany({
      where: { equipmentItemId: itemId },
      include: { changedByUser: { select: { id: true, username: true, fullName: true } } },
      orderBy: { changedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentStatusLog.count({ where: { equipmentItemId: itemId } }),
  ]);

  return { data: rows.map(shapeStatusLog), total, page, limit };
};

// Soft delete — ERD: alat nonaktif tidak boleh dipilih pada transaksi baru
const removeItem = async (id) => {
  const item = await findItemOrFail(id);

  if (!item.isActive) throw httpError('Unit alat sudah nonaktif', 409);
  if (NON_ARCHIVABLE_STATUSES.includes(item.currentStatus)) {
    throw httpError(`Alat sedang berstatus "${item.currentStatus}" dan tidak bisa dinonaktifkan`, 409);
  }

  // C4 — alat yang sedang dipakai proyek tidak boleh diarsipkan. Tanpa ini,
  // unit yang sedang bertugas bisa hilang dari daftar aktif sementara
  // alokasinya masih hidup dan jam kerjanya masih dicatat.
  const assignment = (await findActiveAssignment([id])).get(id);
  if (assignment) {
    const where = assignment.type === 'internal_project'
      ? `tahapan "${assignment.subProjectType}" pada ${assignment.projectCode}`
      : `rental project ${assignment.projectCode ?? assignment.poolCode}`;
    throw httpError(
      `Alat "${item.assetCode}" sedang ditugaskan ke ${where}. Selesaikan atau kembalikan alokasinya dulu.`,
      409
    );
  }

  const updated = await prisma.equipmentItem.update({
    where: { id },
    data: { isActive: false },
    include: { equipmentType: true },
  });
  return shapeItem(updated);
};

// ============================================================
// WORKHOUR LOGS
// Log tidak pernah diubah atau dihapus. Salah input -> dibatalkan (void) lalu
// dicatat ulang; pembatalan menarik kembali jam alat & counter servis.
// ============================================================

const WORKHOUR_INCLUDE = {
  equipmentItem: true,
  createdByUser: { select: ACTOR_SELECT },
  voidedByUser: { select: ACTOR_SELECT },
};

const shapeWorkhourLog = (log) => ({
  id: log.id,
  equipmentItemId: log.equipmentItemId,
  equipmentItem: log.equipmentItem
    ? { id: log.equipmentItem.id, assetCode: log.equipmentItem.assetCode }
    : undefined,
  // Konteks pekerjaan — salah satunya terisi sesuai sourceType, atau dua-duanya
  // null untuk manual_adjustment. Lihat CONTEXT_BY_SOURCE di bawah.
  subProjectEquipmentAllocationId: log.subProjectEquipmentAllocationId,
  equipmentPoolItemId: log.equipmentPoolItemId,
  workDate: toDateOnly(log.workDate),
  workSession: log.workSession,
  startedAt: log.startedAt,
  stoppedAt: log.stoppedAt,
  pausedDurationMinutes: log.pausedDurationMinutes,
  totalWorkhour: toNumber(log.totalWorkhour),
  sourceType: log.sourceType,
  description: log.description,
  createdAt: log.createdAt,
  createdBy: log.createdByUser ?? null,
  isVoided: log.isVoided,
  voidReason: log.voidReason,
  voidedAt: log.voidedAt,
  voidedBy: log.voidedByUser ?? null,
});

/**
 * Konteks wajib per sourceType — cerminan CHECK constraint di database.
 * Ditegakkan DUA KALI dengan sengaja: di sini supaya pesannya bisa dimengerti
 * manusia, dan di database supaya tidak ada jalan masuk lain yang melanggarnya.
 */
const CONTEXT_BY_SOURCE = {
  internal_project: {
    required: 'subProjectEquipmentAllocationId',
    forbidden: 'equipmentPoolItemId',
    label: 'alokasi alat ke sub-project',
  },
  external_rental: {
    required: 'equipmentPoolItemId',
    forbidden: 'subProjectEquipmentAllocationId',
    label: 'item pool alat rental',
  },
  manual_adjustment: { required: null, forbidden: null, label: 'koreksi manual' },
};

// Jam kerja boleh dicatat (dan dibatalkan) selama PEKERJAANNYA masih berjalan,
// walau alatnya sudah ditarik: catatan yang terlambat atau salah ketik baru
// ketahuan setelah alat pulang. Begitu tahapan / kontrak rental ditutup, datanya
// terkunci. Alokasi `cancelled` dan pool item yang tidak pernah jalan tidak
// pernah menghasilkan jam.
const RECORDABLE_ALLOCATION_STATUSES = ['assigned', 'completed', 'returned'];
const RECORDABLE_POOL_ITEM_STATUSES = ['available', 'completed'];

const loadAllocationContext = (client, id) => client.subProjectEquipmentAllocation.findUnique({
  where: { id },
  include: { subProject: { select: { id: true, subProjectType: true, status: true } } },
});

const loadPoolItemContext = (client, id) => client.equipmentPoolItem.findUnique({
  where: { id },
  include: {
    equipmentPool: {
      select: { id: true, ownerType: true, externalRentalProject: { select: { id: true, rentalProjectCode: true, status: true } } },
    },
  },
});

/** Baris yang dikunci (FOR SHARE) saat menulis — sama dengan yang dikunci penutupan (L8). */
const lockContextOf = (sourceType, context) => {
  if (sourceType === 'internal_project') return { subProjectId: context.subProject.id };
  if (sourceType === 'external_rental') return { externalRentalProjectId: context.equipmentPool.externalRentalProject.id };
  return {};
};

/** Tahapan / kontrak rental pemilik log masih terbuka? Dipakai catat & batal. */
const assertWorkContextOpen = (sourceType, context) => {
  if (sourceType === 'internal_project' && context.subProject.status !== 'active') {
    throw httpError(`Tahapan berstatus "${context.subProject.status}" — jam kerjanya sudah terkunci`, 409);
  }
  if (sourceType === 'external_rental') {
    const rental = context.equipmentPool.externalRentalProject;
    if (rental.status !== 'active') {
      throw httpError(`Kontrak rental ${rental.rentalProjectCode} berstatus "${rental.status}" — jam kerjanya hanya bisa dicatat/dibatalkan saat kontrak aktif`, 409);
    }
  }
};

/**
 * Menentukan unit alat dari konteksnya. Untuk internal_project dan
 * external_rental, equipment_item_id adalah KOLOM TERKELOLA SISTEM — dibaca
 * dari alokasi/pool item, bukan dari request body. Kiriman klien yang tidak
 * cocok ditolak daripada diam-diam ditimpa, supaya salah input ketahuan
 * pengirimnya, bukan terkubur.
 */
const resolveWorkhourContext = async (payload) => {
  const { sourceType, equipmentItemId: claimedItemId } = payload;
  const rule = CONTEXT_BY_SOURCE[sourceType];

  if (rule.forbidden && payload[rule.forbidden] !== undefined && payload[rule.forbidden] !== null) {
    throw httpError(
      `sourceType "${sourceType}" tidak boleh mengirim ${rule.forbidden} — konteksnya ${rule.label}`,
      400
    );
  }

  // manual_adjustment: tidak lewat proyek manapun, jadi unitnya memang harus
  // disebut klien. Ini satu-satunya jalur yang boleh begitu.
  if (!rule.required) {
    if (payload.subProjectEquipmentAllocationId || payload.equipmentPoolItemId) {
      throw httpError('manual_adjustment tidak terikat alokasi maupun pool item', 400);
    }
    if (!claimedItemId) throw httpError('equipmentItemId wajib diisi untuk manual_adjustment', 400);
    return { equipmentItemId: claimedItemId, subProjectEquipmentAllocationId: null, equipmentPoolItemId: null, lock: {} };
  }

  const contextId = payload[rule.required];
  if (!contextId) {
    throw httpError(`sourceType "${sourceType}" wajib mengirim ${rule.required} (${rule.label})`, 400);
  }

  let context;
  if (sourceType === 'internal_project') {
    context = await loadAllocationContext(prisma, contextId);
    if (!context) throw httpError(`Alokasi alat dengan ID ${contextId} tidak ditemukan`, 404);
    if (!RECORDABLE_ALLOCATION_STATUSES.includes(context.status)) {
      throw httpError(`Alokasi berstatus "${context.status}" — alat tidak pernah bekerja di alokasi ini`, 409);
    }
  } else {
    context = await loadPoolItemContext(prisma, contextId);
    if (!context) throw httpError(`Pool item dengan ID ${contextId} tidak ditemukan`, 404);
    // sourceType dan pemilik pool harus searah. Pool milik construction project
    // jam kerjanya dicatat lewat alokasi, bukan lewat pool item.
    if (context.equipmentPool.ownerType !== 'external_rental_project') {
      throw httpError(
        'Pool item ini milik construction project. Jam kerja internal dicatat lewat alokasi ke sub-project, ' +
        'bukan langsung ke pool item.',
        400
      );
    }
    if (!RECORDABLE_POOL_ITEM_STATUSES.includes(context.status)) {
      throw httpError(`Pool item berstatus "${context.status}" — unit ini tidak pernah bekerja di kontrak ini`, 409);
    }
  }
  assertWorkContextOpen(sourceType, context);

  const derivedItemId = context.equipmentItemId;
  if (!derivedItemId) {
    throw httpError(
      `${rule.label} ini belum terikat unit alat spesifik. Tentukan unitnya dulu sebelum mencatat jam kerja.`,
      409
    );
  }
  if (claimedItemId && Number(claimedItemId) !== derivedItemId) {
    throw httpError(
      `equipmentItemId (${claimedItemId}) tidak cocok dengan unit pada ${rule.label} (${derivedItemId}). ` +
      'Kolom ini ditentukan sistem dari konteksnya — kosongkan saja.',
      400
    );
  }

  return {
    equipmentItemId: derivedItemId,
    subProjectEquipmentAllocationId: sourceType === 'internal_project' ? contextId : null,
    equipmentPoolItemId: sourceType === 'external_rental' ? contextId : null,
    lock: lockContextOf(sourceType, context),
  };
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Jam bersih dari rentang - jeda; null kalau jamnya tidak dicatat. */
const netHours = ({ startedAt, stoppedAt, pausedDurationMinutes = 0 }) => {
  if (!startedAt) return null;
  return round2(((new Date(stoppedAt) - new Date(startedAt)) / 60000 - Number(pausedDurationMinutes)) / 60);
};

/**
 * Aturan satu entri jam kerja — cerminan CHECK di database
 * (equipment_workhour_logs_times_check / _total_check).
 */
const assertEntryTimes = (entry, label = '') => {
  const { startedAt, stoppedAt, totalWorkhour } = entry;
  const paused = Number(entry.pausedDurationMinutes ?? 0);
  if (!startedAt !== !stoppedAt) throw httpError(`${label}startedAt dan stoppedAt diisi berpasangan`, 400);
  if (!startedAt) return;

  const spanMinutes = (new Date(stoppedAt) - new Date(startedAt)) / 60000;
  if (spanMinutes <= 0) throw httpError(`${label}stoppedAt harus lebih besar dari startedAt`, 400);
  // Tanpa ini jam kerja bersih bisa negatif tanpa ada yang menolak
  if (paused > spanMinutes) {
    throw httpError(`${label}Jeda ${paused} menit melebihi rentang kerja ${Math.round(spanMinutes)} menit (startedAt sampai stoppedAt)`, 400);
  }
  const expected = netHours(entry);
  if (Math.abs(Number(totalWorkhour) - expected) > 0.01) {
    throw httpError(`${label}totalWorkhour ${totalWorkhour} tidak sama dengan rentang dikurangi jeda (${expected} jam)`, 400);
  }
};

const lockEquipmentItem = (tx, id) => tx.$queryRaw`SELECT id FROM equipment_items WHERE id = ${id} FOR UPDATE`;

/**
 * Inti pencatatan, dipakai log tunggal maupun sheet rental: semua entri satu
 * unit satu tanggal masuk dalam SATU transaksi, atau tidak sama sekali.
 *
 * Baris alat dikunci lebih dulu, baru jumlah jam hari itu dihitung — dua input
 * bersamaan tidak bisa sama-sama lolos batas 24 jam (versi lama menghitungnya
 * di luar transaksi).
 */
const recordEntries = async (context, sourceType, workDate, entries, userId) => {
  const { lock, ...link } = context;
  const { equipmentItemId } = link;
  const work = assertNotFuture(workDate, 'Tanggal kerja');
  const newHours = round2(entries.reduce((sum, e) => sum + Number(e.totalWorkhour), 0));

  try {
    return await prisma.$transaction(async (tx) => {
      // Tahapan/kontrak yang ditutup bersamaan tidak bisa lolos (cek di luar transaksi hanya untuk pesan)
      await assertContextOpen(tx, lock);
      await lockEquipmentItem(tx, equipmentItemId);
      const item = await tx.equipmentItem.findUnique({ where: { id: equipmentItemId } });
      if (!item) throw httpError(`Unit alat dengan ID ${equipmentItemId} tidak ditemukan`, 404);
      if (!item.isActive) throw httpError(`Alat "${item.assetCode}" nonaktif dan tidak bisa dipakai transaksi baru`, 409);
      // Alat di bengkel atau sudah pensiun tidak mungkin menghasilkan jam kerja.
      // Kalau dibiarkan, counter maintenance ikut jalan dan alat yang baru selesai
      // servis langsung terlihat mendekati jatuh tempo lagi.
      if (NON_OPERATIONAL_STATUSES.includes(item.currentStatus)) {
        throw httpError(`Alat "${item.assetCode}" berstatus "${item.currentStatus}" sehingga jam kerjanya tidak bisa dicatat`, 409);
      }

      const existing = await tx.equipmentWorkhourLog.aggregate({
        where: { equipmentItemId, workDate: work, isVoided: false },
        _sum: { totalWorkhour: true },
      });
      const accumulated = round2((toNumber(existing._sum.totalWorkhour) ?? 0) + newHours);
      if (accumulated > MAX_WORKHOUR_PER_DAY) {
        throw httpError(
          `Total workhour alat ini pada ${toDateOnly(work)} jadi ${accumulated} jam, melebihi batas ${MAX_WORKHOUR_PER_DAY} jam per hari`,
          409
        );
      }

      const logs = [];
      for (const entry of entries) {
        logs.push(await tx.equipmentWorkhourLog.create({
          data: {
            // Seluruh konteks (equipmentItemId + FK alokasi/pool item) berasal dari
            // resolveWorkhourContext, bukan dari request body.
            ...link,
            workDate: work,
            workSession: entry.workSession ?? null,
            startedAt: entry.startedAt ? new Date(entry.startedAt) : null,
            stoppedAt: entry.stoppedAt ? new Date(entry.stoppedAt) : null,
            pausedDurationMinutes: Number(entry.pausedDurationMinutes ?? 0),
            totalWorkhour: entry.totalWorkhour,
            sourceType,
            description: entry.description?.trim() || null,
            createdBy: userId,
          },
          include: WORKHOUR_INCLUDE,
        }));
      }

      // Log workhour dan akumulator total_workhour pada alat bergerak bersama
      await tx.equipmentItem.update({ where: { id: equipmentItemId }, data: { totalWorkhour: { increment: newHours } } });
      // Jam kerja yang sama ikut menggerakkan hitung mundur maintenance alat ini
      const affected = await maintenance.applyWorkhourToSettings(tx, equipmentItemId, newHours);
      return { logs, affected };
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw httpError(`Sesi tersebut sudah tercatat untuk unit ini pada ${toDateOnly(work)}. Batalkan log lamanya dulu kalau mau mengganti.`, 409);
    }
    throw err;
  }
};

const assertSessionAllowed = (sourceType, workSession) => {
  if (workSession && sourceType !== 'external_rental') {
    throw httpError('workSession hanya untuk sourceType external_rental', 400);
  }
};

const createWorkhourLog = async (payload, userId) => {
  const { workDate, sourceType } = payload;
  assertSessionAllowed(sourceType, payload.workSession);
  assertEntryTimes(payload);

  // Konteks diselesaikan DULU: dia yang menentukan unit alatnya untuk
  // internal_project dan external_rental.
  const context = await resolveWorkhourContext(payload);
  const { logs, affected } = await recordEntries(context, sourceType, workDate, [payload], userId);

  return {
    ...shapeWorkhourLog(logs[0]),
    // Supaya pencatat langsung tahu kalau input ini memicu jadwal servis
    maintenanceImpact: affected,
  };
};

/**
 * Timesheet rental satu unit satu tanggal: 1–3 sesi (pagi/siang/overtime)
 * sekaligus. Menggantikan beberapa POST terpisah yang bisa gagal di tengah dan
 * meninggalkan sebagian sesi tercatat. Total jam dihitung sistem dari jamnya.
 */
const createRentalSheet = async (payload, userId) => {
  const { equipmentPoolItemId, workDate, sessions } = payload;

  const seen = new Set();
  for (const s of sessions) {
    if (seen.has(s.workSession)) throw httpError(`Sesi "${s.workSession}" dikirim lebih dari sekali`, 400);
    seen.add(s.workSession);
  }
  const entries = sessions.map((s) => ({ ...s, totalWorkhour: netHours(s) }));
  entries.forEach((e) => assertEntryTimes(e, `Sesi ${e.workSession}: `));
  entries.forEach((e) => {
    if (!(e.totalWorkhour > 0)) throw httpError(`Sesi ${e.workSession}: jam kerja bersih harus lebih dari 0`, 400);
  });
  const ordered = [...entries].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  for (let i = 1; i < ordered.length; i++) {
    if (new Date(ordered[i].startedAt) < new Date(ordered[i - 1].stoppedAt)) {
      throw httpError(`Sesi ${ordered[i - 1].workSession} dan ${ordered[i].workSession} bertumpuk jamnya`, 400);
    }
  }

  const context = await resolveWorkhourContext({ sourceType: 'external_rental', equipmentPoolItemId });
  const { logs, affected } = await recordEntries(context, 'external_rental', workDate, entries, userId);
  return { logs: logs.map(shapeWorkhourLog), maintenanceImpact: affected };
};

/**
 * Batalkan log yang salah input. Jam alat dan counter servis yang masih memuat
 * jam ini ikut dikurangi (lihat revertWorkhourFromSettings). Koreksinya:
 * batalkan, lalu catat ulang yang benar.
 */
const voidWorkhourLog = async (id, { reason }, userId) => {
  const log = await prisma.equipmentWorkhourLog.findUnique({ where: { id } });
  if (!log) throw httpError('Workhour log tidak ditemukan', 404);
  if (log.isVoided) throw httpError('Workhour log ini sudah dibatalkan', 409);

  let lock = {};
  if (log.subProjectEquipmentAllocationId) {
    const context = await loadAllocationContext(prisma, log.subProjectEquipmentAllocationId);
    assertWorkContextOpen('internal_project', context);
    lock = lockContextOf('internal_project', context);
  } else if (log.equipmentPoolItemId) {
    const context = await loadPoolItemContext(prisma, log.equipmentPoolItemId);
    assertWorkContextOpen('external_rental', context);
    lock = lockContextOf('external_rental', context);
  }

  const hours = toNumber(log.totalWorkhour);
  const result = await prisma.$transaction(async (tx) => {
    await assertContextOpen(tx, lock);
    await lockEquipmentItem(tx, log.equipmentItemId);
    await claimTransition(tx.equipmentWorkhourLog, { id, isVoided: false }, {
      isVoided: true, voidReason: reason, voidedBy: userId, voidedAt: new Date(),
    });
    await tx.equipmentItem.update({ where: { id: log.equipmentItemId }, data: { totalWorkhour: { decrement: hours } } });
    const affected = await maintenance.revertWorkhourFromSettings(tx, log.equipmentItemId, hours, log.createdAt);
    const updated = await tx.equipmentWorkhourLog.findUnique({ where: { id }, include: WORKHOUR_INCLUDE });
    return { updated, affected };
  });

  return { ...shapeWorkhourLog(result.updated), maintenanceImpact: result.affected };
};

const listWorkhourLogsByItem = async (itemId, { page = 1, limit = 20, startDate, endDate, sourceType, includeVoided = false }) => {
  await findItemOrFail(itemId);

  const where = {
    equipmentItemId: itemId,
    ...(sourceType && { sourceType }),
    ...(!includeVoided && { isVoided: false }),
    ...((startDate || endDate) && {
      workDate: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

  const [rows, total, agg] = await Promise.all([
    prisma.equipmentWorkhourLog.findMany({
      where,
      include: WORKHOUR_INCLUDE,
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentWorkhourLog.count({ where }),
    // Log yang dibatalkan tidak pernah ikut dijumlahkan, walau ditampilkan
    prisma.equipmentWorkhourLog.aggregate({ where: { ...where, isVoided: false }, _sum: { totalWorkhour: true } }),
  ]);

  return {
    data: rows.map(shapeWorkhourLog),
    total,
    page,
    limit,
    // Total jam pada rentang filter, bukan cuma halaman yang tampil
    summary: { totalWorkhourInRange: toNumber(agg._sum.totalWorkhour) ?? 0 },
  };
};

module.exports = {
  listTypes, getTypeById, createType, updateType, removeType,
  listItems, getItemById, createItem, updateItem, changeItemStatus, listItemStatusLogs, removeItem,
  createWorkhourLog, createRentalSheet, voidWorkhourLog, listWorkhourLogsByItem,
};
