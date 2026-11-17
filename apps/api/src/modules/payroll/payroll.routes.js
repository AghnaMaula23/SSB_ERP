const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./payroll.controller.js');

// ============================================================
// Payroll bulanan karyawan tetap — Finance (plan Finance 5d, F27–F28).
// Bukti transfer opsional 0–10 file di field `proofs` saat pay.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['draft', 'finalized', 'paid', 'cancelled', 'voided'];
const MAX_PROOFS = 10;
const MAX_COMPONENTS = 20;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const reasonRule = body('reason').isString().trim().notEmpty().withMessage('Alasan wajib diisi')
  .isLength({ max: 5000 }).withMessage('Alasan maksimal 5000 karakter');
const optionalText = (field, max) => body(field).optional({ values: 'falsy' }).isString().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('year tidak valid'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
];

const createRules = [
  body('year').isInt({ min: 2000, max: 2100 }).withMessage('year wajib angka tahun').toInt(),
  body('month').isInt({ min: 1, max: 12 }).withMessage('month wajib 1–12').toInt(),
  body('replacesPayrollId').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('replacesPayrollId tidak valid').toInt(),
  optionalText('notes', 5000),
  ...['payrollCode', 'status', 'items', 'createdBy']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

const componentRules = [
  idParam,
  param('itemId').isInt({ min: 1 }).withMessage('itemId tidak valid').toInt(),
  body('components').isArray({ max: MAX_COMPONENTS }).withMessage(`components harus array (maksimal ${MAX_COMPONENTS})`),
  body('components.*.componentType').isIn(['earning', 'deduction']).withMessage('componentType harus earning atau deduction'),
  body('components.*.componentName').isString().trim().notEmpty().withMessage('componentName wajib diisi')
    .isLength({ max: 100 }).withMessage('componentName maksimal 100 karakter'),
  body('components.*.amount').isFloat({ gt: 0, max: 9999999999999 }).withMessage('amount harus angka lebih dari 0').toFloat(),
  body('components.*.notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  body('components.*.isSystem').not().exists().withMessage('Gaji Pokok dibuat sistem — isSystem tidak bisa dikirim'),
];

const payRules = [
  idParam,
  body('paymentDate').isISO8601().withMessage('paymentDate wajib tanggal ISO (YYYY-MM-DD)'),
  optionalText('paymentReference', 100),
  optionalText('notes', 5000),
  ...['status', 'paidBy', 'paidAt']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/', authorize('payroll:read'), validate(listRules), controller.list);
router.get('/:id', authorize('payroll:read'), validate([idParam]), controller.detail);
router.post('/', authorize('payroll:create'), validate(createRules), controller.create);
router.put('/:id/regenerate', authorize('payroll:create'), validate([idParam]), controller.regenerate);
router.put('/:id/items/:itemId/components', authorize('payroll:create'), validate(componentRules), controller.replaceComponents);
router.put('/:id/finalize', authorize('payroll:create'), validate([idParam]), controller.finalize);
router.put('/:id/cancel', authorize('payroll:create'), validate([idParam, reasonRule]), controller.cancel);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.put('/:id/pay', authorize('payroll:pay'), uploadMany('proofs', 'evidence', { min: 0, max: MAX_PROOFS }),
  validate(payRules), controller.pay);
router.put('/:id/void', authorize('payroll:pay'), validate([idParam, reasonRule]), controller.voidPayroll);

module.exports = router;
