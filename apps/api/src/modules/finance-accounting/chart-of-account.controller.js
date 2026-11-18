const { success, created } = require('../../utils/response.js');
const { boolQuery } = require('../../utils/query.js');
const service = require('./chart-of-account.service.js');

const list = async (req, res, next) => {
  try {
    return success(res, await service.list({ accountType: req.query.accountType, isActive: boolQuery(req.query.isActive) }));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body), 'Akun ditambahkan');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body), 'Akun diperbarui');
  } catch (err) { next(err); }
};

module.exports = { list, create, update };
