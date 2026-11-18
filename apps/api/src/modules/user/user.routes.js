const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./user.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize, clearAuthCacheOnWrite } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate, clearAuthCacheOnWrite);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID user tidak valid').toInt();

router.get('/',
  authorize('user:read'),
  validate([
    query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  ]),
  controller.list);

router.get('/:id', authorize('user:read'), validate([idParam]), controller.detail);

// --- Tautan akun ke karyawan tetap (plan Finance F26) ---
router.put('/:id/employee',
  authorize('user:update'),
  validate([
    idParam,
    // Wajib dikirim; null = lepas tautan. Tanpa .optional() — itu akan meloloskan field yang tidak dikirim
    body('employeeId').custom((v) => v === null || (Number.isInteger(v) && v > 0))
      .withMessage('employeeId wajib dikirim: ID karyawan (angka), atau null untuk melepas tautan'),
  ]),
  controller.setEmployee);

// --- Assign role ke user ---
// Username tidak bisa diubah: ia identitas login dan jejak audit
router.put('/:id',
  authorize('user:update'),
  validate([
    idParam,
    body('username').not().exists().withMessage('Username tidak bisa diubah'),
    body('fullName').optional().isString().trim().notEmpty().withMessage('Nama lengkap wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama lengkap maksimal 150 karakter'),
    body('email').optional().isEmail().withMessage('Format email tidak valid').isLength({ max: 150 }).withMessage('Email maksimal 150 karakter'),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
    body('password').optional({ values: 'falsy' }).isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
  ]),
  controller.update);

router.put('/:id/roles',
  authorize('user:update'),
  validate([
    idParam,
    body('roleIds').isArray().withMessage('roleIds harus berupa array'),
    body('roleIds.*').isInt({ min: 1 }).withMessage('roleIds harus berisi ID angka').toInt(),
  ]),
  controller.setRoles);

router.post('/:id/roles',
  authorize('user:update'),
  validate([
    idParam,
    body('roleId').isInt({ min: 1 }).withMessage('roleId wajib diisi dan harus angka').toInt(),
  ]),
  controller.addRole);

router.delete('/:id/roles/:roleId',
  authorize('user:update'),
  validate([
    idParam,
    param('roleId').isInt({ min: 1 }).withMessage('ID role tidak valid').toInt(),
  ]),
  controller.removeRole);

module.exports = router;
