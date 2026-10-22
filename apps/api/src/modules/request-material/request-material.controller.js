const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./request-material.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      status: req.query.status,
      requestType: req.query.requestType,
      subProjectId: numQuery(req.query.subProjectId),
      externalSupplyProjectId: numQuery(req.query.externalSupplyProjectId),
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.user.id);
    return created(res, data, 'Request material berhasil dibuat');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const data = await service.cancel(req.params.id, req.user.id);
    return success(res, data, 'Request material dibatalkan');
  } catch (err) { next(err); }
};

const adminValidate = async (req, res, next) => {
  try {
    const data = await service.adminValidate(req.params.id, req.body, req.user.id);
    return success(res, data, 'Kuantitas validasi Admin disimpan');
  } catch (err) { next(err); }
};

const replaceCosts = async (req, res, next) => {
  try {
    const data = await service.replaceCosts(req.params.id, req.body, req.user.id);
    return success(res, data, 'Rincian biaya disimpan');
  } catch (err) { next(err); }
};

const submitToFinance = async (req, res, next) => {
  try {
    const data = await service.submitToFinance(req.params.id, req.body, req.user.id);
    return success(res, data, 'Request material diteruskan ke Finance');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    const data = await service.approve(req.params.id, req.body, req.user.id);
    return success(res, data, 'Request material disetujui');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const data = await service.reject(req.params.id, req.body, req.user);
    return success(res, data, 'Request material ditolak');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, adminValidate, replaceCosts, submitToFinance, approve, reject };
