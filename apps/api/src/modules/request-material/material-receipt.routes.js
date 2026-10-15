const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadMany } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./material-receipt.controller.js');

// ============================================================
// RM-5 — penerimaan material. Form + bukti (1–5 file di field `proofs`) dalam
// SATU multipart (lampiran L4). Membaca memakai material-request:read.
// ============================================================

const router = Router();
router.use(authenticate);

const MAX_PROOFS = 5;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const optionalText = (field, max) => body(field).optional({ values: 'falsy' }).isString().trim().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  ...['materialRequestId', 'materialDeliveryId', 'subProjectId', 'externalSupplyProjectId']
    .map((f) => query(f).optional().isInt({ min: 1 }).withMessage(`${f} tidak valid`)),
  query('cancelled').optional().isIn(['true', 'false']).withMessage('cancelled harus true atau false'),
];

const createRules = [
  body('materialDeliveryId').isInt({ min: 1 }).withMessage('materialDeliveryId wajib (delivery yang diterima)').toInt(),
  body('receivedAt').isISO8601().withMessage('receivedAt wajib berupa waktu ISO 8601'),
  body('receivedQuantity').isFloat({ gt: 0, max: 99999999 }).withMessage('receivedQuantity (yang datang) harus lebih dari 0').toFloat(),
  body('acceptedQuantity').isFloat({ min: 0, max: 99999999 }).withMessage('acceptedQuantity (diterima baik) harus angka >= 0').toFloat(),
  optionalText('externalReceiverName', 150),
  optionalText('externalReceiverPhone', 50),
  optionalText('notes', 5000),
  // Satuan milik jenis material (D1)
  body('unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim'),
  ...['receiptCode', 'rejectedQuantity', 'createdBy', 'cancelledBy', 'cancelledAt', 'cancelReason']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/', authorize('material-request:read'), validate(listRules), controller.list);
router.get('/:id', authorize('material-request:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('material-receipt:create'), uploadMany('proofs', 'evidence', { min: 1, max: MAX_PROOFS }),
  validate(createRules), controller.create);
router.put('/:id/cancel', authorize('material-receipt:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);

module.exports = router;
