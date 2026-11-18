const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { pageParams, numQuery, boolQuery } = require('../../utils/query.js');
const service = require('./income-payment.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      incomeRecordId: numQuery(req.query.incomeRecordId),
      voided: boolQuery(req.query.voided),
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

// `req.uploads` diisi middleware upload (bukti yang sudah diperiksa jenis & ukurannya)
const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.uploads, req.user.id), 'Pembayaran klien dicatat dan dijurnal');
  } catch (err) { next(err); }
};

const voidPayment = async (req, res, next) => {
  try {
    return success(res, await service.voidPayment(req.params.id, req.body, req.user.id), 'Pembayaran dibatalkan (jurnal dibalik)');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, voidPayment };
