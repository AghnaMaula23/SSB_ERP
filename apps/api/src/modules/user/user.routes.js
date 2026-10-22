const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./user.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID user tidak valid').toInt();

router.get('/',
  authorize('user:read'),
  validate([
    query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  ]),
  controller.list);

router.get('/:id', authorize('user:read'), validate([idParam]), controller.detail);

// --- Assign role ke user ---
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
