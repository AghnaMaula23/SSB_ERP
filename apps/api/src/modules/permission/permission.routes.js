const { Router } = require('express');
const { body, param } = require('express-validator');
const controller = require('./permission.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

router.get('/', authorize('permission:read', 'role:read'), controller.list);

router.post('/',
  authorize('permission:create'),
  validate([
    body('module').trim().notEmpty().withMessage('Module wajib diisi')
      .isLength({ max: 50 }).withMessage('Module maksimal 50 karakter')
      .matches(/^[a-z0-9_-]+$/).withMessage('Module hanya boleh huruf kecil, angka, underscore, dan strip'),
    body('action').trim().notEmpty().withMessage('Action wajib diisi')
      .isLength({ max: 50 }).withMessage('Action maksimal 50 karakter')
      .matches(/^[a-z0-9_-]+$/).withMessage('Action hanya boleh huruf kecil, angka, underscore, dan strip'),
    body('label').trim().notEmpty().withMessage('Label wajib diisi')
      .isLength({ max: 150 }).withMessage('Label maksimal 150 karakter'),
  ]),
  controller.create);

router.delete('/:id',
  authorize('permission:delete'),
  validate([param('id').isInt({ min: 1 }).withMessage('ID permission tidak valid').toInt()]),
  controller.remove);

module.exports = router;
