const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./income-record.controller.js');

// ============================================================
// Income record — tagihan klien (docs/claude_knowledge/plan-divisi-finance.md 5b).
// Admin membuat (langsung antre Finance), Finance memverifikasi/menolak/membatalkan.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'verified', 'rejected', 'cancelled', 'voided'];
const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'];
const CONTEXT_TYPES = ['construction', 'rental', 'supply'];
const MAX_ITEMS = 500;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const intQuery = (field) => query(field).optional().isInt({ min: 1 }).withMessage(`${field} tidak valid`);
const isoQuery = (field) => query(field).optional().isISO8601().withMessage(`${field} harus tanggal ISO (YYYY-MM-DD)`);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const contextQueries = ['subProjectId', 'externalRentalProjectId', 'externalSupplyProjectId'].map(intQuery);

const billableRules = [
  ...contextQueries,
  query('periodStart').isISO8601().withMessage('periodStart wajib tanggal ISO (YYYY-MM-DD)'),
  query('periodEnd').isISO8601().withMessage('periodEnd wajib tanggal ISO (YYYY-MM-DD)'),
];

const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('search').optional().isString().isLength({ max: 100 }),
  query('contextType').optional().isIn(CONTEXT_TYPES).withMessage(`contextType harus salah satu dari: ${CONTEXT_TYPES.join(', ')}`),
  intQuery('constructionProjectId'),
  ...contextQueries,
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
  query('paymentStatus').optional().isIn(PAYMENT_STATUSES).withMessage(`paymentStatus harus salah satu dari: ${PAYMENT_STATUSES.join(', ')}`),
  isoQuery('startDate'), isoQuery('endDate'),
];

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const managedFields = [
  'incomeCode', 'status', 'createdBy', 'totalAmount', 'paidAmount', 'outstandingAmount', 'paymentStatus',
  'progressVolumeFrom', 'progressVolumeTo', 'targetVolumeSnapshot', 'contractValueSnapshot', 'progress',
  'verifiedBy', 'verifiedAt', 'financeNotes', 'cancelledBy', 'cancelledAt', 'cancelReason', 'voidedBy', 'voidedAt', 'voidReason',
  'items.*.subtotal', 'items.*.quantity',
].map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const contentRules = [
  body('periodStart').isISO8601().withMessage('periodStart wajib tanggal ISO (YYYY-MM-DD)'),
  body('periodEnd').isISO8601().withMessage('periodEnd wajib tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  body('items').optional({ values: 'null' }).isArray({ max: MAX_ITEMS }).withMessage(`items maksimal ${MAX_ITEMS} baris`),
  body('items.*.equipmentWorkhourLogId').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('equipmentWorkhourLogId tidak valid').toInt(),
  body('items.*.materialReceiptId').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('materialReceiptId tidak valid').toInt(),
  body('items.*.unitRate').isFloat({ gt: 0, max: 9999999999999 }).withMessage('unitRate harus angka lebih dari 0').toFloat(),
  body('items.*.rateNotes').optional({ values: 'null' }).isString().isLength({ max: 2000 }).withMessage('rateNotes maksimal 2000 karakter'),
  ...managedFields,
];

const createRules = [
  ...['subProjectId', 'externalRentalProjectId', 'externalSupplyProjectId']
    .map((f) => body(f).optional({ values: 'null' }).isInt({ min: 1 }).withMessage(`${f} tidak valid`).toInt()),
  ...contentRules,
];

const updateRules = [
  idParam,
  ...['subProjectId', 'externalRentalProjectId', 'externalSupplyProjectId']
    .map((f) => body(f).not().exists().withMessage(`${f} tidak bisa diubah — batalkan lalu buat tagihan baru`)),
  ...contentRules,
];

const reasonRule = body('reason').isString().trim().notEmpty().withMessage('Alasan wajib diisi').isLength({ max: 2000 });

router.get('/billable', authorize('income:create'), validate(billableRules), controller.billable);
router.get('/', authorize('income:read'), validate(listRules), controller.list);
router.get('/:id', authorize('income:read'), validate([idParam]), controller.detail);
router.post('/', authorize('income:create'), validate(createRules), controller.create);
router.put('/:id', authorize('income:create'), validate(updateRules), controller.update);
router.put('/:id/cancel', authorize('income:create'), validate([idParam, reasonRule]), controller.cancel);
router.put('/:id/verify', authorize('income:verify'), validate([idParam,
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter')]), controller.verify);
router.put('/:id/reject', authorize('income:verify'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]), controller.reject);
router.put('/:id/void', authorize('income:verify'), validate([idParam, reasonRule]), controller.voidRecord);

module.exports = router;
