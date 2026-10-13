const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./material.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const { MATERIAL_UNITS } = require('./material.constants.js');

const router = Router();

router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() — sanitizer itu tidak berfungsi pada req.query di Express 5.
// Konversinya di controller (utils/query.js).
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive harus true atau false'),
];

const unitRule = (chain) => chain
  .isIn(MATERIAL_UNITS).withMessage(`unit harus salah satu dari: ${MATERIAL_UNITS.join(', ')}`);

// ============================================================
// SATUAN — /api/materials/units (sumber dropdown FE, sama dengan validator)
// ============================================================
router.get('/units', authorize('material:read'), controller.listUnits);

// ============================================================
// JENIS MATERIAL — /api/materials/types
// ============================================================
router.get('/types', authorize('material:read'), validate(listRules), controller.listTypes);
router.get('/types/:id', authorize('material:read'), validate([idParam]), controller.detailType);

router.post('/types',
  authorize('material:create'),
  validate([
    body('materialCode').trim().notEmpty().withMessage('Kode material wajib diisi')
      .isLength({ max: 50 }).withMessage('Kode material maksimal 50 karakter')
      .matches(/^[A-Za-z0-9_-]+$/).withMessage('Kode material hanya boleh huruf, angka, underscore, dan strip'),
    body('materialName').trim().notEmpty().withMessage('Nama material wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama material maksimal 150 karakter'),
    unitRule(body('unit')),
    body('description').optional({ nullable: true }).trim(),
    body('isActive').not().exists().withMessage('Jenis material baru selalu aktif'),
  ]),
  controller.createType);

router.put('/types/:id',
  authorize('material:update'),
  validate([
    idParam,
    body('materialCode').not().exists().withMessage('Kode material tidak bisa diubah setelah dibuat'),
    body('materialName').optional().trim().notEmpty().withMessage('Nama material tidak boleh kosong')
      .isLength({ max: 150 }).withMessage('Nama material maksimal 150 karakter'),
    unitRule(body('unit').optional()),
    body('description').optional({ nullable: true }).trim(),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  controller.updateType);

// ============================================================
// SUPPLIER — /api/materials/suppliers
// ============================================================
router.get('/suppliers', authorize('supplier:read'), validate(listRules), controller.listSuppliers);
router.get('/suppliers/:id', authorize('supplier:read'), validate([idParam]), controller.detailSupplier);

const supplierOptionalRules = [
  body('phone').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Nomor telepon maksimal 50 karakter'),
  body('address').optional({ nullable: true }).trim(),
];

router.post('/suppliers',
  authorize('supplier:create'),
  validate([
    body('supplierName').trim().notEmpty().withMessage('Nama supplier wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama supplier maksimal 150 karakter'),
    ...supplierOptionalRules,
    body('isActive').not().exists().withMessage('Supplier baru selalu aktif'),
  ]),
  controller.createSupplier);

router.put('/suppliers/:id',
  authorize('supplier:update'),
  validate([
    idParam,
    body('supplierName').optional().trim().notEmpty().withMessage('Nama supplier tidak boleh kosong')
      .isLength({ max: 150 }).withMessage('Nama supplier maksimal 150 karakter'),
    ...supplierOptionalRules,
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  controller.updateSupplier);

module.exports = router;
