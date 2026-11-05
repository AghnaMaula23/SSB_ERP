const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery, boolQuery } = require('../../utils/query.js');
const service = require('./field-expense-report.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      subProjectId: numQuery(req.query.subProjectId),
      fieldOperationalRequestId: numQuery(req.query.fieldOperationalRequestId),
      urgent: boolQuery(req.query.urgent),
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

// `req.uploads` diisi middleware upload (nota yang sudah diperiksa jenis & ukurannya)
const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.uploads, req.user.id), 'Laporan realisasi dikirim');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Laporan realisasi dibatalkan');
  } catch (err) { next(err); }
};

const validate = async (req, res, next) => {
  try {
    return success(res, await service.validate(req.params.id, req.body, req.user.id), 'Laporan realisasi divalidasi');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user.id), 'Laporan realisasi ditolak');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, validate, reject };
