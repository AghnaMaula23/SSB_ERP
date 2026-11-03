const { success } = require('../../utils/response.js');
const { boolQuery } = require('../../utils/query.js');
const service = require('./field-expense-category.service.js');

const list = async (req, res, next) => {
  try {
    return success(res, await service.list({ activeOnly: boolQuery(req.query.activeOnly) ?? true }));
  } catch (err) { next(err); }
};

module.exports = { list };
