const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');

const MAINTENANCE_DOC_TYPE = 'MTN';
const MAINTENANCE_DOC_PAD = 6;

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/**
 * Nomor dokumen berurutan, mis. MTN-000001.
 * Increment-nya atomik di database supaya dua input bersamaan tidak kembar.
 * Period 'ALL' = deret tunggal tanpa reset periodik.
 */
const nextDocumentNumber = async (tx, docType, { period = 'ALL', pad = 6 } = {}) => {
  const sequence = await tx.documentSequence.upsert({
    where: { docType_period: { docType, period } },
    update: { lastSequence: { increment: 1 } },
    create: { docType, period, lastSequence: 1 },
  });
  return `${docType}-${String(sequence.lastSequence).padStart(pad, '0')}`;
};

/**
 * Status dihitung dari SISA jam menuju jatuh tempo, bukan dari jam terpakai.
 *   sisa > lead        -> normal
 *   0 < sisa <= lead   -> warning   (default lead 50 jam)
 *   -lead < sisa <= 0  -> due
 *   sisa <= -lead      -> overdue
 */
const computeStatus = ({ thresholdValue, currentValueSinceReset, warningLeadValue, isActive }) => {
  if (!isActive) return 'inactive';

  const remaining = Number(thresholdValue) - Number(currentValueSinceReset);
  const lead = Number(warningLeadValue);

  if (remaining <= -lead) return 'overdue';
  if (remaining <= 0) return 'due';
  if (remaining <= lead) return 'warning';
  return 'normal';
};

// ============================================================
// MAINTENANCE ASPECTS
// ============================================================

const shapeAspect = (aspect) => ({
  id: aspect.id,
  aspectCode: aspect.aspectCode,
  aspectName: aspect.aspectName,
  defaultThresholdValue: toNumber(aspect.defaultThresholdValue),
  warningLeadValue: toNumber(aspect.warningLeadValue),
  description: aspect.description,
  isActive: aspect.isActive,
  createdAt: aspect.createdAt,
  settingCount: aspect._count?.settings ?? 0,
});

const findAspectOrFail = async (id) => {
  const aspect = await prisma.maintenanceAspect.findUnique({
    where: { id },
    include: { _count: { select: { settings: true } } },
  });
  if (!aspect) throw httpError('Aspek maintenance tidak ditemukan', 404);
  return aspect;
};

