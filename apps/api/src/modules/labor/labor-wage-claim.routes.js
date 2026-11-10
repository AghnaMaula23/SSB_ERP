const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./labor-wage-claim.controller.js');

// ============================================================
// Klaim upah pekerja — docs/claude_knowledge/plan-divisi-lapangan.md L5–L8, 4c.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
  query('paid').optional().isIn(['true', 'false']).withMessage('paid harus true atau false'),
];

const notesRule = body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter');

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. Baris klaim = snapshot log (L5). */
const managedFields = [
  'claimCode', 'status', 'requestedBy', 'items', 'totalAmount', 'workerCount', 'manDays', 'paidAmount', 'difference',
  'adminValidatedBy', 'adminValidatedAt', 'adminNotes',
  'financeReviewedBy', 'financeReviewedAt', 'financeNotes',
  'cancelledBy', 'cancelledAt', 'cancelReason',
].map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('periodStart').isISO8601().withMessage('periodStart wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('periodEnd').isISO8601().withMessage('periodEnd wajib berupa tanggal ISO (YYYY-MM-DD)'),
  notesRule,
  ...managedFields,
];

router.get('/', authorize('labor-claim:read'), validate(listRules), controller.list);
router.get('/:id', authorize('labor-claim:read'), validate([idParam]), controller.detail);
router.post('/', authorize('labor-claim:create'), validate(createRules), controller.create);
router.put('/:id/cancel', authorize('labor-claim:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);
router.put('/:id/validate', authorize('labor-claim:validate'), validate([idParam, notesRule]), controller.validate);
router.put('/:id/approve', authorize('labor-claim:approve'), validate([idParam, notesRule]), controller.approve);
// Siapa yang boleh menolak bergantung status — diperiksa per permission di service
router.put('/:id/reject', authorize('labor-claim:validate', 'labor-claim:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]),
  controller.reject);

module.exports = router;
