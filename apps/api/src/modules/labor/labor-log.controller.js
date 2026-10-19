const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./labor-log.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      subProjectId: numQuery(req.query.subProjectId),
      projectWorkerId: numQuery(req.query.projectWorkerId),
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
    return created(res, await service.create(req.body, req.user.id), 'Log tenaga kerja dicatat');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body, req.user.id), 'Log tenaga kerja diperbarui');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    return success(res, await service.remove(req.params.id), 'Log tenaga kerja dihapus');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, remove };
