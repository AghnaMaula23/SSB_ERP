const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const maintenance = require('./maintenance.service.js');

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

/**
 * Kalau super_admin memasukkan kode manual yang kebetulan mengikuti pola
 * generate (mis. SSB-EXC-007), counter ikut dimajukan supaya generate
 * berikutnya tidak menabrak kode tersebut.
 */
const syncSequenceWithManualCode = async (tx, type, assetCode) => {
  const match = assetCode.match(new RegExp(`^${ASSET_CODE_PREFIX}-${type.typeCode}-(\\d+)$`));
  if (!match) return;

  const manualSequence = Number(match[1]);
  if (manualSequence > type.lastSequence) {
    await tx.equipmentType.update({
      where: { id: type.id },
      data: { lastSequence: manualSequence },
    });
  }
};

// Alat yang sedang ditangani tidak boleh diarsipkan. Penugasan proyek TIDAK
// lagi tercermin di sini — saat modul Project ada, pengecekan "sedang bertugas"
// harus ditambahkan dengan membaca sub_project_equipment_allocations.
const NON_ARCHIVABLE_STATUSES = ['maintenance'];

// Alat pada status ini tidak menghasilkan jam operasi
const NON_OPERATIONAL_STATUSES = ['maintenance', 'retired'];

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

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

  return { data: rows.map(shapeItem), total, page, limit };
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
      where: { equipmentItemId: id },
      _sum: { totalWorkhour: true },
      _count: true,
    }),
    prisma.equipmentWorkhourLog.findFirst({
      where: { equipmentItemId: id },
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
      select: { workDate: true },
    }),
  ]);

  return {
    ...shapeItem(item),
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

const pickWritable = (payload, fields) =>
  Object.fromEntries(fields.filter((f) => payload[f] !== undefined).map((f) => [f, payload[f]]));

const createItem = async (payload, user) => {
  const { equipmentTypeId, assetCode: manualAssetCode, defaultHourlyRate } = payload;
  const writable = pickWritable(payload, ITEM_WRITABLE_FIELDS);
  const canOverrideAssetCode = user.roles.includes('super_admin');

  const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);
  if (!type.isActive) throw httpError(`Jenis alat "${type.typeCode}" sedang nonaktif`, 409);

  if (manualAssetCode && !canOverrideAssetCode) {
    throw httpError('Kode aset dibuat otomatis oleh sistem dan tidak bisa diisi manual', 403);
  }
  if (manualAssetCode) {
    const exists = await prisma.equipmentItem.findUnique({ where: { assetCode: manualAssetCode } });
    if (exists) throw httpError(`Kode aset "${manualAssetCode}" sudah dipakai`, 409);
  }

  // Catat status awal supaya audit trail alat lengkap sejak unit didaftarkan
  const item = await prisma.$transaction(async (tx) => {
    let assetCode = manualAssetCode;
    if (assetCode) {
      await syncSequenceWithManualCode(tx, type, assetCode);
    } else {
      assetCode = await nextAssetCode(tx, type.id, type.typeCode);
    }

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
  const { equipmentTypeId, assetCode, defaultHourlyRate, isActive } = payload;
  const writable = pickWritable(payload, ITEM_WRITABLE_FIELDS);

  if (equipmentTypeId !== undefined && equipmentTypeId !== item.equipmentTypeId) {
    const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
    if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);
    if (!type.isActive) throw httpError(`Jenis alat "${type.typeCode}" sedang nonaktif`, 409);
  }

  if (assetCode !== undefined && assetCode !== item.assetCode) {
    // Kode aset sudah distensil fisik di alat — hanya super_admin yang boleh mengoreksi
    if (!user.roles.includes('super_admin')) {
      throw httpError('Kode aset dibuat otomatis oleh sistem dan tidak bisa diubah', 403);
    }
    const exists = await prisma.equipmentItem.findUnique({ where: { assetCode } });
    if (exists) throw httpError(`Kode aset "${assetCode}" sudah dipakai`, 409);
  }

  // rate_updated_at hanya bergerak kalau nominal rate-nya memang berubah
  const rateChanged =
    defaultHourlyRate !== undefined && toNumber(defaultHourlyRate) !== toNumber(item.defaultHourlyRate);

  const updated = await prisma.equipmentItem.update({
    where: { id },
    data: {
      ...writable,
      ...(isActive !== undefined && { isActive }),
      ...(equipmentTypeId !== undefined && { equipmentTypeId }),
      ...(assetCode !== undefined && { assetCode }),
      ...(defaultHourlyRate !== undefined && { defaultHourlyRate }),
      ...(rateChanged && { rateUpdatedAt: new Date() }),
    },
    include: { equipmentType: true },
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

  const updated = await prisma.equipmentItem.update({
    where: { id },
    data: { isActive: false },
    include: { equipmentType: true },
  });
  return shapeItem(updated);
};

// ============================================================
// WORKHOUR LOGS
// ============================================================

const shapeWorkhourLog = (log) => ({
  id: log.id,
  equipmentItemId: log.equipmentItemId,
  equipmentItem: log.equipmentItem
    ? { id: log.equipmentItem.id, assetCode: log.equipmentItem.assetCode }
    : undefined,
  projectId: log.projectId,
  subProjectId: log.subProjectId,
  workDate: toDateOnly(log.workDate),
  startedAt: log.startedAt,
  stoppedAt: log.stoppedAt,
  totalWorkhour: toNumber(log.totalWorkhour),
  sourceType: log.sourceType,
  description: log.description,
  createdAt: log.createdAt,
  createdBy: log.createdByUser
    ? { id: log.createdByUser.id, username: log.createdByUser.username, fullName: log.createdByUser.fullName }
    : null,
});

const WORKHOUR_WRITABLE_FIELDS = ['projectId', 'subProjectId', 'description'];

const createWorkhourLog = async (payload, userId) => {
  const { equipmentItemId, workDate, startedAt, stoppedAt, totalWorkhour, sourceType } = payload;
  const writable = pickWritable(payload, WORKHOUR_WRITABLE_FIELDS);

  const item = await prisma.equipmentItem.findUnique({ where: { id: equipmentItemId } });
  if (!item) throw httpError(`Unit alat dengan ID ${equipmentItemId} tidak ditemukan`, 404);
  if (!item.isActive) throw httpError(`Alat "${item.assetCode}" nonaktif dan tidak bisa dipakai transaksi baru`, 409);
  // Alat di bengkel atau sudah pensiun tidak mungkin menghasilkan jam kerja.
  // Kalau dibiarkan, counter maintenance ikut jalan dan alat yang baru selesai
  // servis langsung terlihat mendekati jatuh tempo lagi.
  if (NON_OPERATIONAL_STATUSES.includes(item.currentStatus)) {
    throw httpError(
      `Alat "${item.assetCode}" berstatus "${item.currentStatus}" sehingga jam kerjanya tidak bisa dicatat`,
      409
    );
  }

  const work = new Date(workDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (work > today) throw httpError('Tanggal kerja tidak boleh di masa depan', 400);

  if (startedAt && stoppedAt && new Date(stoppedAt) <= new Date(startedAt)) {
    throw httpError('stoppedAt harus lebih besar dari startedAt', 400);
  }

  // Total jam kerja per alat per hari tidak boleh melebihi 24 jam
  const existing = await prisma.equipmentWorkhourLog.aggregate({
    where: { equipmentItemId, workDate: work },
    _sum: { totalWorkhour: true },
  });
  const accumulated = (toNumber(existing._sum.totalWorkhour) ?? 0) + Number(totalWorkhour);
  if (accumulated > MAX_WORKHOUR_PER_DAY) {
    throw httpError(
      `Total workhour alat ini pada ${toDateOnly(work)} jadi ${accumulated} jam, melebihi batas ${MAX_WORKHOUR_PER_DAY} jam per hari`,
      409
    );
  }

  // Log workhour dan akumulator total_workhour pada alat harus bergerak bersama
  const log = await prisma.$transaction(async (tx) => {
    const created = await tx.equipmentWorkhourLog.create({
      data: {
        equipmentItemId,
        workDate: work,
        startedAt: startedAt ? new Date(startedAt) : null,
        stoppedAt: stoppedAt ? new Date(stoppedAt) : null,
        totalWorkhour,
        sourceType,
        ...writable,
        createdBy: userId,
      },
      include: {
        equipmentItem: true,
        createdByUser: { select: { id: true, username: true, fullName: true } },
      },
    });

    await tx.equipmentItem.update({
      where: { id: equipmentItemId },
      data: { totalWorkhour: { increment: totalWorkhour } },
    });

    // Jam kerja yang sama ikut menggerakkan hitung mundur maintenance alat ini
    const affected = await maintenance.applyWorkhourToSettings(tx, equipmentItemId, totalWorkhour);

    return { created, affected };
  });

  return {
    ...shapeWorkhourLog(log.created),
    // Supaya operator langsung tahu kalau input ini memicu jadwal servis
    maintenanceImpact: log.affected,
  };
};

const listWorkhourLogsByItem = async (itemId, { page = 1, limit = 20, startDate, endDate, sourceType }) => {
  await findItemOrFail(itemId);

  const where = {
    equipmentItemId: itemId,
    ...(sourceType && { sourceType }),
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
      include: { createdByUser: { select: { id: true, username: true, fullName: true } } },
      orderBy: [{ workDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentWorkhourLog.count({ where }),
    prisma.equipmentWorkhourLog.aggregate({ where, _sum: { totalWorkhour: true } }),
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
  createWorkhourLog, listWorkhourLogsByItem,
};
