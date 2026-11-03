const { Router } = require('express');
const { query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./field-expense-category.controller.js');

// Baca saja — kategori dikelola lewat seeder (docs/plan-divisi-lapangan.md L3)
const router = Router();
router.use(authenticate);

router.get('/', authorize('field-cash:read'),
  validate([query('activeOnly').optional().isIn(['true', 'false']).withMessage('activeOnly harus true atau false')]),
  controller.list);

module.exports = router;
