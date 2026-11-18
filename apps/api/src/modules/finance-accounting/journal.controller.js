const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./journal.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      search: req.query.search,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      accountId: numQuery(req.query.accountId),
      sourceType: req.query.sourceType,
      constructionProjectId: numQuery(req.query.constructionProjectId),
      subProjectId: numQuery(req.query.subProjectId),
      externalRentalProjectId: numQuery(req.query.externalRentalProjectId),
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

const addAdjustment = async (req, res, next) => {
  try {
    return created(res, await service.addAdjustment(req.params.id, req.body, req.user.id), 'Penyesuaian jurnal dicatat');
  } catch (err) { next(err); }
};

module.exports = { list, detail, addAdjustment };
