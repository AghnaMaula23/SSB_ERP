const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./field-expense-report.controller.js');

// ============================================================
// Laporan realisasi kas lapangan + nota — docs/plan-divisi-lapangan.md L1, L4, 4b.
// Form + nota (1–10 file di field `receipts`) dalam SATU multipart; `items`
// dikirim sebagai string JSON karena multipart tidak punya array objek.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'validated', 'rejected', 'cancelled'];
const MAX_ITEMS = 100;
const MAX_RECEIPTS = 10;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const optionalText = (field, max) => body(field).optional({ values: 'falsy' }).isString().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('fieldOperationalRequestId').optional().isInt({ min: 1 }).withMessage('fieldOperationalRequestId tidak valid'),
  query('urgent').optional().isIn(['true', 'false']).withMessage('urgent harus true atau false'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
];

/** String JSON dari multipart -> array; bentuk lain dibiarkan supaya isArray yang menolak. */
const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const managedFields = [
  'reportCode', 'status', 'submittedBy', 'totalAmount', 'isUrgent',
  'validatedBy', 'validatedAt', 'financeNotes', 'cancelledBy', 'cancelledAt', 'cancelReason',
  'items.*.totalPrice',
].map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('reportDate').isISO8601().withMessage('reportDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('fieldOperationalRequestId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('fieldOperationalRequestId tidak valid').toInt(),
  optionalText('urgentReason', 2000),
  optionalText('notes', 5000),
  body('items').customSanitizer(parseJson)
    .isArray({ min: 1, max: MAX_ITEMS }).withMessage(`items wajib berupa JSON array berisi 1–${MAX_ITEMS} baris`),
  body('items.*.categoryId').isInt({ min: 1 }).withMessage('categoryId wajib diisi').toInt(),
  body('items.*.expenseDate').isISO8601().withMessage('expenseDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('items.*.itemName').isString().trim().notEmpty().withMessage('itemName wajib diisi')
    .isLength({ max: 150 }).withMessage('itemName maksimal 150 karakter'),
  body('items.*.quantity').isFloat({ gt: 0, max: 9999999999 }).withMessage('quantity harus angka lebih dari 0').toFloat(),
  body('items.*.unit').isString().trim().notEmpty().withMessage('unit wajib diisi')
    .isLength({ max: 30 }).withMessage('unit maksimal 30 karakter'),
  body('items.*.unitPrice').isFloat({ min: 0, max: 9999999999999 }).withMessage('unitPrice tidak boleh negatif').toFloat(),
  body('items.*.vendorName').optional({ values: 'null' }).isString().isLength({ max: 150 }).withMessage('vendorName maksimal 150 karakter'),
  body('items.*.fieldOperationalRequestItemId').optional({ values: 'null' }).isInt({ min: 1 })
    .withMessage('fieldOperationalRequestItemId tidak valid').toInt(),
  body('items.*.notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...managedFields,
];

const notesRule = body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter');

router.get('/', authorize('field-cash:read'), validate(listRules), controller.list);
router.get('/:id', authorize('field-cash:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('field-cash:create'), uploadMany('receipts', 'evidence', { min: 1, max: MAX_RECEIPTS }),
  validate(createRules), controller.create);
router.put('/:id/cancel', authorize('field-cash:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);
router.put('/:id/validate', authorize('field-cash:approve'), validate([idParam, notesRule]), controller.validate);
router.put('/:id/reject', authorize('field-cash:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]),
  controller.reject);

module.exports = router;
