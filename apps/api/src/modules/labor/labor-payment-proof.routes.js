const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./labor-payment-proof.controller.js');

// ============================================================
// Bukti bayar upah — docs/claude_knowledge/plan-divisi-lapangan.md L8, 4c.
// Form + berkas (1–10 file di field `proofs`) dalam SATU multipart.
// ============================================================

const router = Router();
router.use(authenticate);

const STATUSES = ['submitted', 'validated', 'rejected', 'cancelled'];
const MAX_FILES = 10;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('laborWageClaimId').optional().isInt({ min: 1 }).withMessage('laborWageClaimId tidak valid'),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('status').optional().isIn(STATUSES).withMessage(`status harus salah satu dari: ${STATUSES.join(', ')}`),
];

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const managedFields = [
  'proofCode', 'status', 'submittedBy', 'difference',
  'validatedBy', 'validatedAt', 'financeNotes', 'cancelledBy', 'cancelledAt', 'cancelReason',
].map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const createRules = [
  body('laborWageClaimId').isInt({ min: 1 }).withMessage('laborWageClaimId wajib diisi').toInt(),
  body('paymentDate').isISO8601().withMessage('paymentDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('paidAmount').isFloat({ gt: 0, max: 9999999999999 }).withMessage('paidAmount harus angka lebih dari 0').toFloat(),
  body('receiverName').optional({ values: 'falsy' }).isString().isLength({ max: 150 }).withMessage('receiverName maksimal 150 karakter'),
  body('notes').optional({ values: 'falsy' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...managedFields,
];

const notesRule = body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter');

router.get('/', authorize('labor-claim:read'), validate(listRules), controller.list);
router.get('/:id', authorize('labor-claim:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('labor-claim:create'), uploadMany('proofs', 'evidence', { min: 1, max: MAX_FILES }),
  validate(createRules), controller.create);
router.put('/:id/cancel', authorize('labor-claim:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);
router.put('/:id/validate', authorize('labor-claim:approve'), validate([idParam, notesRule]), controller.validate);
router.put('/:id/reject', authorize('labor-claim:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]),
  controller.reject);

module.exports = router;
