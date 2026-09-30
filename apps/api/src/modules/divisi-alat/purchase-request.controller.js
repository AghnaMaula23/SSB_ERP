const service = require('./purchase-request.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, orderCategory, status, search } = req.query;
    const result = await service.list({
      page: Number(page),
      limit: Number(limit),
      orderCategory,
      status,
      search,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const store = async (req, res, next) => {
  try {
    const result = await service.create(req.body, req.user.id);
    return created(res, result, 'Purchase request berhasil diajukan');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const result = await service.update(Number(req.params.id), req.body, req.user.id);
    return success(res, result, 'Purchase request berhasil diperbarui');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const result = await service.cancel(Number(req.params.id), req.user.id);
    return success(res, result, 'Purchase request dibatalkan');
  } catch (err) { next(err); }
};

const validateByAdmin = async (req, res, next) => {
  try {
    const result = await service.validateByAdmin(Number(req.params.id), req.user.id);
    return success(res, result, 'Purchase request divalidasi dan diteruskan ke Finance');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const result = await service.reject(Number(req.params.id), req.user.id, req.user.roles);
    return success(res, result, 'Purchase request ditolak');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    const result = await service.approve(Number(req.params.id), req.body, req.user.id);
    return success(res, result, 'Purchase request disetujui');
  } catch (err) { next(err); }
};

module.exports = { list, detail, store, update, cancel, validateByAdmin, reject, approve };
