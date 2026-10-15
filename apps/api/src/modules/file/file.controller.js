const { success } = require('../../utils/response.js');
const service = require('./file.service.js');

const downloadUrl = async (req, res, next) => {
  try {
    return success(res, await service.getDownloadUrl(req.params.id, req.user));
  } catch (err) { next(err); }
};

module.exports = { downloadUrl };
