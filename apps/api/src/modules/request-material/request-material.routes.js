const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./request-material.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const REQUEST_TYPES = ['internal_project', 'external_supply'];
const REQUEST_STATUSES = ['submitted', 'waiting_finance_approval', 'approved', 'rejected', 'cancelled'];
const COST_TYPES = ['material_cost', 'driver_fee', 'delivery_fee', 'loading_unloading_fee', 'fuel_cost', 'other'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() — sanitizer itu tidak berfungsi pada req.query di Express 5.
// Konversinya di controller (utils/query.js).
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('status').optional().isIn(REQUEST_STATUSES).withMessage(`status harus salah satu dari: ${REQUEST_STATUSES.join(', ')}`),
  query('requestType').optional().isIn(REQUEST_TYPES).withMessage(`requestType harus salah satu dari: ${REQUEST_TYPES.join(', ')}`),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('externalSupplyProjectId').optional().isInt({ min: 1 }).withMessage('externalSupplyProjectId tidak valid'),
];

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const rejectSystemManaged = (...fields) =>
  fields.map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const notesRule = (field) => body(field).optional({ nullable: true }).isString().trim();

// Kuantitas desimal: material diukur m³/ton/liter, bukan cacah.
const quantityRule = (field, label) => body(field)
  .isFloat({ gt: 0, max: 99999999 }).withMessage(`${label} harus angka lebih dari 0`).toFloat();

const createRules = [
  body('requestType').isIn(REQUEST_TYPES).withMessage(`requestType harus salah satu dari: ${REQUEST_TYPES.join(', ')}`),
  body('subProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('subProjectId tidak valid').toInt(),
  body('externalSupplyProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('externalSupplyProjectId tidak valid').toInt(),
  body('requestDate').optional().isISO8601().withMessage('requestDate harus tanggal ISO (YYYY-MM-DD)'),
  body('neededDate').optional({ nullable: true }).isISO8601().withMessage('neededDate harus tanggal ISO (YYYY-MM-DD)'),
  notesRule('requestNotes'),
  body('items').isArray({ min: 1 }).withMessage('items wajib berisi minimal satu jenis material'),
  body('items.*.materialTypeId').isInt({ min: 1 }).withMessage('materialTypeId tidak valid').toInt(),
  quantityRule('items.*.requestedQuantity', 'requestedQuantity'),
  notesRule('items.*.itemNotes'),
  // Satuan milik jenis material (D1) — konversi (mis. rit → m³) tanggung jawab penginput
  body('items.*.unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim. Konversikan kuantitasnya ke satuan jenis material.'),
  ...rejectSystemManaged(
    'requestCode', 'status', 'requestedBy',
    'adminReviewedBy', 'adminReviewedAt', 'adminNotes',
    'financeReviewedBy', 'financeReviewedAt', 'financeNotes',
    'cancelledBy', 'cancelledAt',
    'items.*.adminValidatedQuantity', 'items.*.adminNotes', 'items.*.materialPoolItemId',
  ),
];

const adminValidationRules = [
  idParam,
  body('items').isArray({ min: 1 }).withMessage('items wajib berisi minimal satu penyesuaian'),
  body('items.*.itemId').isInt({ min: 1 }).withMessage('itemId tidak valid').toInt(),
  // null = kembalikan ke kuantitas yang diminta
  body('items.*.adminValidatedQuantity').optional({ nullable: true })
    .isFloat({ gt: 0, max: 99999999 }).withMessage('adminValidatedQuantity harus lebih dari 0 — untuk mencoret item, tolak request-nya').toFloat(),
  notesRule('items.*.adminNotes'),
  body('items.*.unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim'),
];

// Mengganti SELURUH daftar biaya; array kosong = mengosongkan
const costRules = [
  idParam,
  body('costs').isArray().withMessage('costs wajib berupa array'),
  body('costs.*.costType').isIn(COST_TYPES).withMessage(`costType harus salah satu dari: ${COST_TYPES.join(', ')}`),
  body('costs.*.materialRequestItemId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('materialRequestItemId tidak valid').toInt(),
  body('costs.*.description').isString().trim().notEmpty().withMessage('description wajib diisi'),
  body('costs.*.amount').isFloat({ gt: 0, max: 9999999999999 }).withMessage('amount harus angka lebih dari 0').toFloat(),
  body('costs.*.payeeName').optional({ nullable: true }).isString().trim().isLength({ max: 150 }).withMessage('payeeName maksimal 150 karakter'),
  notesRule('costs.*.notes'),
  // Finance tidak mengisi nominal aktual (F2) — kolom ERD ini tidak dibuat
  body('costs.*.approvedAmount').not().exists().withMessage('approvedAmount tidak dipakai: yang disetujui Finance = yang diajukan'),
];

const approveRules = [
  idParam,
  notesRule('notes'),
  body('materialPoolId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('materialPoolId tidak valid').toInt(),
];

router.get('/', authorize('material-request:read'), validate(listRules), controller.list);
router.get('/:id', authorize('material-request:read'), validate([idParam]), controller.detail);
router.post('/', authorize('material-request:create'), validate(createRules), controller.create);
router.put('/:id/cancel', authorize('material-request:create'), validate([idParam]), controller.cancel);
router.put('/:id/admin-validation', authorize('material-request:validate'), validate(adminValidationRules), controller.adminValidate);
router.put('/:id/costs', authorize('material-request:validate'), validate(costRules), controller.replaceCosts);
router.put('/:id/submit-to-finance', authorize('material-request:validate'), validate([idParam, notesRule('notes')]), controller.submitToFinance);
router.put('/:id/approve', authorize('material-request:approve'), validate(approveRules), controller.approve);
// Siapa yang boleh menolak bergantung status request — diperiksa per permission di service
router.put('/:id/reject', authorize('material-request:validate', 'material-request:approve'),
  validate([idParam, body('notes').isString().trim().notEmpty().withMessage('Alasan penolakan wajib diisi')]),
  controller.reject);

module.exports = router;
