const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./income-payment.controller.js');

// ============================================================
// Pembayaran klien — dicatat Finance, langsung sah + jurnal (plan Finance 5b, F15).
// Bukti opsional 0–10 file di field `proofs` (mutasi bank sering tanpa dokumen).
// ============================================================

const router = Router();
router.use(authenticate);

const METHODS = ['transfer', 'cash', 'giro', 'other'];
const MAX_PROOFS = 10;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('incomeRecordId').optional().isInt({ min: 1 }).withMessage('incomeRecordId tidak valid'),
  query('voided').optional().isIn(['true', 'false']).withMessage('voided harus true atau false'),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
];

const optionalText = (field, max) => body(field).optional({ values: 'falsy' }).isString().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);

const createRules = [
  body('incomeRecordId').isInt({ min: 1 }).withMessage('incomeRecordId wajib diisi').toInt(),
  body('paymentDate').isISO8601().withMessage('paymentDate wajib tanggal ISO (YYYY-MM-DD)'),
  body('amount').isFloat({ gt: 0, max: 9999999999999 }).withMessage('amount harus angka lebih dari 0').toFloat(),
  optionalText('payerName', 150),
  body('paymentMethod').optional({ values: 'falsy' }).isIn(METHODS).withMessage(`paymentMethod harus salah satu dari: ${METHODS.join(', ')}`),
  optionalText('referenceNumber', 100),
  optionalText('notes', 5000),
  ...['paymentCode', 'recordedBy', 'voidedBy', 'voidedAt', 'voidReason']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/', authorize('income:read'), validate(listRules), controller.list);
router.get('/:id', authorize('income:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('income-payment:create'), uploadMany('proofs', 'evidence', { min: 0, max: MAX_PROOFS }),
  validate(createRules), controller.create);
router.put('/:id/void', authorize('income-payment:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]), controller.voidPayment);

module.exports = router;
