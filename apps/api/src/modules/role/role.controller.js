const service = require('./role.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 20, 100),
      search: req.query.search,
      isActive: req.query.isActive === undefined ? undefined : req.query.isActive === 'true',
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    const role = await service.getById(Number(req.params.id));
    return success(res, role);
  } catch (err) { next(err); }
};

const create_ = async (req, res, next) => {
  try {
    const role = await service.create(req.body);
    return created(res, role, 'Role berhasil dibuat');
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const role = await service.update(Number(req.params.id), req.body);
    return success(res, role, 'Role berhasil diperbarui');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const result = await service.remove(Number(req.params.id));
    return success(res, result, 'Role berhasil dihapus');
  } catch (err) { next(err); }
};

const setPermissions = async (req, res, next) => {
  try {
    const role = await service.setPermissions(Number(req.params.id), req.body.permissionIds);
    return success(res, role, 'Permission role berhasil diperbarui');
  } catch (err) { next(err); }
};

const addPermission = async (req, res, next) => {
  try {
    const role = await service.addPermission(Number(req.params.id), Number(req.body.permissionId));
    return created(res, role, 'Permission berhasil ditambahkan ke role');
  } catch (err) { next(err); }
};

const removePermission = async (req, res, next) => {
  try {
    const role = await service.removePermission(Number(req.params.id), Number(req.params.permissionId));
    return success(res, role, 'Permission berhasil dilepas dari role');
  } catch (err) { next(err); }
};

module.exports = {
  list, detail, create: create_, update, remove,
  setPermissions, addPermission, removePermission,
};
