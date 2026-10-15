const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadSingle } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./material-delivery.controller.js');

// ============================================================
// RM-4 — delivery + surat jalan. Form & file dikirim dalam SATU multipart
// (docs/keputusan-desain-lampiran.md L4); file surat jalan di field `deliveryNote`.
// Membaca memakai material-request:read — delivery bagian dari request material.
// ============================================================

const router = Router();
router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const optionalText = (field, max) => body(field).optional({ values: 'falsy' }).isString().trim().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);
// Nomor surat jalan & plat dinormalisasi supaya "sj-01 " dan "SJ-01" tidak tercatat dua kali
const upperCode = (value) => value.toUpperCase().replace(/\s+/g, ' ');

const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('materialRequestId').optional().isInt({ min: 1 }).withMessage('materialRequestId tidak valid'),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('externalSupplyProjectId').optional().isInt({ min: 1 }).withMessage('externalSupplyProjectId tidak valid'),
  query('supplierId').optional().isInt({ min: 1 }).withMessage('supplierId tidak valid'),
  query('cancelled').optional().isIn(['true', 'false']).withMessage('cancelled harus true atau false'),
];

const createRules = [
  body('materialRequestItemId').isInt({ min: 1 }).withMessage('materialRequestItemId wajib (item request yang dikirim)').toInt(),
  body('supplierId').isInt({ min: 1 }).withMessage('supplierId wajib diisi').toInt(),
  body('deliveredQuantity').isFloat({ gt: 0, max: 99999999 }).withMessage('deliveredQuantity harus angka lebih dari 0').toFloat(),
  body('deliveryNoteNumber').isString().trim().notEmpty().withMessage('Nomor surat jalan wajib diisi')
    .isLength({ max: 100 }).withMessage('Nomor surat jalan maksimal 100 karakter').customSanitizer(upperCode),
  body('deliveryNoteDate').isISO8601().withMessage('deliveryNoteDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('vehicleNumber').isString().trim().notEmpty().withMessage('Nomor kendaraan wajib diisi')
    .isLength({ max: 30 }).withMessage('Nomor kendaraan maksimal 30 karakter').customSanitizer(upperCode),
  body('driverName').isString().trim().notEmpty().withMessage('Nama sopir wajib diisi')
    .isLength({ max: 150 }).withMessage('Nama sopir maksimal 150 karakter'),
  optionalText('vehicleType', 50),
  optionalText('driverPhone', 50),
  optionalText('originLocation', 255),
  optionalText('destinationLocation', 255),
  optionalText('notes', 5000),
  // Satuan & jenis material milik item request (D1) — konversi tanggung jawab penginput
  body('unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim. Konversikan kuantitasnya ke satuan jenis material.'),
  ...['deliveryCode', 'materialRequestId', 'deliveryNoteFileId', 'createdBy', 'cancelledBy', 'cancelledAt', 'cancelReason']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

// TANPA .toInt() di query() — sanitizer itu tidak berfungsi pada req.query di
// Express 5; konversinya di controller (utils/query.js).
router.get('/', authorize('material-request:read'), validate(listRules), controller.list);
router.get('/:id', authorize('material-request:read'), validate([idParam]), controller.detail);
// Urutan: authorize dulu (tolak sebelum file dibaca), lalu multipart, baru validator field teks
router.post('/', authorize('material-delivery:create'), uploadSingle('deliveryNote', 'evidence'), validate(createRules), controller.create);
router.put('/:id/delivery-note', authorize('material-delivery:create'), validate([idParam]),
  uploadSingle('deliveryNote', 'evidence'), controller.replaceDeliveryNote);
router.put('/:id/cancel', authorize('material-delivery:create'),
  validate([idParam, body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancel);

module.exports = router;
