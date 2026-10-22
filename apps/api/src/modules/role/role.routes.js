const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./role.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

// Semua endpoint role butuh login
router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID role tidak valid').toInt();

const createRules = [
  body('code').trim().notEmpty().withMessage('Kode role wajib diisi')
    .isLength({ max: 50 }).withMessage('Kode role maksimal 50 karakter')
    .matches(/^[a-z0-9_]+$/).withMessage('Kode role hanya boleh huruf kecil, angka, dan underscore'),
  body('name').trim().notEmpty().withMessage('Nama role wajib diisi')
    .isLength({ max: 100 }).withMessage('Nama role maksimal 100 karakter'),
  body('description').optional({ nullable: true }).trim(),
];

const updateRules = [
  idParam,
  body('name').optional().trim().notEmpty().withMessage('Nama role tidak boleh kosong')
    .isLength({ max: 100 }).withMessage('Nama role maksimal 100 karakter'),
  body('description').optional({ nullable: true }).trim(),
  body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
];

router.get('/',
  authorize('role:read'),
  validate([
    query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  ]),
  controller.list);

router.get('/:id', authorize('role:read'), validate([idParam]), controller.detail);

router.post('/', authorize('role:create'), validate(createRules), controller.create);

router.put('/:id', authorize('role:update'), validate(updateRules), controller.update);

router.delete('/:id', authorize('role:delete'), validate([idParam]), controller.remove);

// --- Assign permission ke role ---
router.put('/:id/permissions',
  authorize('role:update'),
  validate([
    idParam,
    body('permissionIds').isArray().withMessage('permissionIds harus berupa array'),
    body('permissionIds.*').isInt({ min: 1 }).withMessage('permissionIds harus berisi ID angka').toInt(),
  ]),
  controller.setPermissions);

router.post('/:id/permissions',
  authorize('role:update'),
  validate([
    idParam,
    body('permissionId').isInt({ min: 1 }).withMessage('permissionId wajib diisi dan harus angka').toInt(),
  ]),
  controller.addPermission);

router.delete('/:id/permissions/:permissionId',
  authorize('role:update'),
  validate([
    idParam,
    param('permissionId').isInt({ min: 1 }).withMessage('ID permission tidak valid').toInt(),
  ]),
  controller.removePermission);

module.exports = router;
