const { success, created, paginated } = require('../../utils/response.js');
const { pageParams } = require('../../utils/query.js');
const service = require('./worker.service.js');

const list = async (req, res, next) => {
  try {
    return paginated(res, await service.list({ ...pageParams(req), search: req.query.search }));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Pekerja didaftarkan');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body), 'Data pekerja diperbarui');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    return success(res, await service.remove(req.params.id), 'Pekerja dihapus');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, remove };
