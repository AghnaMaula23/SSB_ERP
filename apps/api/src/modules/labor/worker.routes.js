const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./worker.controller.js');

// ============================================================
// Master pekerja (global) — docs/skema-tenaga-kerja-harian.md P5/P6
// ============================================================

const router = Router();
router.use(authenticate);

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

const fieldRules = (required) => [
  (required ? body('fullName') : body('fullName').optional())
    .isString().trim().notEmpty().withMessage('Nama lengkap wajib diisi')
    .isLength({ max: 150 }).withMessage('Nama maksimal 150 karakter'),
  body('idNumber').optional({ values: 'null' }).isString().trim()
    .matches(/^\d{16}$/).withMessage('NIK harus 16 digit angka (boleh dikosongkan)'),
  body('phone').optional({ values: 'null' }).isString().trim().isLength({ max: 30 }).withMessage('Nomor telepon maksimal 30 karakter'),
  body('defaultRole').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Peran maksimal 100 karakter'),
  body('joinedAt').optional({ values: 'null' }).isISO8601().withMessage('joinedAt harus tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...['workerCode', 'createdBy']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];

router.get('/', authorize('worker:read'), validate(listRules), controller.list);
router.get('/:id', authorize('worker:read'), validate([idParam]), controller.detail);
router.post('/', authorize('worker:create'), validate(fieldRules(true)), controller.create);
router.put('/:id', authorize('worker:update'), validate([idParam, ...fieldRules(false)]), controller.update);
router.delete('/:id', authorize('worker:delete'), validate([idParam]), controller.remove);

module.exports = router;
