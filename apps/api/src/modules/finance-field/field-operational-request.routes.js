const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./field-operational-request.controller.js');

// ============================================================
// Pengajuan dana operasional lapangan — docs/plan-divisi-lapangan.md L1–L3, 4b.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled'];
const MAX_ITEMS = 50;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
  query('search').optional().isString().isLength({ max: 100 }).withMessage('search maksimal 100 karakter'),
];

const notesRule = (field) => body(field).optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage(`${field} maksimal 5000 karakter`);

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const managedFields = [
  'requestCode', 'status', 'requestedBy', 'requestedAmount', 'realizedAmount', 'difference',
  'adminValidatedBy', 'adminValidatedAt', 'adminNotes',
  'financeReviewedBy', 'financeReviewedAt', 'financeNotes',
  'cancelledBy', 'cancelledAt', 'cancelReason',
  'items.*.estimatedAmount',
].map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('requestDate').isISO8601().withMessage('requestDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('neededDate').optional({ values: 'null' }).isISO8601().withMessage('neededDate harus tanggal ISO (YYYY-MM-DD)'),
  notesRule('notes'),
  body('items').isArray({ min: 1, max: MAX_ITEMS }).withMessage(`items wajib berisi 1–${MAX_ITEMS} baris biaya`),
  body('items.*.categoryId').isInt({ min: 1 }).withMessage('categoryId wajib diisi').toInt(),
  body('items.*.itemName').isString().trim().notEmpty().withMessage('itemName wajib diisi')
    .isLength({ max: 150 }).withMessage('itemName maksimal 150 karakter'),
  body('items.*.quantity').isFloat({ gt: 0, max: 9999999999 }).withMessage('quantity harus angka lebih dari 0').toFloat(),
  body('items.*.unit').isString().trim().notEmpty().withMessage('unit wajib diisi')
    .isLength({ max: 30 }).withMessage('unit maksimal 30 karakter'),
  body('items.*.estimatedUnitPrice').isFloat({ min: 0, max: 9999999999999 }).withMessage('estimatedUnitPrice tidak boleh negatif').toFloat(),
  notesRule('items.*.notes'),
  ...managedFields,
];

// Tahapan tidak bisa diubah: salah tahapan = batalkan lalu ajukan ulang
const updateRules = [
  idParam,
  body('subProjectId').not().exists().withMessage('subProjectId tidak bisa diubah — batalkan lalu ajukan ulang'),
  ...createRules.filter((rule) => !rule.builder?.fields?.includes('subProjectId')),
];

router.get('/', authorize('field-cash:read'), validate(listRules), controller.list);
router.get('/:id', authorize('field-cash:read'), validate([idParam]), controller.detail);
router.post('/', authorize('field-cash:create'), validate(createRules), controller.create);
router.put('/:id', authorize('field-cash:create'), validate(updateRules), controller.update);
router.put('/:id/cancel', authorize('field-cash:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);
router.put('/:id/validate', authorize('field-cash:validate'), validate([idParam, notesRule('notes')]), controller.validate);
router.put('/:id/approve', authorize('field-cash:approve'), validate([idParam, notesRule('notes')]), controller.approve);
// Siapa yang boleh menolak bergantung status — diperiksa per permission di service
router.put('/:id/reject', authorize('field-cash:validate', 'field-cash:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]),
  controller.reject);

module.exports = router;
