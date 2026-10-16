const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { assertNotFuture } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, toDateOnly } = require('../../utils/shape.js');
const { claimTransition } = require('../../utils/status-transition.js');

const MAINTENANCE_DOC_TYPE = 'MTN';
const MAINTENANCE_DOC_PAD = 6;


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

/**
 * Ambang sebuah setting = ambang JENIS alatnya (16 Okt 2026), tidak disimpan
 * per unit. null hanya untuk setting nonaktif yang aspeknya tidak berlaku lagi.
 */
const thresholdOf = (setting) => setting.typeThreshold?.thresholdValue ?? null;

// ============================================================
// MAINTENANCE ASPECTS
// ============================================================

const shapeAspect = (aspect) => ({
  id: aspect.id,
  aspectCode: aspect.aspectCode,
  aspectName: aspect.aspectName,
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

const createAspect = async ({ aspectCode, aspectName, warningLeadValue, description }) => {
  const exists = await prisma.maintenanceAspect.findUnique({ where: { aspectCode } });
  if (exists) throw httpError(`Aspek dengan kode "${aspectCode}" sudah ada`, 409);

  const aspect = await prisma.maintenanceAspect.create({
    data: {
      aspectCode,
      aspectName,
      description,
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
const updateAspect = async (id, { aspectName, warningLeadValue, description, isActive }) => {
  await findAspectOrFail(id);

  const aspect = await prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceAspect.update({
      where: { id },
      data: {
        ...(aspectName !== undefined && { aspectName }),
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
  const settings = await tx.equipmentMaintenanceSetting.findMany({
    where: { maintenanceAspectId: aspectId }, include: { typeThreshold: true },
  });

  for (const setting of settings) {
    const status = computeStatus({ ...setting, thresholdValue: thresholdOf(setting), warningLeadValue });
    if (status !== setting.status) {
      await tx.equipmentMaintenanceSetting.update({ where: { id: setting.id }, data: { status } });
    }
  }
};

const removeAspect = async (id) => {
  const aspect = await findAspectOrFail(id);

  const typeCount = await prisma.equipmentTypeMaintenanceThreshold.count({ where: { maintenanceAspectId: id } });
  if (typeCount > 0) {
    throw httpError(`Aspek masih berlaku untuk ${typeCount} jenis alat. Hapus ambangnya dari jenis tersebut dulu, atau nonaktifkan aspeknya.`, 409);
  }
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
  typeThreshold: { select: { thresholdValue: true } },
  equipmentItem: {
    select: {
      id: true,
      assetCode: true,
      totalWorkhour: true,
      currentStatus: true,
      equipmentType: { select: { typeName: true } },
    },
  },
};

const shapeSetting = (setting) => {
  const threshold = toNumber(thresholdOf(setting));
  const used = toNumber(setting.currentValueSinceReset);
  const lead = toNumber(setting.maintenanceAspect?.warningLeadValue);

  return {
    id: setting.id,
    equipmentItemId: setting.equipmentItemId,
    equipmentItem: setting.equipmentItem
      ? {
          id: setting.equipmentItem.id,
          assetCode: setting.equipmentItem.assetCode,
          equipmentType: setting.equipmentItem.equipmentType
            ? { typeName: setting.equipmentItem.equipmentType.typeName }
            : undefined,
        }
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
    // Turunan dari ambang jenis alat — tetap dikirim supaya klien tidak perlu tahu asalnya
    thresholdValue: threshold,
    currentValueSinceReset: used,
    // Hitung mundur menuju jatuh tempo. Negatif berarti sudah lewat.
    remainingValue: threshold === null ? null : threshold - used,
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

/**
 * Satu-satunya yang bisa diubah per unit: aktif/nonaktif (mis. unit ini tidak
 * punya komponen tersebut). Ambang mengikuti jenis alat, dan setting dibuat
 * otomatis — tidak ada tambah/hapus manual.
 */
const updateSetting = async (id, { isActive }) => {
  const setting = await findSettingOrFail(id);
  if (isActive === undefined) return shapeSetting(setting);
  if (isActive && !setting.typeThresholdId) {
    throw httpError(`Aspek "${setting.maintenanceAspect.aspectCode}" tidak berlaku untuk jenis alat ini. Tambahkan ambangnya ke jenis alat dulu.`, 409);
  }

  const updated = await prisma.equipmentMaintenanceSetting.update({
    where: { id },
    data: {
      isActive,
      status: computeStatus({
        thresholdValue: thresholdOf(setting),
        currentValueSinceReset: setting.currentValueSinceReset,
        warningLeadValue: setting.maintenanceAspect.warningLeadValue,
        isActive,
      }),
    },
    include: settingInclude,
  });

  return shapeSetting(updated);
};

/**
 * Dipanggil dari pembuatan workhour log (batch 1), di dalam transaksi yang sama.
 * Setiap jam kerja yang tercatat ikut menggerakkan counter semua setting aktif
 * milik alat tersebut, lalu statusnya dihitung ulang.
 */
const applyWorkhourToSettings = async (tx, equipmentItemId, hours) => {
  const settings = await tx.equipmentMaintenanceSetting.findMany({
    where: { equipmentItemId, isActive: true },
    include: { maintenanceAspect: true, typeThreshold: true },
  });

  const touched = [];
  for (const setting of settings) {
    // Increment ATOMIK, bukan "baca nilai + jam lalu tulis". Versi lama
    // menghitung dari nilai yang dibaca di awal transaksi. Kalau reset servis
    // (createRecord) commit di antara baca dan tulis itu, reset-nya TERTIMPA:
    // alat yang baru diservis langsung tampil warning lagi. Terbukti 13 Okt
    // 2026: 8 dari 8 percobaan reset hilang di versi lama, 0 di versi ini.
    // (Dua log jam kerja bersamaan sudah aman lewat kunci baris dari increment
    // totalWorkhour di createWorkhourLog — jalur reset tidak lewat kunci itu.)
    const incremented = await tx.equipmentMaintenanceSetting.update({
      where: { id: setting.id },
      data: { currentValueSinceReset: { increment: Number(hours) } },
    });
    const nextValue = Number(incremented.currentValueSinceReset);
    const status = computeStatus({
      thresholdValue: thresholdOf(setting),
      currentValueSinceReset: nextValue,
      warningLeadValue: setting.maintenanceAspect.warningLeadValue,
      isActive: true,
    });

    if (status !== incremented.status) {
      await tx.equipmentMaintenanceSetting.update({ where: { id: setting.id }, data: { status } });
    }

    touched.push({
      settingId: setting.id,
      aspectCode: setting.maintenanceAspect.aspectCode,
      remainingValue: Number(thresholdOf(setting)) - nextValue,
      status,
      statusChanged: status !== setting.status,
    });
  }

  return touched;
};

// ============================================================
// AMBANG PER JENIS ALAT (16 Okt 2026)
// docs/keputusan-desain-divisi-alat.md — "Ambang maintenance per jenis alat"
//
// Invarian: setiap unit punya SATU setting per aspek yang berlaku untuk
// jenisnya, menunjuk ambang jenis itu. Dijaga syncItemSettings, yang dipanggil
// saat unit didaftarkan, unit berganti jenis, dan ambang jenis ditambah/diubah.
// Semua jalur itu mengunci baris equipment_types dulu (createItem lewat
// increment last_sequence), jadi unit baru dan ambang baru tidak bisa saling
// melewatkan.
// ============================================================

const lockEquipmentType = (tx, typeId) =>
  tx.$queryRaw`SELECT id FROM equipment_types WHERE id = ${typeId} FOR UPDATE`;

/**
 * Selaraskan setting satu unit dengan ambang jenisnya, di transaksi pemanggil.
 * - aspek berlaku, belum ada setting      -> dibuat, hitungan mulai 0 dari jam alat sekarang
 * - setting ada tapi tadinya tidak berlaku -> diaktifkan lagi, hitungan mulai 0
 *   (jam kerja tidak dihitung selama nonaktif, jadi angka lamanya basi)
 * - setting ada & berlaku                  -> ditautkan ke ambang (bisa berganti
 *   karena unit pindah jenis); hitungan & pilihan aktif/nonaktif per unit DIPERTAHANKAN
 * - aspek tidak berlaku lagi               -> dilepas & dinonaktifkan; riwayat tetap
 */
const syncItemSettings = async (tx, item) => {
  const [thresholds, settings] = await Promise.all([
    tx.equipmentTypeMaintenanceThreshold.findMany({
      where: { equipmentTypeId: item.equipmentTypeId }, include: { maintenanceAspect: true },
    }),
    tx.equipmentMaintenanceSetting.findMany({ where: { equipmentItemId: item.id } }),
  ]);

  for (const t of thresholds) {
    const lead = t.maintenanceAspect.warningLeadValue;
    const setting = settings.find((st) => st.maintenanceAspectId === t.maintenanceAspectId);
    if (!setting || !setting.typeThresholdId) {
      const fresh = {
        typeThresholdId: t.id,
        isActive: true,
        currentValueSinceReset: 0,
        lastResetWorkhour: item.totalWorkhour,
        status: computeStatus({ thresholdValue: t.thresholdValue, currentValueSinceReset: 0, warningLeadValue: lead, isActive: true }),
      };
      if (setting) await tx.equipmentMaintenanceSetting.update({ where: { id: setting.id }, data: fresh });
      else await tx.equipmentMaintenanceSetting.create({ data: { ...fresh, equipmentItemId: item.id, maintenanceAspectId: t.maintenanceAspectId } });
      continue;
    }
    const status = computeStatus({ ...setting, thresholdValue: t.thresholdValue, warningLeadValue: lead });
    if (setting.typeThresholdId !== t.id || status !== setting.status) {
      await tx.equipmentMaintenanceSetting.update({ where: { id: setting.id }, data: { typeThresholdId: t.id, status } });
    }
  }

  const applicable = new Set(thresholds.map((t) => t.maintenanceAspectId));
  for (const setting of settings) {
    if (setting.typeThresholdId && !applicable.has(setting.maintenanceAspectId)) {
      await tx.equipmentMaintenanceSetting.update({
        where: { id: setting.id }, data: { typeThresholdId: null, isActive: false, status: 'inactive' },
      });
    }
  }
};

const thresholdInclude = {
  equipmentType: { select: { id: true, typeCode: true, typeName: true } },
  maintenanceAspect: { select: { id: true, aspectCode: true, aspectName: true, warningLeadValue: true } },
};

// Bentuknya sengaja sama dengan yang dulu disimpan FE di localStorage
// (maintenanceThresholdService.js), supaya layarnya cukup diganti sumber datanya.
const shapeThreshold = (row) => ({
  id: row.id,
  equipmentTypeId: row.equipmentTypeId,
  maintenanceAspectId: row.maintenanceAspectId,
  thresholdValue: toNumber(row.thresholdValue),
  equipmentType: row.equipmentType,
  maintenanceAspect: row.maintenanceAspect
    ? { ...row.maintenanceAspect, warningLeadValue: toNumber(row.maintenanceAspect.warningLeadValue) }
    : undefined,
  updatedAt: row.updatedAt,
});

const listTypeThresholds = async ({ equipmentTypeId }) => {
  const rows = await prisma.equipmentTypeMaintenanceThreshold.findMany({
    where: { ...(equipmentTypeId && { equipmentTypeId }) },
    include: thresholdInclude,
    orderBy: [{ equipmentTypeId: 'asc' }, { maintenanceAspectId: 'asc' }],
  });
  return rows.map(shapeThreshold);
};

/**
 * Tambah atau ubah ambang satu aspek untuk satu jenis alat, lalu selaraskan
 * SEMUA unit jenis itu di transaksi yang sama: unit lama langsung memakai
 * angka baru (status dihitung ulang), unit tanpa setting aspek ini dibuatkan.
 */
const upsertTypeThreshold = async (equipmentTypeId, maintenanceAspectId, { thresholdValue }) => {
  const type = await prisma.equipmentType.findUnique({ where: { id: equipmentTypeId } });
  if (!type) throw httpError(`Jenis alat dengan ID ${equipmentTypeId} tidak ditemukan`, 404);
  const aspect = await prisma.maintenanceAspect.findUnique({ where: { id: maintenanceAspectId } });
  if (!aspect) throw httpError(`Aspek maintenance dengan ID ${maintenanceAspectId} tidak ditemukan`, 404);
  if (!aspect.isActive) throw httpError(`Aspek "${aspect.aspectCode}" sedang nonaktif`, 409);

  const row = await prisma.$transaction(async (tx) => {
    await lockEquipmentType(tx, equipmentTypeId);
    const saved = await tx.equipmentTypeMaintenanceThreshold.upsert({
      where: { equipmentTypeId_maintenanceAspectId: { equipmentTypeId, maintenanceAspectId } },
      create: { equipmentTypeId, maintenanceAspectId, thresholdValue },
      update: { thresholdValue },
      include: thresholdInclude,
    });
    const items = await tx.equipmentItem.findMany({ where: { equipmentTypeId } });
    for (const item of items) await syncItemSettings(tx, item);
    return saved;
  });
  return shapeThreshold(row);
};

/**
 * Aspek tidak berlaku lagi untuk jenis ini: setting unitnya dilepas dan
 * dinonaktifkan (riwayat servis tetap), lalu ambangnya dihapus.
 */
const removeTypeThreshold = async (equipmentTypeId, maintenanceAspectId) => {
  const row = await prisma.equipmentTypeMaintenanceThreshold.findUnique({
    where: { equipmentTypeId_maintenanceAspectId: { equipmentTypeId, maintenanceAspectId } },
    include: thresholdInclude,
  });
  if (!row) throw httpError('Ambang untuk jenis alat & aspek ini tidak ditemukan', 404);

  await prisma.$transaction(async (tx) => {
    await lockEquipmentType(tx, equipmentTypeId);
    await tx.equipmentMaintenanceSetting.updateMany({
      where: { typeThresholdId: row.id }, data: { typeThresholdId: null, isActive: false, status: 'inactive' },
    });
    await tx.equipmentTypeMaintenanceThreshold.delete({ where: { id: row.id } });
  });
  return shapeThreshold(row);
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
  purchaseRequestId: record.purchaseRequestId,
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
    equipmentItemId, maintenanceSettingId, damageLogId, purchaseRequestId,
    maintenanceType, maintenanceDate, workhourAtMaintenance, actionDescription, performedBy,
  } = payload;

  const item = await findItemOrFail(equipmentItemId);

  const workDate = assertNotFuture(maintenanceDate, 'Tanggal maintenance');

  let setting = null;
  if (maintenanceSettingId) {
    setting = await prisma.equipmentMaintenanceSetting.findUnique({
      where: { id: maintenanceSettingId },
      include: { maintenanceAspect: true, typeThreshold: true },
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
        purchaseRequestId: purchaseRequestId ?? null,
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
            thresholdValue: thresholdOf(setting),
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
 * buat record baru yang benar.
 */
const cancelRecord = async (id, { notes }) => {
  const record = await findRecordOrFail(id);
  if (record.status === 'cancelled') throw httpError('Riwayat maintenance ini sudah dibatalkan', 409);

  const updated = await prisma.$transaction(async (tx) => {
    await claimTransition(tx.maintenanceRecord, { id, status: { not: 'cancelled' } }, {
      status: 'cancelled',
      actionDescription: notes
        ? `${record.actionDescription}\n[DIBATALKAN] ${notes}`
        : record.actionDescription,
    });
    return tx.maintenanceRecord.findUnique({ where: { id }, include: recordInclude });
  });

  return shapeRecord(updated);
};

module.exports = {
  computeStatus, applyWorkhourToSettings,
  listAspects, getAspectById, createAspect, updateAspect, removeAspect,
  listSettings, listSettingsByItem, getSettingById, updateSetting,
  listTypeThresholds, upsertTypeThreshold, removeTypeThreshold, syncItemSettings, lockEquipmentType,
  listRecords, listRecordsByItem, getRecordById, createRecord, cancelRecord,
};
