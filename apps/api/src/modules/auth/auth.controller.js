const service = require('./auth.service.js');
const { success, created } = require('../../utils/response.js');

const register = async (req, res, next) => {
  try {
    const user = await service.register(req.body);
    return created(res, user, 'Registrasi berhasil');
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const result = await service.login(req.body);
    return success(res, result, 'Login berhasil');
  } catch (err) { next(err); }
};

const me = async (req, res, next) => {
  try {
    return success(res, req.user);
  } catch (err) { next(err); }
};

module.exports = { register, login, me };
