const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./chart-of-account.controller.js');

// ============================================================
// Chart of Accounts — baca (coa:read) + kelola akun non-sistem oleh Finance
// (coa:create / coa:update). Akun sistem terkunci di service. Plan Finance 8a (18 Nov 2026).
// ============================================================

const router = Router();
router.use(authenticate);

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const SYSTEM_FIELDS = ['normalBalance', 'isSystem', 'createdAt', 'updatedAt']
  .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const fieldRules = (isCreate) => [
  (isCreate ? body('accountCode') : body('accountCode').optional()).isString().trim().notEmpty().withMessage('accountCode wajib diisi'),
  (isCreate ? body('accountName') : body('accountName').optional()).isString().trim().notEmpty().withMessage('accountName wajib diisi')
    .isLength({ max: 150 }).withMessage('accountName maksimal 150 karakter'),
  (isCreate ? body('accountType') : body('accountType').optional()).isIn(ACCOUNT_TYPES).withMessage(`accountType harus salah satu dari: ${ACCOUNT_TYPES.join(', ')}`),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 2000 }).withMessage('description maksimal 2000 karakter'),
  ...(isCreate
    ? [body('isActive').not().exists().withMessage('Akun baru selalu aktif — nonaktifkan lewat PUT')]
    : [body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean()]),
  ...SYSTEM_FIELDS,
];

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
router.get('/', authorize('coa:read'), validate([
  query('accountType').optional().isIn(ACCOUNT_TYPES).withMessage(`accountType harus salah satu dari: ${ACCOUNT_TYPES.join(', ')}`),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive harus true atau false'),
]), controller.list);
router.post('/', authorize('coa:create'), validate(fieldRules(true)), controller.create);
router.put('/:id', authorize('coa:update'), validate([idParam, ...fieldRules(false)]), controller.update);

module.exports = router;
