const { Router } = require('express');
const { body, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./employee-compensation.controller.js');

// ============================================================
// Riwayat gaji pokok karyawan — Finance (plan Finance 5d, F29: Finance + super_admin melihat).
// ============================================================

const router = Router();
router.use(authenticate);

router.get('/', authorize('compensation:read'),
  validate([query('employeeId').isInt({ min: 1 }).withMessage('employeeId wajib diisi')]), controller.list);
router.post('/', authorize('compensation:create'), validate([
  body('employeeId').isInt({ min: 1 }).withMessage('employeeId wajib diisi').toInt(),
  body('baseSalary').isFloat({ gt: 0, max: 9999999999999 }).withMessage('baseSalary harus angka lebih dari 0').toFloat(),
  body('effectiveStartDate').isISO8601().withMessage('effectiveStartDate wajib tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...['isCurrent', 'createdBy']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
]), controller.create);

module.exports = router;
