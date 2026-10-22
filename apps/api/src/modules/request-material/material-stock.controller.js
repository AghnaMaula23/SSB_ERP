const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./material-stock.service.js');

const stock = async (req, res, next) => {
  try {
    return success(res, await service.getStock(numQuery(req.query.subProjectId)));
  } catch (err) { next(err); }
};

const listMovements = async (req, res, next) => {
  try {
    const result = await service.listMovements({
      ...pageParams(req),
      subProjectId: numQuery(req.query.subProjectId),
      materialTypeId: numQuery(req.query.materialTypeId),
      movementType: req.query.movementType,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const createMovement = async (req, res, next) => {
  try {
    const data = await service.createMovement(req.body, req.user.id);
    return created(res, data, 'Mutasi stok dicatat');
  } catch (err) { next(err); }
};

const cancelMovement = async (req, res, next) => {
  try {
    const data = await service.cancelMovement(req.params.id, req.body, req.user.id);
    return success(res, data, 'Mutasi stok dibatalkan');
  } catch (err) { next(err); }
};

module.exports = { stock, listMovements, createMovement, cancelMovement };
