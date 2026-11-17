const { success } = require('../../utils/response.js');
const { boolQuery } = require('../../utils/query.js');
const service = require('./chart-of-account.service.js');

const list = async (req, res, next) => {
  try {
    return success(res, await service.list({ accountType: req.query.accountType, isActive: boolQuery(req.query.isActive) }));
  } catch (err) { next(err); }
};

module.exports = { list };
