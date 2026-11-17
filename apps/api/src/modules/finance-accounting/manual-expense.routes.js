const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./manual-expense.controller.js');
const { MAX_ATTACHMENTS } = require('./manual-expense.service.js');

// ============================================================
// Pengeluaran manual Finance — langsung menjurnal (plan Finance 5a, F9).
// Lampiran WAJIB 1–10 file di field `attachments`.
// ============================================================

const router = Router();
router.use(authenticate);

const METHODS = ['transfer', 'cash', 'giro', 'other'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('search').optional().isString().isLength({ max: 100 }),
  query('voided').optional().isIn(['true', 'false']).withMessage('voided harus true atau false'),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
];

const createRules = [
  body('expenseDate').isISO8601().withMessage('expenseDate wajib tanggal ISO (YYYY-MM-DD)'),
  body('amount').isFloat({ gt: 0, max: 9999999999999 }).withMessage('amount harus angka lebih dari 0').toFloat(),
  body('payeeName').optional({ values: 'falsy' }).isString().isLength({ max: 150 }).withMessage('payeeName maksimal 150 karakter'),
  body('paymentMethod').optional({ values: 'falsy' }).isIn(METHODS).withMessage(`paymentMethod harus salah satu dari: ${METHODS.join(', ')}`),
  body('description').isString().trim().notEmpty().withMessage('Keterangan wajib diisi').isLength({ max: 5000 }),
  body('reason').isString().trim().notEmpty().withMessage('Alasan (kenapa lewat pengeluaran manual) wajib diisi').isLength({ max: 5000 }),
  ...['expenseCode', 'recordedBy', 'voidedBy', 'voidedAt', 'voidReason']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/', authorize('manual-expense:read'), validate(listRules), controller.list);
router.get('/:id', authorize('manual-expense:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('manual-expense:create'), uploadMany('attachments', 'evidence', { min: 1, max: MAX_ATTACHMENTS }),
  validate(createRules), controller.create);
router.put('/:id/void', authorize('manual-expense:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi').isLength({ max: 5000 })]), controller.voidExpense);

module.exports = router;
