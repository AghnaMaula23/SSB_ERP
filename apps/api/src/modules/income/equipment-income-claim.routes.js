const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./equipment-income-claim.controller.js');

// ============================================================
// Klaim pendapatan alat — Divisi Alat mengajukan, Finance memutuskan
// (docs/claude_knowledge/plan-divisi-finance.md 5c, F19–F23).
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'approved', 'rejected', 'cancelled'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const periodQuery = [
  query('periodStart').isISO8601().withMessage('periodStart wajib tanggal ISO (YYYY-MM-DD)'),
  query('periodEnd').isISO8601().withMessage('periodEnd wajib tanggal ISO (YYYY-MM-DD)'),
];
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
];
const createRules = [
  body('periodStart').isISO8601().withMessage('periodStart wajib tanggal ISO (YYYY-MM-DD)'),
  body('periodEnd').isISO8601().withMessage('periodEnd wajib tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  // Item, tarif, dan total dikelola sistem (F22) — ditolak daripada dibuang diam-diam
  ...['claimCode', 'status', 'items', 'totalAmount', 'totalHours', 'submittedBy']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/eligible', authorize('equipment-claim:create'), validate(periodQuery), controller.eligible);
router.get('/', authorize('equipment-claim:read'), validate(listRules), controller.list);
router.get('/:id', authorize('equipment-claim:read'), validate([idParam]), controller.detail);
router.post('/', authorize('equipment-claim:create'), validate(createRules), controller.create);
router.put('/:id/cancel', authorize('equipment-claim:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]), controller.cancel);
router.put('/:id/approve', authorize('equipment-claim:approve'),
  validate([idParam, body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 })]), controller.approve);
router.put('/:id/reject', authorize('equipment-claim:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]), controller.reject);

module.exports = router;
