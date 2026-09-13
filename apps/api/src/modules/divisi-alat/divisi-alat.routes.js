const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./divisi-alat.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const EQUIPMENT_STATUSES = [
  'available', 'assigned', 'delivered_to_location', 'received_at_site',
  'in_use', 'maintenance', 'damaged', 'retired',
];
const WORKHOUR_SOURCE_TYPES = ['internal_project', 'external_rental', 'manual_adjustment'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];

// ============================================================
// EQUIPMENT TYPES — /api/equipment/types
// ============================================================

router.get('/types', authorize('equipment:read'), validate(pageRules), controller.listTypes);

router.get('/types/:id', authorize('equipment:read'), validate([idParam]), controller.detailType);

router.post('/types',
  authorize('equipment:create'),
  validate([
    body('typeCode').trim().notEmpty().withMessage('Kode jenis alat wajib diisi')
      .isLength({ max: 50 }).withMessage('Kode jenis alat maksimal 50 karakter')
      .matches(/^[A-Za-z0-9_-]+$/).withMessage('Kode jenis alat hanya boleh huruf, angka, underscore, dan strip'),
    body('typeName').trim().notEmpty().withMessage('Nama jenis alat wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama jenis alat maksimal 150 karakter'),
    body('description').optional({ nullable: true }).trim(),
  ]),
  controller.createType);

