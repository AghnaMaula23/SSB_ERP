const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./material-stock.controller.js');

// ============================================================
// RM-5 — stok material per tahapan (konstruksi). Saldo dihitung saat dibaca
// dari receipt + mutasi manual; stok tidak boleh minus (H4–H6).
// ============================================================

const router = Router();
router.use(authenticate);

const MOVEMENT_TYPES = ['used', 'adjustment_in', 'adjustment_out'];

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const subProjectQuery = query('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi');

const movementListRules = [
  subProjectQuery,
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('materialTypeId').optional().isInt({ min: 1 }).withMessage('materialTypeId tidak valid'),
  query('movementType').optional().isIn(MOVEMENT_TYPES).withMessage(`movementType harus salah satu dari: ${MOVEMENT_TYPES.join(', ')}`),
];

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('materialTypeId').isInt({ min: 1 }).withMessage('materialTypeId wajib diisi').toInt(),
  body('movementType').isIn(MOVEMENT_TYPES)
    .withMessage(`movementType harus salah satu dari: ${MOVEMENT_TYPES.join(', ')} — stok masuk dari penerimaan dicatat lewat receipt`),
  body('quantity').isFloat({ gt: 0, max: 99999999 }).withMessage('quantity harus lebih dari 0').toFloat(),
  body('movementDate').isISO8601().withMessage('movementDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  body('unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim'),
  ...['createdBy', 'cancelledBy', 'cancelledAt', 'cancelReason']
    .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`)),
];

router.get('/', authorize('material-stock:read'), validate([subProjectQuery]), controller.stock);
router.get('/movements', authorize('material-stock:read'), validate(movementListRules), controller.listMovements);
router.post('/movements', authorize('material-stock:create'), validate(createRules), controller.createMovement);
router.put('/movements/:id/cancel', authorize('material-stock:create'),
  validate([param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt(),
    body('reason').isString().trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')]),
  controller.cancelMovement);

module.exports = router;
