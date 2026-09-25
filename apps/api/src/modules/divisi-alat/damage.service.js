const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const maintenance = require('./maintenance.service.js');

const DAMAGE_DOC_TYPE = 'DMG';
const DAMAGE_DOC_PAD = 6;

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

const damageInclude = {
  equipmentItem: { select: { id: true, assetCode: true, currentStatus: true } },
  reportedByUser: { select: { id: true, username: true, fullName: true } },
  reviewedByUser: { select: { id: true, username: true, fullName: true } },
};

const shapeDamage = (log) => ({
  id: log.id,
  damageCode: log.damageCode,
  equipmentItemId: log.equipmentItemId,
  equipmentItem: log.equipmentItem
    ? { id: log.equipmentItem.id, assetCode: log.equipmentItem.assetCode, currentStatus: log.equipmentItem.currentStatus }
    : undefined,
  projectId: log.projectId,
  subProjectId: log.subProjectId,
  damageDate: toDateOnly(log.damageDate),
  status: log.status,
  description: log.description,
  // Sumber badge "Crash Level" di frontend: true = alat berhenti, false = masih jalan
  stopsOperation: log.stopsOperation,
  sparePartSource: log.sparePartSource,
  mechanicTeam: log.mechanicTeam,
  reportedBy: log.reportedByUser
    ? { id: log.reportedByUser.id, username: log.reportedByUser.username, fullName: log.reportedByUser.fullName }
    : null,
  reviewedBy: log.reviewedByUser
    ? { id: log.reviewedByUser.id, username: log.reviewedByUser.username, fullName: log.reviewedByUser.fullName }
    : null,
  reviewedAt: log.reviewedAt,
  resolvedAt: log.resolvedAt,
  createdAt: log.createdAt,
  updatedAt: log.updatedAt,
});

const findDamageOrFail = async (id) => {
  const log = await prisma.damageLog.findUnique({ where: { id }, include: damageInclude });
  if (!log) throw httpError('Laporan kerusakan tidak ditemukan', 404);
  return log;
};

const findItemOrFail = async (id) => {
  const item = await prisma.equipmentItem.findUnique({ where: { id } });
  if (!item) throw httpError(`Unit alat dengan ID ${id} tidak ditemukan`, 404);
  return item;
};

/**
 * Alat baru boleh kembali beroperasi kalau tidak ada laporan lain yang masih
 * terbuka DAN masih menghentikannya. Tanpa pengecekan ini, menyelesaikan satu
 * dari dua kerusakan akan membebaskan alat yang sebenarnya masih mogok.
 */
const hasOtherStoppingDamage = async (tx, equipmentItemId, exceptDamageId) => {
  const count = await tx.damageLog.count({
    where: {
      equipmentItemId,
      id: { not: exceptDamageId },
      status: 'reported',
      stopsOperation: true,
    },
  });
  return count > 0;
};

const canReleaseFromDamage = async (tx, equipmentItemId, damageLogId) => {
  const item = await tx.equipmentItem.findUnique({
    where: { id: equipmentItemId },
    select: { currentStatus: true, isActive: true },
  });
  if (!item || !item.isActive || item.currentStatus !== 'maintenance') return false;

  const latestStatus = await tx.equipmentStatusLog.findFirst({
    where: { equipmentItemId },
    orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
    select: { sourceType: true, sourceId: true, newStatus: true },
  });
  return latestStatus?.sourceType === 'damage_log' &&
    latestStatus.sourceId === damageLogId &&
    latestStatus.newStatus === 'maintenance';
};

/** Ubah status alat sekaligus menulis audit trail-nya. Selalu dalam satu transaksi. */
const moveEquipmentStatus = async (tx, item, newStatus, { notes, damageLogId, userId }) => {
  if (item.currentStatus === newStatus) return;

  await tx.equipmentItem.update({ where: { id: item.id }, data: { currentStatus: newStatus } });
  await tx.equipmentStatusLog.create({
    data: {
      equipmentItemId: item.id,
      oldStatus: item.currentStatus,
      newStatus,
      sourceType: 'damage_log',
      sourceId: damageLogId,
      notes,
      changedBy: userId,
    },
  });
};

