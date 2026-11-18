const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { pageParams } = require('../../utils/query.js');
const service = require('./equipment-income-claim.service.js');

const eligible = async (req, res, next) => {
  try {
    return success(res, await service.eligible({ periodStart: req.query.periodStart, periodEnd: req.query.periodEnd }));
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    return paginated(res, await service.list({ ...pageParams(req), status: req.query.status, startDate: req.query.startDate, endDate: req.query.endDate }));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Klaim pendapatan alat diajukan ke Finance');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Klaim dibatalkan');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    return success(res, await service.approve(req.params.id, req.body, req.user.id), 'Klaim disetujui — Kas Alat bertambah dan dijurnal');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user.id), 'Klaim ditolak');
  } catch (err) { next(err); }
};

module.exports = { eligible, list, detail, create, cancel, approve, reject };
