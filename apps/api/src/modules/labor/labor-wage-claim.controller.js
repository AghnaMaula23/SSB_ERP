const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery, boolQuery } = require('../../utils/query.js');
const service = require('./labor-wage-claim.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      subProjectId: numQuery(req.query.subProjectId),
      status: req.query.status,
      paid: boolQuery(req.query.paid),
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
    return created(res, await service.create(req.body, req.user.id), 'Klaim upah diajukan');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Klaim upah dibatalkan');
  } catch (err) { next(err); }
};

const validate = async (req, res, next) => {
  try {
    return success(res, await service.validate(req.params.id, req.body, req.user.id), 'Klaim upah diteruskan ke Finance');
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    return success(res, await service.approve(req.params.id, req.body, req.user.id), 'Klaim upah disetujui');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user), 'Klaim upah ditolak');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, validate, approve, reject };
