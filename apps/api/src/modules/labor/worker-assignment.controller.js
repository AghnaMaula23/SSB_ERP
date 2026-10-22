const { success, created } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { numQuery, boolQuery } = require('../../utils/query.js');
const service = require('./worker-assignment.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      subProjectId: numQuery(req.query.subProjectId),
      projectWorkerId: numQuery(req.query.projectWorkerId),
      workerType: req.query.workerType,
      active: boolQuery(req.query.active),
      activeOn: req.query.activeOn,
      search: req.query.search,
    });
    return success(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Pekerja ditugaskan ke tahapan');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body), 'Penugasan diperbarui');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    return success(res, await service.remove(req.params.id), 'Penugasan dihapus');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update, remove };
