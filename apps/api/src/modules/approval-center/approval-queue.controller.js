const { success, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams } = require('../../utils/query.js');
const service = require('./approval-queue.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      userId: req.user.id,
      permissions: req.user.permissions,
      ...pageParams(req),
      stage: req.query.stage,
      sourceType: req.query.sourceType,
      search: req.query.search?.trim() || undefined,
      sort: req.query.sort,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const summary = async (req, res, next) => {
  try {
    return success(res, await service.summary({ userId: req.user.id, permissions: req.user.permissions }));
  } catch (err) { next(err); }
};

module.exports = { list, summary };
