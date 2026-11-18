const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { pageParams, boolQuery } = require('../../utils/query.js');
const service = require('./manual-expense.service.js');

const list = async (req, res, next) => {
  try {
    return paginated(res, await service.list({
      ...pageParams(req),
      search: req.query.search,
      voided: boolQuery(req.query.voided),
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    }));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

// `req.uploads` diisi middleware upload (lampiran yang sudah diperiksa jenis & ukurannya)
const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.uploads, req.user.id), 'Pengeluaran manual dicatat dan dijurnal');
  } catch (err) { next(err); }
};

const voidExpense = async (req, res, next) => {
  try {
    return success(res, await service.voidExpense(req.params.id, req.body, req.user.id), 'Pengeluaran manual dibatalkan (jurnal dibalik)');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, voidExpense };
