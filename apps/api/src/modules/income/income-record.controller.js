const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./income-record.service.js');

const contextQuery = (q) => ({
  subProjectId: numQuery(q.subProjectId),
  externalRentalProjectId: numQuery(q.externalRentalProjectId),
  externalSupplyProjectId: numQuery(q.externalSupplyProjectId),
});

const billable = async (req, res, next) => {
  try {
    return success(res, await service.billable({ ...contextQuery(req.query), periodStart: req.query.periodStart, periodEnd: req.query.periodEnd }));
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      ...contextQuery(req.query),
      search: req.query.search,
      contextType: req.query.contextType,
      constructionProjectId: numQuery(req.query.constructionProjectId),
      status: req.query.status,
      paymentStatus: req.query.paymentStatus,
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

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Tagihan dibuat dan dikirim ke Finance');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body, req.user.id), 'Tagihan diubah');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Tagihan dibatalkan');
  } catch (err) { next(err); }
};

const verify = async (req, res, next) => {
  try {
    return success(res, await service.verify(req.params.id, req.body, req.user.id), 'Tagihan diverifikasi dan dijurnal');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user.id), 'Tagihan ditolak');
  } catch (err) { next(err); }
};

const voidRecord = async (req, res, next) => {
  try {
    return success(res, await service.voidRecord(req.params.id, req.body, req.user.id), 'Tagihan dibatalkan (jurnal dibalik)');
  } catch (err) { next(err); }
};

module.exports = { billable, list, detail, create, update, cancel, verify, reject, voidRecord };
