const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { pageParams, boolQuery } = require('../../utils/query.js');
const service = require('./employee.service.js');

const list = async (req, res, next) => {
  try {
    return paginated(res, await service.list({
      ...pageParams(req),
      search: req.query.search,
      active: boolQuery(req.query.active),
      department: req.query.department,
    }));
  } catch (err) { next(err); }
};

// Gaji hanya untuk pemegang compensation:read (F29) — ditentukan permission, bukan role
const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id, { canSeeSalary: req.user.permissions.includes('compensation:read') }));
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.user.id), 'Karyawan berhasil ditambahkan');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    return success(res, await service.update(req.params.id, req.body), 'Data karyawan diperbarui');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, update };
