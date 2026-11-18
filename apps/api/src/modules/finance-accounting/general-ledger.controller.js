const { success } = require('../../utils/response.js');
const service = require('./general-ledger.service.js');

const accountLedger = async (req, res, next) => {
  try {
    return success(res, await service.accountLedger(req.params.accountId, { startDate: req.query.startDate, endDate: req.query.endDate }));
  } catch (err) { next(err); }
};

const trialBalance = async (req, res, next) => {
  try {
    return success(res, await service.trialBalance({ date: req.query.date }));
  } catch (err) { next(err); }
};

module.exports = { accountLedger, trialBalance };
