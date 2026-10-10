const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./request-alat.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const REQUEST_TYPES = ['internal_project', 'external_rental'];
const REQUEST_STATUSES = ['submitted', 'equipment_review', 'approved', 'rejected', 'cancelled'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() — sanitizer itu tidak berfungsi pada req.query di Express 5.
// Konversinya di controller (utils/query.js).
const listRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
  query('status').optional().isIn(REQUEST_STATUSES).withMessage(`status harus salah satu dari: ${REQUEST_STATUSES.join(', ')}`),
  query('requestType').optional().isIn(REQUEST_TYPES).withMessage(`requestType harus salah satu dari: ${REQUEST_TYPES.join(', ')}`),
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('externalRentalProjectId').optional().isInt({ min: 1 }).withMessage('externalRentalProjectId tidak valid'),
];

/** Kolom dibuat sistem — ditolak 400 daripada dibuang diam-diam. */
const rejectSystemManaged = (...fields) =>
  fields.map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const notesRule = (field) => body(field).optional({ nullable: true }).isString().trim();

const createRules = [
  body('requestType').isIn(REQUEST_TYPES).withMessage(`requestType harus salah satu dari: ${REQUEST_TYPES.join(', ')}`),
  body('subProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('subProjectId tidak valid').toInt(),
  body('externalRentalProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('externalRentalProjectId tidak valid').toInt(),
  body('requestDate').optional().isISO8601().withMessage('requestDate harus tanggal ISO (YYYY-MM-DD)'),
  body('neededDate').optional({ nullable: true }).isISO8601().withMessage('neededDate harus tanggal ISO (YYYY-MM-DD)'),
  notesRule('locationDetail'),
  notesRule('requestNotes'),
  body('items').isArray({ min: 1 }).withMessage('items wajib berisi minimal satu jenis alat'),
  body('items.*.equipmentTypeId').isInt({ min: 1 }).withMessage('equipmentTypeId tidak valid').toInt(),
  body('items.*.requestedQuantity').isInt({ min: 1, max: 100 }).withMessage('requestedQuantity harus 1-100').toInt(),
  body('items.*.estimatedWorkhours').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('estimatedWorkhours harus angka >= 0').toFloat(),
  notesRule('items.*.itemNotes'),
  ...rejectSystemManaged(
    'requestCode', 'status', 'requestedBy',
    'adminReviewedBy', 'adminReviewedAt', 'adminNotes',
    'equipmentReviewedBy', 'equipmentReviewedAt', 'equipmentNotes',
    'cancelledBy', 'cancelledAt',
    'items.*.approvedQuantity', 'items.*.decisionNotes',
  ),
];

const adminReviewRules = [
  idParam,
  body('action').isIn(['forward', 'reject']).withMessage('action harus "forward" atau "reject"'),
  notesRule('notes'),
];

const equipmentReviewRules = [
  idParam,
  body('items').isArray({ min: 1 }).withMessage('items wajib berisi keputusan setiap item'),
  body('items.*.itemId').isInt({ min: 1 }).withMessage('itemId tidak valid').toInt(),
  body('items.*.approvedQuantity').isInt({ min: 0 }).withMessage('approvedQuantity harus angka >= 0').toInt(),
  notesRule('items.*.decisionNotes'),
  notesRule('notes'),
  body('equipmentPoolId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('equipmentPoolId tidak valid').toInt(),
];

router.get('/', authorize('equipment-request:read'), validate(listRules), controller.list);
router.get('/:id', authorize('equipment-request:read'), validate([idParam]), controller.detail);
router.post('/', authorize('equipment-request:create'), validate(createRules), controller.create);
router.put('/:id/cancel', authorize('equipment-request:create'), validate([idParam]), controller.cancel);
router.put('/:id/admin-review', authorize('equipment-request:review'), validate(adminReviewRules), controller.adminReview);
router.put('/:id/equipment-review', authorize('equipment-request:approve'), validate(equipmentReviewRules), controller.equipmentReview);

module.exports = router;
