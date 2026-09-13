const service = require('./permission.service.js');
const { success, created } = require('../../utils/response.js');

const list = async (req, res, next) => {
  try {
    const data = await service.list({
      module: req.query.module,
      grouped: req.query.grouped === 'true',
    });
    return success(res, data);
  } catch (err) { next(err); }
};

const create_ = async (req, res, next) => {
  try {
    const permission = await service.create(req.body);
    return created(res, permission, 'Permission berhasil dibuat');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const result = await service.remove(Number(req.params.id));
    return success(res, result, 'Permission berhasil dihapus');
  } catch (err) { next(err); }
};

module.exports = { list, create: create_, remove };
