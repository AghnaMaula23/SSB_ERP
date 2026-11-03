const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./field-operational-request.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      subProjectId: numQuery(req.query.subProjectId),
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search?.trim() || undefined,
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
    return created(res, await service.create(req.body, req.user.id), 'Pengajuan dana operasional dibuat');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Pengajuan dana dibatalkan');
  } catch (err) { next(err); }
};

const validate = async (req, res, next) => {
  try {
    return success(res, await service.validate(req.params.id, req.body, req.user.id), 'Pengajuan dana diteruskan ke Finance');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    return success(res, await service.approve(req.params.id, req.body, req.user.id), 'Pengajuan dana disetujui');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user), 'Pengajuan dana ditolak');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, validate, approve, reject };
