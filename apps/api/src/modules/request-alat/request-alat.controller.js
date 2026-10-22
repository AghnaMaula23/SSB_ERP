const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./request-alat.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      status: req.query.status,
      requestType: req.query.requestType,
      subProjectId: numQuery(req.query.subProjectId),
      externalRentalProjectId: numQuery(req.query.externalRentalProjectId),
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
    const data = await service.create(req.body, req.user);
    return created(res, data, 'Request alat berhasil dibuat');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const data = await service.cancel(req.params.id, req.user.id);
    return success(res, data, 'Request alat dibatalkan');
  } catch (err) { next(err); }
};

const adminReview = async (req, res, next) => {
  try {
    const data = await service.adminReview(req.params.id, req.body, req.user.id);
    const message = req.body.action === 'forward' ? 'Request diteruskan ke Divisi Alat' : 'Request ditolak';
    return success(res, data, message);
  } catch (err) { next(err); }
};

const equipmentReview = async (req, res, next) => {
  try {
    const data = await service.equipmentReview(req.params.id, req.body, req.user.id);
    const message = data.status === 'approved' ? 'Request disetujui, pool item dibuat' : 'Request ditolak';
    return success(res, data, message);
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, adminReview, equipmentReview };
