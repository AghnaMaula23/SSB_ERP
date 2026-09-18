const service = require('./damage.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const boolQuery = (value) => (value === undefined ? undefined : value === 'true');

const filters = (req) => ({
  page: Number(req.query.page) || 1,
  limit: Math.min(Number(req.query.limit) || 20, 100),
  status: req.query.status,
  stopsOperation: boolQuery(req.query.stopsOperation),
  sparePartSource: req.query.sparePartSource,
  mechanicTeam: req.query.mechanicTeam,
  search: req.query.search,
  startDate: req.query.startDate,
  endDate: req.query.endDate,
});

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...filters(req),
      equipmentItemId: req.query.equipmentItemId ? Number(req.query.equipmentItemId) : undefined,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const listByItem = async (req, res, next) => {
  try {
    return paginated(res, await service.listByItem(Number(req.params.itemId), filters(req)));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const create_ = async (req, res, next) => {
  try {
    const log = await service.create(req.body, req.user.id);
    return created(res, log, 'Laporan kerusakan berhasil dicatat');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const log = await service.update(Number(req.params.id), req.body, req.user.id);
    return success(res, log, 'Laporan kerusakan berhasil diperbarui');
  } catch (err) { next(err); }
};

const resolve = async (req, res, next) => {
  try {
    const log = await service.resolve(Number(req.params.id), req.body, req.user.id);
    return success(res, log, 'Kerusakan berhasil diselesaikan');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const log = await service.cancel(Number(req.params.id), req.body, req.user.id);
    return success(res, log, 'Laporan kerusakan berhasil dibatalkan');
  } catch (err) { next(err); }
};

module.exports = { list, listByItem, detail, create: create_, update, resolve, cancel };