router.put('/types/:id',
  authorize('equipment:update'),
  validate([
    idParam,
    body('typeName').optional().trim().notEmpty().withMessage('Nama jenis alat tidak boleh kosong')
      .isLength({ max: 150 }).withMessage('Nama jenis alat maksimal 150 karakter'),
    body('description').optional({ nullable: true }).trim(),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  controller.updateType);

router.delete('/types/:id', authorize('equipment:delete'), validate([idParam]), controller.removeType);

// ============================================================
// EQUIPMENT ITEMS — /api/equipment/items
// ============================================================

// Field opsional alat, sama untuk create maupun update
const itemOptionalRules = [
  body('plateNumber').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Nomor plat maksimal 30 karakter'),
  body('brand').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Merek maksimal 100 karakter'),
  body('model').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Model maksimal 100 karakter'),
  body('serialNumber').optional({ nullable: true }).trim().isLength({ max: 100 }).withMessage('Nomor seri maksimal 100 karakter'),
  body('manufactureYear').optional({ nullable: true })
    .isInt({ min: 1900, max: new Date().getFullYear() + 1 }).withMessage('Tahun pembuatan tidak masuk akal').toInt(),
  body('defaultHourlyRate').optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Rate per jam tidak boleh negatif').toFloat(),
  body('rateNotes').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
];

// assetCode dibuat sistem (SSB-{typeCode}-{NNN}). Di sini hanya dicek bentuknya;
// siapa yang boleh mengirimnya manual diputuskan di service (403 kalau bukan
// super_admin), supaya kebijakannya cuma hidup di satu tempat.
const assetCodeOverrideRule = body('assetCode')
  .optional()
  .trim().notEmpty().withMessage('Kode aset tidak boleh string kosong')
  .isLength({ max: 50 }).withMessage('Kode aset maksimal 50 karakter');

const createItemRules = [
  body('equipmentTypeId').isInt({ min: 1 }).withMessage('equipmentTypeId wajib diisi dan harus angka').toInt(),
  assetCodeOverrideRule,
  ...itemOptionalRules,
];

const updateItemRules = [
  body('equipmentTypeId').optional().isInt({ min: 1 }).withMessage('equipmentTypeId harus angka').toInt(),
  assetCodeOverrideRule,
  body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  // Ditolak terang-terangan supaya perubahan status tidak lolos tanpa audit trail
  body('currentStatus').not().exists()
    .withMessage('Status alat tidak bisa diubah di sini. Pakai PUT /equipment/items/{id}/status'),
  body('totalWorkhour').not().exists()
    .withMessage('totalWorkhour dikelola sistem dari workhour log, tidak bisa diisi manual'),
  ...itemOptionalRules,
];

router.get('/items',
  authorize('equipment:read'),
  validate([
    ...pageRules,
    query('typeId').optional().isInt({ min: 1 }).withMessage('typeId harus angka'),
    query('status').optional().isIn(EQUIPMENT_STATUSES).withMessage(`status harus salah satu dari: ${EQUIPMENT_STATUSES.join(', ')}`),
  ]),
  controller.listItems);

router.get('/items/:id', authorize('equipment:read'), validate([idParam]), controller.detailItem);

router.post('/items', authorize('equipment:create'), validate(createItemRules), controller.createItem);

router.put('/items/:id',
  authorize('equipment:update'),
  validate([idParam, ...updateItemRules]),
  controller.updateItem);

// Status alat tidak diubah lewat PUT /items/:id — selalu lewat sini supaya ter-audit
router.put('/items/:id/status',
  authorize('equipment:update'),
  validate([
    idParam,
    body('status').notEmpty().withMessage('Status wajib diisi')
      .isIn(EQUIPMENT_STATUSES).withMessage(`status harus salah satu dari: ${EQUIPMENT_STATUSES.join(', ')}`),
    body('notes').optional({ nullable: true }).trim(),
    body('sourceType').optional({ nullable: true }).trim().isLength({ max: 80 }).withMessage('sourceType maksimal 80 karakter'),
    body('sourceId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('sourceId harus angka').toInt(),
  ]),
  controller.changeItemStatus);

router.get('/items/:id/status-logs',
  authorize('equipment:read'),
  validate([idParam, ...pageRules]),
  controller.listItemStatusLogs);

router.delete('/items/:id', authorize('equipment:delete'), validate([idParam]), controller.removeItem);

// ============================================================
// WORKHOUR LOGS
// ============================================================

// Role lapangan yang mencatat jam kerja alat di lokasi
router.post('/workhour-logs',
  authorize('workhour:create'),
  validate([
    body('equipmentItemId').isInt({ min: 1 }).withMessage('equipmentItemId wajib diisi dan harus angka').toInt(),
    body('workDate').notEmpty().withMessage('Tanggal kerja wajib diisi')
      .isISO8601().withMessage('workDate harus format tanggal YYYY-MM-DD'),
    body('startedAt').optional({ nullable: true }).isISO8601().withMessage('startedAt harus format tanggal-waktu ISO'),
    body('stoppedAt').optional({ nullable: true }).isISO8601().withMessage('stoppedAt harus format tanggal-waktu ISO'),
    body('totalWorkhour').notEmpty().withMessage('totalWorkhour wajib diisi')
      .isFloat({ gt: 0, max: 24 }).withMessage('totalWorkhour harus lebih dari 0 dan maksimal 24 jam').toFloat(),
    body('sourceType').notEmpty().withMessage('sourceType wajib diisi')
      .isIn(WORKHOUR_SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${WORKHOUR_SOURCE_TYPES.join(', ')}`),
    body('projectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('projectId harus angka').toInt(),
    body('subProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('subProjectId harus angka').toInt(),
    body('description').optional({ nullable: true }).trim(),
  ]),
  controller.createWorkhourLog);

router.get('/items/:itemId/workhour-logs',
  authorize('workhour:read'),
  validate([
    param('itemId').isInt({ min: 1 }).withMessage('ID alat tidak valid').toInt(),
    ...pageRules,
    query('startDate').optional().isISO8601().withMessage('startDate harus format tanggal YYYY-MM-DD'),
    query('endDate').optional().isISO8601().withMessage('endDate harus format tanggal YYYY-MM-DD'),
    query('sourceType').optional().isIn(WORKHOUR_SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${WORKHOUR_SOURCE_TYPES.join(', ')}`),
  ]),
  controller.listWorkhourLogsByItem);

module.exports = router;
