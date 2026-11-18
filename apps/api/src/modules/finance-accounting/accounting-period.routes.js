const { Router } = require('express');
const { body, param } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./accounting-period.controller.js');

// Tutup buku bulanan — docs/claude_knowledge/plan-divisi-finance.md F3b.
const router = Router();
router.use(authenticate);

const periodParam = param('period').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('Periode harus berformat YYYY-MM');

router.get('/', authorize('journal:read'), controller.list);
router.put('/:period/close', authorize('accounting-period:close'), validate([
  periodParam,
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 2000 }).withMessage('notes maksimal 2000 karakter'),
]), controller.close);
router.put('/:period/reopen', authorize('accounting-period:close'), validate([
  periodParam,
  body('reason').isString().trim().notEmpty().withMessage('Alasan membuka kembali wajib diisi').isLength({ max: 2000 }),
]), controller.reopen);

module.exports = router;
