const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./material-receipt.service.js');

const list = async (req, res, next) => {
  try {
    const { cancelled } = req.query;
    const result = await service.list({
      ...pageParams(req),
      materialRequestId: numQuery(req.query.materialRequestId),
      materialDeliveryId: numQuery(req.query.materialDeliveryId),
      subProjectId: numQuery(req.query.subProjectId),
      externalSupplyProjectId: numQuery(req.query.externalSupplyProjectId),
      cancelled: cancelled === undefined ? undefined : cancelled === 'true',
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

// `req.uploads` diisi middleware upload (bukti penerimaan yang sudah diperiksa)
const create = async (req, res, next) => {
  try {
    const data = await service.create(req.body, req.uploads, req.user.id);
    return created(res, data, 'Penerimaan material dicatat');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const data = await service.cancel(req.params.id, req.body, req.user.id);
    return success(res, data, 'Receipt dibatalkan');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel };
