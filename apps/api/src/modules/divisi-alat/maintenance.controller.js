const service = require('./maintenance.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const pageParams = (req) => ({
  page: Number(req.query.page) || 1,
  limit: Math.min(Number(req.query.limit) || 20, 100),
});

const boolQuery = (value) => (value === undefined ? undefined : value === 'true');

// --- Maintenance Aspects ---

const listAspects = async (req, res, next) => {
  try {
    const result = await service.listAspects({
      ...pageParams(req),
      search: req.query.search,
      isActive: boolQuery(req.query.isActive),
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailAspect = async (req, res, next) => {
  try {
    return success(res, await service.getAspectById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const createAspect = async (req, res, next) => {
  try {
    const aspect = await service.createAspect(req.body);
    return created(res, aspect, 'Aspek maintenance berhasil dibuat');
  } catch (err) { next(err); }
};

const updateAspect = async (req, res, next) => {
  try {
    const aspect = await service.updateAspect(Number(req.params.id), req.body);
    return success(res, aspect, 'Aspek maintenance berhasil diperbarui');
  } catch (err) { next(err); }
};

const removeAspect = async (req, res, next) => {
  try {
    const result = await service.removeAspect(Number(req.params.id));
    return success(res, result, 'Aspek maintenance berhasil dihapus');
  } catch (err) { next(err); }
};

// --- Maintenance Settings ---

const settingFilters = (req) => ({
  ...pageParams(req),
  status: req.query.status,
  isActive: boolQuery(req.query.isActive),
});

const listSettings = async (req, res, next) => {
  try {
    const result = await service.listSettings({
      ...settingFilters(req),
      equipmentItemId: req.query.equipmentItemId ? Number(req.query.equipmentItemId) : undefined,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const listSettingsByItem = async (req, res, next) => {
  try {
    const result = await service.listSettingsByItem(Number(req.params.itemId), settingFilters(req));
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailSetting = async (req, res, next) => {
  try {
    return success(res, await service.getSettingById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const createSetting = async (req, res, next) => {
  try {
    const setting = await service.createSetting(Number(req.params.itemId), req.body);
    return created(res, setting, 'Maintenance setting berhasil dibuat');
  } catch (err) { next(err); }
};

const updateSetting = async (req, res, next) => {
  try {
    const setting = await service.updateSetting(Number(req.params.id), req.body);
    return success(res, setting, 'Maintenance setting berhasil diperbarui');
  } catch (err) { next(err); }
};

const removeSetting = async (req, res, next) => {
  try {
    const result = await service.removeSetting(Number(req.params.id));
    return success(res, result, 'Maintenance setting berhasil dihapus');
  } catch (err) { next(err); }
};

// --- Maintenance Records ---

const recordFilters = (req) => ({
  ...pageParams(req),
  maintenanceType: req.query.maintenanceType,
  status: req.query.status,
  startDate: req.query.startDate,
  endDate: req.query.endDate,
});

const listRecords = async (req, res, next) => {
  try {
    const result = await service.listRecords({
      ...recordFilters(req),
      equipmentItemId: req.query.equipmentItemId ? Number(req.query.equipmentItemId) : undefined,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const listRecordsByItem = async (req, res, next) => {
  try {
    const result = await service.listRecordsByItem(Number(req.params.itemId), recordFilters(req));
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailRecord = async (req, res, next) => {
  try {
    return success(res, await service.getRecordById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const createRecord = async (req, res, next) => {
  try {
    const record = await service.createRecord(req.body, req.user.id);
    return created(res, record, 'Riwayat maintenance berhasil dicatat');
  } catch (err) { next(err); }
};

const cancelRecord = async (req, res, next) => {
  try {
    const record = await service.cancelRecord(Number(req.params.id), req.body);
    return success(res, record, 'Riwayat maintenance berhasil dibatalkan');
  } catch (err) { next(err); }
};

module.exports = {
  listAspects, detailAspect, createAspect, updateAspect, removeAspect,
  listSettings, listSettingsByItem, detailSetting, createSetting, updateSetting, removeSetting,
  listRecords, listRecordsByItem, detailRecord, createRecord, cancelRecord,
};
