const { Router } = require('express');
const { query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./chart-of-account.controller.js');

const router = Router();
router.use(authenticate);

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

router.get('/', authorize('coa:read'), validate([
  query('accountType').optional().isIn(ACCOUNT_TYPES).withMessage(`accountType harus salah satu dari: ${ACCOUNT_TYPES.join(', ')}`),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive harus true atau false'),
]), controller.list);

module.exports = router;