const list = async ({ page = 1, limit = 20, equipmentItemId, status, stopsOperation, sparePartSource, mechanicTeam, search, startDate, endDate }) => {
  const where = {
    ...(equipmentItemId && { equipmentItemId }),
    ...(status && { status }),
    ...(stopsOperation !== undefined && { stopsOperation }),
    ...(sparePartSource && { sparePartSource }),
    ...(mechanicTeam && { mechanicTeam }),
    ...(search && {
      OR: [
        { damageCode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { equipmentItem: { assetCode: { contains: search, mode: 'insensitive' } } },
      ],
    }),
    ...((startDate || endDate) && {
      damageDate: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.damageLog.findMany({
      where,
      include: damageInclude,
      orderBy: [{ damageDate: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.damageLog.count({ where }),
  ]);

  return { data: rows.map(shapeDamage), total, page, limit };
};

const listByItem = async (itemId, params) => {
  await findItemOrFail(itemId);
  return list({ ...params, equipmentItemId: itemId });
};

/** Detail laporan + tindakan yang sudah dikerjakan untuk laporan ini */
const getById = async (id) => {
  const log = await findDamageOrFail(id);

  const records = await prisma.maintenanceRecord.findMany({
    where: { damageLogId: id },
    include: { createdByUser: { select: { id: true, username: true, fullName: true } } },
    orderBy: { maintenanceDate: 'desc' },
  });

  return {
    ...shapeDamage(log),
    maintenanceRecords: records.map((r) => ({
      id: r.id,
      maintenanceCode: r.maintenanceCode,
      maintenanceType: r.maintenanceType,
      maintenanceDate: toDateOnly(r.maintenanceDate),
      actionDescription: r.actionDescription,
      performedBy: r.performedBy,
      workhourAtMaintenance: toNumber(r.workhourAtMaintenance),
      status: r.status,
    })),
  };
};

const create = async (payload, userId) => {
  const { equipmentItemId, damageDate, description, stopsOperation, sparePartSource, mechanicTeam, projectId, subProjectId } = payload;

  const item = await findItemOrFail(equipmentItemId);
  if (!item.isActive) throw httpError(`Alat "${item.assetCode}" nonaktif`, 409);
  if (item.currentStatus === 'retired') throw httpError(`Alat "${item.assetCode}" sudah pensiun`, 409);

  const date = new Date(damageDate);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) throw httpError('Tanggal kerusakan tidak boleh di masa depan', 400);

  const log = await prisma.$transaction(async (tx) => {
    const damageCode = await maintenance.nextDocumentNumber(tx, DAMAGE_DOC_TYPE, { pad: DAMAGE_DOC_PAD });

    const created = await tx.damageLog.create({
      data: {
        damageCode,
        equipmentItemId,
        damageDate: date,
        description,
        stopsOperation: stopsOperation ?? false,
        sparePartSource,
        mechanicTeam,
        projectId: projectId ?? null,
        subProjectId: subProjectId ?? null,
        reportedBy: userId,
      },
      include: damageInclude,
    });

    // Hanya kerusakan yang menghentikan alat yang mengubah status alat.
    // Kaca retak atau AC mati tidak menghalangi alat bekerja seharian.
    if (created.stopsOperation) {
      await moveEquipmentStatus(tx, item, 'maintenance', {
        notes: `Kerusakan ${damageCode}: ${description}`.slice(0, 500),
        damageLogId: created.id,
        userId,
      });
    }

    return created;
  });

  return shapeDamage(log);
};

/**
 * Ralat laporan yang salah ketik. Hanya selama status `reported` — begitu
 * laporan selesai, keputusan sparepart dan mekanik sudah dieksekusi di lapangan.
 */
const update = async (id, payload, userId) => {
  const log = await findDamageOrFail(id);
  if (log.status !== 'reported') {
    throw httpError(`Laporan berstatus "${log.status}" tidak bisa diubah lagi`, 409);
  }

  const { description, sparePartSource, mechanicTeam, damageDate, stopsOperation } = payload;

  if (damageDate) {
    const date = new Date(damageDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (date > today) throw httpError('Tanggal kerusakan tidak boleh di masa depan', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.damageLog.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(sparePartSource !== undefined && { sparePartSource }),
        ...(mechanicTeam !== undefined && { mechanicTeam }),
        ...(damageDate !== undefined && { damageDate: new Date(damageDate) }),
        ...(stopsOperation !== undefined && { stopsOperation }),
      },
      include: damageInclude,
    });

    // Mengubah penanda "alat berhenti" ikut menggerakkan status alat
    if (stopsOperation !== undefined && stopsOperation !== log.stopsOperation) {
      const item = await tx.equipmentItem.findUnique({ where: { id: log.equipmentItemId } });

      if (stopsOperation) {
        await moveEquipmentStatus(tx, item, 'maintenance', {
          notes: `Kerusakan ${log.damageCode} ditandai menghentikan alat`,
          damageLogId: id,
          userId,
        });
      } else if (await canReleaseFromDamage(tx, log.equipmentItemId, id) && !(await hasOtherStoppingDamage(tx, log.equipmentItemId, id))) {
        await moveEquipmentStatus(tx, item, 'operational', {
          notes: `Kerusakan ${log.damageCode} ditandai tidak menghentikan alat`,
          damageLogId: id,
          userId,
        });
      }
    }

    return result;
  });

  return shapeDamage(updated);
};

/**
 * Menyelesaikan kerusakan WAJIB menghasilkan maintenance record — tanpa itu
 * riwayat alat jadi bolong: ada kerusakan tercatat, tapi tidak ada jejak
 * tindakan apa pun yang dikerjakan.
 */
const resolve = async (id, payload, userId) => {
  const log = await findDamageOrFail(id);
  if (log.status !== 'reported') {
    throw httpError(`Laporan berstatus "${log.status}" tidak bisa diselesaikan`, 409);
  }

  const { maintenanceType, actionDescription, performedBy, maintenanceDate, maintenanceSettingId } = payload;

  const workDate = maintenanceDate ? new Date(maintenanceDate) : new Date();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (workDate > today) throw httpError('Tanggal pengerjaan tidak boleh di masa depan', 400);

  let setting = null;
  if (maintenanceSettingId) {
    setting = await prisma.equipmentMaintenanceSetting.findUnique({
      where: { id: maintenanceSettingId },
      include: { maintenanceAspect: true },
    });
    if (!setting) throw httpError(`Maintenance setting dengan ID ${maintenanceSettingId} tidak ditemukan`, 404);
    if (setting.equipmentItemId !== log.equipmentItemId) {
      throw httpError('Maintenance setting tersebut milik unit alat yang berbeda', 409);
    }
  }

  const item = await findItemOrFail(log.equipmentItemId);

  const resolved = await prisma.$transaction(async (tx) => {
    const maintenanceCode = await maintenance.nextDocumentNumber(tx, 'MTN', { pad: 6 });

    await tx.maintenanceRecord.create({
      data: {
        maintenanceCode,
        equipmentItemId: log.equipmentItemId,
        damageLogId: id,
        maintenanceSettingId: maintenanceSettingId ?? null,
        maintenanceType,
        maintenanceDate: workDate,
        workhourAtMaintenance: item.totalWorkhour,
        actionDescription,
        performedBy,
        createdBy: userId,
      },
    });

    // Kalau perbaikannya sekalian mereset jadwal servis, counter ikut nol
    if (setting) {
      await tx.equipmentMaintenanceSetting.update({
        where: { id: setting.id },
        data: {
          currentValueSinceReset: 0,
          lastMaintenanceDate: workDate,
          lastResetWorkhour: item.totalWorkhour,
          status: maintenance.computeStatus({
            thresholdValue: setting.thresholdValue,
            currentValueSinceReset: 0,
            warningLeadValue: setting.maintenanceAspect.warningLeadValue,
            isActive: setting.isActive,
          }),
        },
      });
    }

    const result = await tx.damageLog.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
      include: damageInclude,
    });

    if (log.stopsOperation && await canReleaseFromDamage(tx, log.equipmentItemId, id) && !(await hasOtherStoppingDamage(tx, log.equipmentItemId, id))) {
      await moveEquipmentStatus(tx, item, 'operational', {
        notes: `Kerusakan ${log.damageCode} selesai diperbaiki`,
        damageLogId: id,
        userId,
      });
    }

    return result;
  });

  return shapeDamage(resolved);
};

const cancel = async (id, { notes }, userId) => {
  const log = await findDamageOrFail(id);
  if (log.status !== 'reported') {
    throw httpError(`Laporan berstatus "${log.status}" tidak bisa dibatalkan`, 409);
  }

  const item = await findItemOrFail(log.equipmentItemId);

  const cancelled = await prisma.$transaction(async (tx) => {
    const result = await tx.damageLog.update({
      where: { id },
      data: {
        status: 'cancelled',
        description: notes ? `${log.description}\n[DIBATALKAN] ${notes}` : log.description,
      },
      include: damageInclude,
    });

    if (log.stopsOperation && await canReleaseFromDamage(tx, log.equipmentItemId, id) && !(await hasOtherStoppingDamage(tx, log.equipmentItemId, id))) {
      await moveEquipmentStatus(tx, item, 'operational', {
        notes: `Laporan ${log.damageCode} dibatalkan`,
        damageLogId: id,
        userId,
      });
    }

    return result;
  });

  return shapeDamage(cancelled);
};

module.exports = { list, listByItem, getById, create, update, resolve, cancel };
