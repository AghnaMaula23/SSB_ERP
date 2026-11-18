const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./journal.controller.js');
const { SOURCE_REFS } = require('./journal.service.js');

// ============================================================
// Jurnal GL — baca saja, kecuali penyesuaian selisih request material
// (docs/claude_knowledge/plan-divisi-finance.md 5a). Tidak ada POST jurnal:
// jurnal lahir dari aksi modul sumber.
// ============================================================

const router = Router();
router.use(authenticate);

const SOURCE_TYPES = ['income_record', 'income_payment', 'equipment_income_claim', 'material_request', 'field_expense_report',
  'labor_payment_proof', 'payroll', 'manual_expense', 'journal_adjustment', 'opening_balance'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const intQuery = (field) => query(field).optional().isInt({ min: 1 }).withMessage(`${field} tidak valid`);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('search').optional().isString().isLength({ max: 100 }),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
  query('sourceType').optional().isIn(SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${SOURCE_TYPES.join(', ')}`),
  ...['accountId', 'constructionProjectId', 'subProjectId', 'externalRentalProjectId', 'externalSupplyProjectId'].map(intQuery),
];

const adjustmentRules = [
  idParam,
  body('amount').isFloat({ min: -9999999999999, max: 9999999999999 }).withMessage('amount wajib angka (boleh negatif)').toFloat()
    .custom((v) => v !== 0).withMessage('amount tidak boleh 0'),
  body('adjustmentDate').isISO8601().withMessage('adjustmentDate wajib tanggal ISO (YYYY-MM-DD)'),
  body('reason').isString().trim().notEmpty().withMessage('Alasan penyesuaian wajib diisi').isLength({ max: 2000 }),
];

router.get('/', authorize('journal:read'), validate(listRules), controller.list);
router.get('/:id', authorize('journal:read'), validate([idParam]), controller.detail);
router.post('/:id/adjustments', authorize('journal:adjust'), validate(adjustmentRules), controller.addAdjustment);

// Penjaga drift: daftar validator harus sama dengan sumber yang dikenal mesin jurnal
const unknown = Object.keys(SOURCE_REFS).filter((s) => !SOURCE_TYPES.includes(s));
if (unknown.length) throw new Error(`journal.routes: SOURCE_TYPES belum memuat ${unknown.join(', ')}`);

module.exports = router;
