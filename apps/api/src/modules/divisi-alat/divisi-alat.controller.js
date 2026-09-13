const service = require('./divisi-alat.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const pageParams = (req) => ({
  page: Number(req.query.page) || 1,
  limit: Math.min(Number(req.query.limit) || 20, 100),
});

const boolQuery = (value) => (value === undefined ? undefined : value === 'true');

// --- Equipment Types ---

const listTypes = async (req, res, next) => {
  try {
    const result = await service.listTypes({
      ...pageParams(req),
      search: req.query.search,
      isActive: boolQuery(req.query.isActive),
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailType = async (req, res, next) => {
  try {
    return success(res, await service.getTypeById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const createType = async (req, res, next) => {
  try {
    const type = await service.createType(req.body);
    return created(res, type, 'Jenis alat berhasil dibuat');
  } catch (err) { next(err); }
};

const updateType = async (req, res, next) => {
  try {
    const type = await service.updateType(Number(req.params.id), req.body);
    return success(res, type, 'Jenis alat berhasil diperbarui');
  } catch (err) { next(err); }
};

const removeType = async (req, res, next) => {
  try {
    const result = await service.removeType(Number(req.params.id));
    return success(res, result, 'Jenis alat berhasil dihapus');
  } catch (err) { next(err); }
};

// --- Equipment Items ---

const listItems = async (req, res, next) => {
  try {
    const result = await service.listItems({
      ...pageParams(req),
      typeId: req.query.typeId ? Number(req.query.typeId) : undefined,
      status: req.query.status,
      search: req.query.search,
      isActive: boolQuery(req.query.isActive),
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailItem = async (req, res, next) => {
  try {
    return success(res, await service.getItemById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const createItem = async (req, res, next) => {
  try {
    const item = await service.createItem(req.body, req.user);
    return created(res, item, 'Unit alat berhasil didaftarkan');
  } catch (err) { next(err); }
};

const updateItem = async (req, res, next) => {
  try {
    const item = await service.updateItem(Number(req.params.id), req.body, req.user);
    return success(res, item, 'Unit alat berhasil diperbarui');
  } catch (err) { next(err); }
};

const changeItemStatus = async (req, res, next) => {
  try {
    const item = await service.changeItemStatus(Number(req.params.id), req.body, req.user.id);
    return success(res, item, 'Status alat berhasil diubah');
  } catch (err) { next(err); }
};

const listItemStatusLogs = async (req, res, next) => {
  try {
    const result = await service.listItemStatusLogs(Number(req.params.id), pageParams(req));
    return paginated(res, result);
  } catch (err) { next(err); }
};

const removeItem = async (req, res, next) => {
  try {
    const item = await service.removeItem(Number(req.params.id));
    return success(res, item, 'Unit alat berhasil dinonaktifkan');
  } catch (err) { next(err); }
};

// --- Workhour Logs ---

const createWorkhourLog = async (req, res, next) => {
  try {
    const log = await service.createWorkhourLog(req.body, req.user.id);
    return created(res, log, 'Workhour alat berhasil dicatat');
  } catch (err) { next(err); }
};

const listWorkhourLogsByItem = async (req, res, next) => {
  try {
    const { summary, ...result } = await service.listWorkhourLogsByItem(Number(req.params.itemId), {
      ...pageParams(req),
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sourceType: req.query.sourceType,
    });
    return res.status(200).json({
      success: true,
      data: result.data,
      summary,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (err) { next(err); }
};

module.exports = {
  listTypes, detailType, createType, updateType, removeType,
  listItems, detailItem, createItem, updateItem, changeItemStatus, listItemStatusLogs, removeItem,
  createWorkhourLog, listWorkhourLogsByItem,
};