const listAspects = async ({ page = 1, limit = 20, search, isActive }) => {
  const where = {
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { aspectCode: { contains: search, mode: 'insensitive' } },
        { aspectName: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceAspect.findMany({
      where,
      include: { _count: { select: { settings: true } } },
      orderBy: { aspectCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.maintenanceAspect.count({ where }),
  ]);

  return { data: rows.map(shapeAspect), total, page, limit };
};

const getAspectById = async (id) => shapeAspect(await findAspectOrFail(id));

const createAspect = async ({ aspectCode, aspectName, defaultThresholdValue, warningLeadValue, description }) => {
  const exists = await prisma.maintenanceAspect.findUnique({ where: { aspectCode } });
  if (exists) throw httpError(`Aspek dengan kode "${aspectCode}" sudah ada`, 409);

  const aspect = await prisma.maintenanceAspect.create({
    data: {
      aspectCode,
      aspectName,
      description,
      ...(defaultThresholdValue !== undefined && { defaultThresholdValue }),
      ...(warningLeadValue !== undefined && { warningLeadValue }),
    },
    include: { _count: { select: { settings: true } } },
  });
  return shapeAspect(aspect);
};

/**
 * aspectCode immutable. Mengubah warningLeadValue berpengaruh ke semua setting
 * yang memakai aspek ini, jadi statusnya dihitung ulang sekalian.
 */
const updateAspect = async (id, { aspectName, defaultThresholdValue, warningLeadValue, description, isActive }) => {
  await findAspectOrFail(id);

  const aspect = await prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceAspect.update({
      where: { id },
      data: {
        ...(aspectName !== undefined && { aspectName }),
        ...(defaultThresholdValue !== undefined && { defaultThresholdValue }),
        ...(warningLeadValue !== undefined && { warningLeadValue }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { _count: { select: { settings: true } } },
    });

    if (warningLeadValue !== undefined) await recomputeSettingsOfAspect(tx, id, updated.warningLeadValue);
    return updated;
  });

  return shapeAspect(aspect);
};

const recomputeSettingsOfAspect = async (tx, aspectId, warningLeadValue) => {
  const settings = await tx.equipmentMaintenanceSetting.findMany({ where: { maintenanceAspectId: aspectId } });

  for (const setting of settings) {
    const status = computeStatus({ ...setting, warningLeadValue });
    if (status !== setting.status) {
      await tx.equipmentMaintenanceSetting.update({ where: { id: setting.id }, data: { status } });
    }
  }
};

const removeAspect = async (id) => {
  const aspect = await findAspectOrFail(id);

  if (aspect._count.settings > 0) {
    throw httpError(
      `Aspek masih dipakai ${aspect._count.settings} setting alat. Nonaktifkan saja daripada dihapus.`,
      409
    );
  }

  await prisma.maintenanceAspect.delete({ where: { id } });
  return { id, aspectCode: aspect.aspectCode };
};

// ============================================================
// EQUIPMENT MAINTENANCE SETTINGS
// ============================================================

const settingInclude = {
  maintenanceAspect: true,
  equipmentItem: { select: { id: true, assetCode: true, totalWorkhour: true, currentStatus: true } },
};

const shapeSetting = (setting) => {
  const threshold = toNumber(setting.thresholdValue);
  const used = toNumber(setting.currentValueSinceReset);
  const lead = toNumber(setting.maintenanceAspect?.warningLeadValue);

  return {
    id: setting.id,
    equipmentItemId: setting.equipmentItemId,
    equipmentItem: setting.equipmentItem
      ? { id: setting.equipmentItem.id, assetCode: setting.equipmentItem.assetCode }
      : undefined,
    maintenanceAspectId: setting.maintenanceAspectId,
    maintenanceAspect: setting.maintenanceAspect
      ? {
          id: setting.maintenanceAspect.id,
          aspectCode: setting.maintenanceAspect.aspectCode,
          aspectName: setting.maintenanceAspect.aspectName,
          warningLeadValue: lead,
        }
      : undefined,
    thresholdValue: threshold,
    currentValueSinceReset: used,
    // Hitung mundur menuju jatuh tempo. Negatif berarti sudah lewat.
    remainingValue: threshold - used,
    progressPercent: threshold > 0 ? Math.round((used / threshold) * 1000) / 10 : null,
    status: setting.status,
    lastMaintenanceDate: toDateOnly(setting.lastMaintenanceDate),
    lastResetWorkhour: toNumber(setting.lastResetWorkhour),
    isActive: setting.isActive,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  };
};

const findSettingOrFail = async (id) => {
  const setting = await prisma.equipmentMaintenanceSetting.findUnique({ where: { id }, include: settingInclude });
  if (!setting) throw httpError('Maintenance setting tidak ditemukan', 404);
  return setting;
};

const findItemOrFail = async (id) => {
  const item = await prisma.equipmentItem.findUnique({ where: { id } });
  if (!item) throw httpError('Unit alat tidak ditemukan', 404);
  return item;
};

/** Dipakai dashboard "alat apa yang perlu servis" lintas semua unit alat. */
const listSettings = async ({ page = 1, limit = 20, equipmentItemId, status, isActive }) => {
  const where = {
    ...(equipmentItemId && { equipmentItemId }),
    ...(status && { status }),
    ...(isActive !== undefined && { isActive }),
  };

  const [rows, total] = await Promise.all([
    prisma.equipmentMaintenanceSetting.findMany({
      where,
      include: settingInclude,
      // Yang paling mendesak tampil lebih dulu
      orderBy: [{ status: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.equipmentMaintenanceSetting.count({ where }),
  ]);

  return { data: rows.map(shapeSetting), total, page, limit };
};

const listSettingsByItem = async (itemId, params) => {
  await findItemOrFail(itemId);
  return listSettings({ ...params, equipmentItemId: itemId });
};

const getSettingById = async (id) => shapeSetting(await findSettingOrFail(id));

const createSetting = async (itemId, { maintenanceAspectId, thresholdValue }) => {
  const item = await findItemOrFail(itemId);
  if (!item.isActive) throw httpError(`Alat "${item.assetCode}" nonaktif`, 409);

  const aspect = await prisma.maintenanceAspect.findUnique({ where: { id: maintenanceAspectId } });
  if (!aspect) throw httpError(`Aspek maintenance dengan ID ${maintenanceAspectId} tidak ditemukan`, 404);
  if (!aspect.isActive) throw httpError(`Aspek "${aspect.aspectCode}" sedang nonaktif`, 409);

  const exists = await prisma.equipmentMaintenanceSetting.findUnique({
    where: { equipmentItemId_maintenanceAspectId: { equipmentItemId: itemId, maintenanceAspectId } },
  });
  if (exists) throw httpError(`Alat ini sudah punya setting untuk aspek "${aspect.aspectCode}"`, 409);

  // Threshold boleh dikosongkan kalau aspeknya sudah punya nilai default
  const threshold = thresholdValue ?? toNumber(aspect.defaultThresholdValue);
  if (threshold === null || threshold === undefined) {
    throw httpError(`thresholdValue wajib diisi karena aspek "${aspect.aspectCode}" tidak punya nilai default`, 400);
  }

  const setting = await prisma.equipmentMaintenanceSetting.create({
    data: {
      equipmentItemId: itemId,
      maintenanceAspectId,
      thresholdValue: threshold,
      currentValueSinceReset: 0,
      // Catat posisi jam alat saat setting dibuat sebagai titik nol
      lastResetWorkhour: item.totalWorkhour,
      status: computeStatus({
        thresholdValue: threshold,
        currentValueSinceReset: 0,
        warningLeadValue: aspect.warningLeadValue,
        isActive: true,
      }),
    },
    include: settingInclude,
  });

  return shapeSetting(setting);
};

const updateSetting = async (id, { thresholdValue, isActive }) => {
  const setting = await findSettingOrFail(id);

  const nextThreshold = thresholdValue ?? toNumber(setting.thresholdValue);
  const nextActive = isActive ?? setting.isActive;

  const updated = await prisma.equipmentMaintenanceSetting.update({
    where: { id },
    data: {
      ...(thresholdValue !== undefined && { thresholdValue }),
      ...(isActive !== undefined && { isActive }),
      status: computeStatus({
        thresholdValue: nextThreshold,
        currentValueSinceReset: setting.currentValueSinceReset,
        warningLeadValue: setting.maintenanceAspect.warningLeadValue,
        isActive: nextActive,
      }),
    },
    include: settingInclude,
  });

  return shapeSetting(updated);
};

const removeSetting = async (id) => {
  const setting = await findSettingOrFail(id);

  const recordCount = await prisma.maintenanceRecord.count({ where: { maintenanceSettingId: id } });
  if (recordCount > 0) {
    throw httpError(
      `Setting sudah punya ${recordCount} riwayat maintenance. Nonaktifkan saja daripada dihapus.`,
      409
    );
  }

  await prisma.equipmentMaintenanceSetting.delete({ where: { id } });
  return { id, aspectCode: setting.maintenanceAspect.aspectCode };
};

/**
 * Dipanggil dari pembuatan workhour log (batch 1), di dalam transaksi yang sama.
 * Setiap jam kerja yang tercatat ikut menggerakkan counter semua setting aktif
 * milik alat tersebut, lalu statusnya dihitung ulang.
 */
const applyWorkhourToSettings = async (tx, equipmentItemId, hours) => {
  const settings = await tx.equipmentMaintenanceSetting.findMany({
    where: { equipmentItemId, isActive: true },
    include: { maintenanceAspect: true },
  });

  const touched = [];
  for (const setting of settings) {
    const nextValue = Number(setting.currentValueSinceReset) + Number(hours);
    const status = computeStatus({
      thresholdValue: setting.thresholdValue,
      currentValueSinceReset: nextValue,
      warningLeadValue: setting.maintenanceAspect.warningLeadValue,
      isActive: true,
    });

    await tx.equipmentMaintenanceSetting.update({
      where: { id: setting.id },
      data: { currentValueSinceReset: nextValue, status },
    });

    touched.push({
      settingId: setting.id,
      aspectCode: setting.maintenanceAspect.aspectCode,
      remainingValue: Number(setting.thresholdValue) - nextValue,
      status,
      statusChanged: status !== setting.status,
    });
  }

  return touched;
};

// ============================================================
// MAINTENANCE RECORDS
// ============================================================

const recordInclude = {
  equipmentItem: { select: { id: true, assetCode: true } },
  maintenanceSetting: { include: { maintenanceAspect: { select: { aspectCode: true, aspectName: true } } } },
  createdByUser: { select: { id: true, username: true, fullName: true } },
};

const shapeRecord = (record) => ({
  id: record.id,
  maintenanceCode: record.maintenanceCode,
  equipmentItemId: record.equipmentItemId,
  equipmentItem: record.equipmentItem
    ? { id: record.equipmentItem.id, assetCode: record.equipmentItem.assetCode }
    : undefined,
  maintenanceSettingId: record.maintenanceSettingId,
  maintenanceAspect: record.maintenanceSetting?.maintenanceAspect
    ? {
        aspectCode: record.maintenanceSetting.maintenanceAspect.aspectCode,
        aspectName: record.maintenanceSetting.maintenanceAspect.aspectName,
      }
    : null,
  damageLogId: record.damageLogId,
  purchaseRequestItemId: record.purchaseRequestItemId,
  maintenanceType: record.maintenanceType,
  maintenanceDate: toDateOnly(record.maintenanceDate),
  workhourAtMaintenance: toNumber(record.workhourAtMaintenance),
  actionDescription: record.actionDescription,
  performedBy: record.performedBy,
  status: record.status,
  createdAt: record.createdAt,
  createdBy: record.createdByUser
    ? { id: record.createdByUser.id, username: record.createdByUser.username, fullName: record.createdByUser.fullName }
    : null,
});

const findRecordOrFail = async (id) => {
  const record = await prisma.maintenanceRecord.findUnique({ where: { id }, include: recordInclude });
  if (!record) throw httpError('Riwayat maintenance tidak ditemukan', 404);
  return record;
};

const listRecords = async ({ page = 1, limit = 20, equipmentItemId, maintenanceType, status, startDate, endDate }) => {
  const where = {
    ...(equipmentItemId && { equipmentItemId }),
    ...(maintenanceType && { maintenanceType }),
    ...(status && { status }),
    ...((startDate || endDate) && {
      maintenanceDate: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where,
      include: recordInclude,
      orderBy: [{ maintenanceDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.maintenanceRecord.count({ where }),
  ]);

  return { data: rows.map(shapeRecord), total, page, limit };
};

const listRecordsByItem = async (itemId, params) => {
  await findItemOrFail(itemId);
  return listRecords({ ...params, equipmentItemId: itemId });
};

const getRecordById = async (id) => shapeRecord(await findRecordOrFail(id));

/**
 * Mencatat tindakan maintenance yang SUDAH selesai dikerjakan.
 * Kalau terkait sebuah setting, counter setting itu direset ke nol dan
 * hitung mundurnya mulai lagi dari threshold.
 */
const createRecord = async (payload, userId) => {
  const {
    equipmentItemId, maintenanceSettingId, damageLogId, purchaseRequestItemId,
    maintenanceType, maintenanceDate, workhourAtMaintenance, actionDescription, performedBy,
  } = payload;

  const item = await findItemOrFail(equipmentItemId);

  const workDate = new Date(maintenanceDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (workDate > today) throw httpError('Tanggal maintenance tidak boleh di masa depan', 400);

  let setting = null;
  if (maintenanceSettingId) {
    setting = await prisma.equipmentMaintenanceSetting.findUnique({
      where: { id: maintenanceSettingId },
      include: { maintenanceAspect: true },
    });
    if (!setting) throw httpError(`Maintenance setting dengan ID ${maintenanceSettingId} tidak ditemukan`, 404);
    if (setting.equipmentItemId !== equipmentItemId) {
      throw httpError('Maintenance setting tersebut milik unit alat yang berbeda', 409);
    }
  }

  const record = await prisma.$transaction(async (tx) => {
    const maintenanceCode = await nextDocumentNumber(tx, MAINTENANCE_DOC_TYPE, { pad: MAINTENANCE_DOC_PAD });

    const created = await tx.maintenanceRecord.create({
      data: {
        maintenanceCode,
        equipmentItemId,
        maintenanceSettingId: maintenanceSettingId ?? null,
        damageLogId: damageLogId ?? null,
        purchaseRequestItemId: purchaseRequestItemId ?? null,
        maintenanceType,
        maintenanceDate: workDate,
        // Default ke jam alat saat ini supaya titik servis terekam walau tidak diisi
        workhourAtMaintenance: workhourAtMaintenance ?? item.totalWorkhour,
        actionDescription,
        performedBy,
        createdBy: userId,
      },
      include: recordInclude,
    });

    if (setting) {
      await tx.equipmentMaintenanceSetting.update({
        where: { id: setting.id },
        data: {
          currentValueSinceReset: 0,
          lastMaintenanceDate: workDate,
          lastResetWorkhour: item.totalWorkhour,
          status: computeStatus({
            thresholdValue: setting.thresholdValue,
            currentValueSinceReset: 0,
            warningLeadValue: setting.maintenanceAspect.warningLeadValue,
            isActive: setting.isActive,
          }),
        },
      });
    }

    return created;
  });

  return shapeRecord(record);
};

/**
 * Membatalkan riwayat yang salah input. Counter setting TIDAK dikembalikan
 * otomatis karena jam kerja sudah berjalan sejak reset — kalau perlu dikoreksi,
 * sesuaikan thresholdValue atau buat record baru yang benar.
 */
const cancelRecord = async (id, { notes }) => {
  const record = await findRecordOrFail(id);
  if (record.status === 'cancelled') throw httpError('Riwayat maintenance ini sudah dibatalkan', 409);

  const updated = await prisma.maintenanceRecord.update({
    where: { id },
    data: {
      status: 'cancelled',
      actionDescription: notes
        ? `${record.actionDescription}\n[DIBATALKAN] ${notes}`
        : record.actionDescription,
    },
    include: recordInclude,
  });

  return shapeRecord(updated);
};

module.exports = {
  computeStatus, applyWorkhourToSettings, nextDocumentNumber,
  listAspects, getAspectById, createAspect, updateAspect, removeAspect,
  listSettings, listSettingsByItem, getSettingById, createSetting, updateSetting, removeSetting,
  listRecords, listRecordsByItem, getRecordById, createRecord, cancelRecord,
};
