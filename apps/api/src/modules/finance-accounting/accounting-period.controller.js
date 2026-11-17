const { success } = require('../../utils/response.js');
const service = require('./accounting-period.service.js');

const list = async (req, res, next) => {
  try {
    return success(res, await service.list());
  } catch (err) { next(err); }
};

const close = async (req, res, next) => {
  try {
    return success(res, await service.close(req.params.period, req.body, req.user.id), 'Buku bulan ini ditutup');
  } catch (err) { next(err); }
};

const reopen = async (req, res, next) => {
  try {
    return success(res, await service.reopen(req.params.period, req.body, req.user.id), 'Buku bulan ini dibuka kembali');
  } catch (err) { next(err); }
};

module.exports = { list, close, reopen };
