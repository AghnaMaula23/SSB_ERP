const { success, created } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { numQuery } = require('../../utils/query.js');
const service = require('./employee-compensation.service.js');

const list = async (req, res, next) => {
  try {
    return success(res, await service.listByEmployee(numQuery(req.query.employeeId)));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Gaji pokok tercatat');
  } catch (err) { next(err); }
};

module.exports = { list, create };
