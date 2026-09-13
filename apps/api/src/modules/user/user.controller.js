const service = require('./user.service.js');
const { success, created, paginated } = require('../../utils/response.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      page: Number(req.query.page) || 1,
      limit: Math.min(Number(req.query.limit) || 20, 100),
      search: req.query.search,
      roleCode: req.query.roleCode,
      isActive: req.query.isActive === undefined ? undefined : req.query.isActive === 'true',
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    const user = await service.getById(Number(req.params.id));
    return success(res, user);
  } catch (err) { next(err); }
};

const setRoles = async (req, res, next) => {
  try {
    const user = await service.setRoles(Number(req.params.id), req.body.roleIds);
    return success(res, user, 'Role user berhasil diperbarui');
  } catch (err) { next(err); }
};

const addRole = async (req, res, next) => {
  try {
    const user = await service.addRole(Number(req.params.id), Number(req.body.roleId));
    return created(res, user, 'Role berhasil ditugaskan ke user');
  } catch (err) { next(err); }
};

const removeRole = async (req, res, next) => {
  try {
    const user = await service.removeRole(Number(req.params.id), Number(req.params.roleId));
    return success(res, user, 'Role berhasil dilepas dari user');
  } catch (err) { next(err); }
};

module.exports = { list, detail, setRoles, addRole, removeRole };
