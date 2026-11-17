const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./employee.controller.js');
const { DEPARTMENTS } = require('./employee.service.js');

// ============================================================
// Master karyawan tetap — Admin (plan Finance 5d, F26). Gaji di /employee-compensations.
// ============================================================

const router = Router();
router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const optionalText = (field, max) => body(field).optional({ values: 'null' }).isString().isLength({ max })
  .withMessage(`${field} maksimal ${max} karakter`);

const fieldRules = (isCreate) => [
  (isCreate ? body('fullName') : body('fullName').optional())
    .isString().trim().notEmpty().withMessage('Nama lengkap wajib diisi')
    .isLength({ max: 150 }).withMessage('Nama maksimal 150 karakter'),
  (isCreate ? body('department') : body('department').optional())
    .isIn(DEPARTMENTS).withMessage(`department harus salah satu dari: ${DEPARTMENTS.join(', ')}`),
  (isCreate ? body('joinDate') : body('joinDate').optional())
    .isISO8601().withMessage('joinDate wajib tanggal ISO (YYYY-MM-DD)'),
  optionalText('positionName', 100),
  optionalText('bankName', 100),
  optionalText('accountNumber', 50),
  optionalText('accountName', 150),
  optionalText('notes', 5000),
  ...(isCreate
    ? ['endDate', 'endReason'].map((f) => body(f).not().exists().withMessage(`${f} hanya lewat PUT (mencatat karyawan keluar)`))
    : [body('endDate').optional({ values: 'null' }).isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD) atau null'),
      optionalText('endReason', 5000)]),
  ...['employeeCode', 'createdBy', 'isActive', 'userId']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('active').optional().isIn(['true', 'false']).withMessage('active harus true atau false'),
  query('department').optional().isIn(DEPARTMENTS).withMessage(`department harus salah satu dari: ${DEPARTMENTS.join(', ')}`),
];

router.get('/', authorize('employee:read'), validate(listRules), controller.list);
router.get('/:id', authorize('employee:read'), validate([idParam]), controller.detail);
router.post('/', authorize('employee:create'), validate(fieldRules(true)), controller.create);
router.put('/:id', authorize('employee:update'), validate([idParam, ...fieldRules(false)]), controller.update);

module.exports = router;
