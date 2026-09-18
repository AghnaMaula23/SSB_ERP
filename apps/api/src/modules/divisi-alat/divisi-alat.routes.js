const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./divisi-alat.controller.js');
const maintenance = require('./maintenance.controller.js');
const damage = require('./damage.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const EQUIPMENT_STATUSES = ['operational', 'maintenance', 'retired'];
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

// ============================================================
// MAINTENANCE — Batch 2
// ============================================================

const MAINTENANCE_STATUSES = ['normal', 'warning', 'due', 'overdue', 'inactive'];
const MAINTENANCE_TYPES = ['routine', 'repair', 'replacement', 'inspection', 'adjustment'];
const RECORD_STATUSES = ['completed', 'cancelled'];

const itemIdParam = param('itemId').isInt({ min: 1 }).withMessage('ID alat tidak valid').toInt();

// --- Master aspek maintenance ---

router.get('/maintenance/aspects',
  authorize('maintenance:read'), validate(pageRules), maintenance.listAspects);

router.get('/maintenance/aspects/:id',
  authorize('maintenance:read'), validate([idParam]), maintenance.detailAspect);

router.post('/maintenance/aspects',
  authorize('maintenance:create'),
  validate([
    body('aspectCode').trim().notEmpty().withMessage('Kode aspek wajib diisi')
      .isLength({ max: 50 }).withMessage('Kode aspek maksimal 50 karakter')
      .matches(/^[A-Za-z0-9_-]+$/).withMessage('Kode aspek hanya boleh huruf, angka, underscore, dan strip'),
    body('aspectName').trim().notEmpty().withMessage('Nama aspek wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama aspek maksimal 150 karakter'),
    body('defaultThresholdValue').optional({ nullable: true })
      .isFloat({ gt: 0 }).withMessage('Threshold default harus lebih dari 0 jam').toFloat(),
    body('warningLeadValue').optional()
      .isFloat({ gt: 0 }).withMessage('Ambang peringatan harus lebih dari 0 jam').toFloat(),
    body('description').optional({ nullable: true }).trim(),
  ]),
  maintenance.createAspect);

router.put('/maintenance/aspects/:id',
  authorize('maintenance:update'),
  validate([
    idParam,
    body('aspectCode').not().exists().withMessage('Kode aspek tidak bisa diubah setelah dibuat'),
    body('aspectName').optional().trim().notEmpty().withMessage('Nama aspek tidak boleh kosong')
      .isLength({ max: 150 }).withMessage('Nama aspek maksimal 150 karakter'),
    body('defaultThresholdValue').optional({ nullable: true })
      .isFloat({ gt: 0 }).withMessage('Threshold default harus lebih dari 0 jam').toFloat(),
    body('warningLeadValue').optional()
      .isFloat({ gt: 0 }).withMessage('Ambang peringatan harus lebih dari 0 jam').toFloat(),
    body('description').optional({ nullable: true }).trim(),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  maintenance.updateAspect);

router.delete('/maintenance/aspects/:id',
  authorize('maintenance:delete'), validate([idParam]), maintenance.removeAspect);

// --- Setting maintenance per alat ---

const settingFilterRules = [
  ...pageRules,
  query('status').optional().isIn(MAINTENANCE_STATUSES)
    .withMessage(`status harus salah satu dari: ${MAINTENANCE_STATUSES.join(', ')}`),
];

// Dashboard lintas alat: mana saja yang sudah warning/due/overdue
router.get('/maintenance-settings',
  authorize('maintenance:read'),
  validate([
    ...settingFilterRules,
    query('equipmentItemId').optional().isInt({ min: 1 }).withMessage('equipmentItemId harus angka'),
  ]),
  maintenance.listSettings);

router.get('/maintenance-settings/:id',
  authorize('maintenance:read'), validate([idParam]), maintenance.detailSetting);

router.put('/maintenance-settings/:id',
  authorize('maintenance:update'),
  validate([
    idParam,
    body('thresholdValue').optional().isFloat({ gt: 0 }).withMessage('Threshold harus lebih dari 0 jam').toFloat(),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
    body('currentValueSinceReset').not().exists()
      .withMessage('Counter jam dikelola sistem dari workhour log dan reset maintenance'),
    body('status').not().exists().withMessage('Status dihitung sistem dari sisa jam, tidak bisa diisi manual'),
  ]),
  maintenance.updateSetting);

router.delete('/maintenance-settings/:id',
  authorize('maintenance:delete'), validate([idParam]), maintenance.removeSetting);

router.get('/items/:itemId/maintenance-settings',
  authorize('maintenance:read'),
  validate([itemIdParam, ...settingFilterRules]),
  maintenance.listSettingsByItem);

router.post('/items/:itemId/maintenance-settings',
  authorize('maintenance:create'),
  validate([
    itemIdParam,
    body('maintenanceAspectId').isInt({ min: 1 })
      .withMessage('maintenanceAspectId wajib diisi dan harus angka').toInt(),
    body('thresholdValue').optional()
      .isFloat({ gt: 0 }).withMessage('Threshold harus lebih dari 0 jam').toFloat(),
  ]),
  maintenance.createSetting);

// --- Riwayat tindakan maintenance ---

const recordFilterRules = [
  ...pageRules,
  query('maintenanceType').optional().isIn(MAINTENANCE_TYPES)
    .withMessage(`maintenanceType harus salah satu dari: ${MAINTENANCE_TYPES.join(', ')}`),
  query('status').optional().isIn(RECORD_STATUSES)
    .withMessage(`status harus salah satu dari: ${RECORD_STATUSES.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate harus format tanggal YYYY-MM-DD'),
  query('endDate').optional().isISO8601().withMessage('endDate harus format tanggal YYYY-MM-DD'),
];

router.get('/maintenance-records',
  authorize('maintenance:read'),
  validate([
    ...recordFilterRules,
    query('equipmentItemId').optional().isInt({ min: 1 }).withMessage('equipmentItemId harus angka'),
  ]),
  maintenance.listRecords);

router.get('/maintenance-records/:id',
  authorize('maintenance:read'), validate([idParam]), maintenance.detailRecord);

router.post('/maintenance-records',
  authorize('maintenance:create'),
  validate([
    body('equipmentItemId').isInt({ min: 1 }).withMessage('equipmentItemId wajib diisi dan harus angka').toInt(),
    body('maintenanceSettingId').optional({ nullable: true })
      .isInt({ min: 1 }).withMessage('maintenanceSettingId harus angka').toInt(),
    body('damageLogId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('damageLogId harus angka').toInt(),
    body('purchaseRequestItemId').optional({ nullable: true })
      .isInt({ min: 1 }).withMessage('purchaseRequestItemId harus angka').toInt(),
    body('maintenanceType').notEmpty().withMessage('maintenanceType wajib diisi')
      .isIn(MAINTENANCE_TYPES).withMessage(`maintenanceType harus salah satu dari: ${MAINTENANCE_TYPES.join(', ')}`),
    body('maintenanceDate').notEmpty().withMessage('Tanggal maintenance wajib diisi')
      .isISO8601().withMessage('maintenanceDate harus format tanggal YYYY-MM-DD'),
    body('workhourAtMaintenance').optional({ nullable: true })
      .isFloat({ min: 0 }).withMessage('workhourAtMaintenance tidak boleh negatif').toFloat(),
    body('actionDescription').trim().notEmpty().withMessage('Deskripsi tindakan wajib diisi'),
    body('performedBy').optional({ nullable: true }).trim()
      .isLength({ max: 150 }).withMessage('Nama pelaksana maksimal 150 karakter'),
    body('maintenanceCode').not().exists().withMessage('Nomor maintenance dibuat otomatis oleh sistem'),
  ]),
  maintenance.createRecord);

router.get('/items/:itemId/maintenance-records',
  authorize('maintenance:read'),
  validate([itemIdParam, ...recordFilterRules]),
  maintenance.listRecordsByItem);

router.put('/maintenance-records/:id/cancel',
  authorize('maintenance:update'),
  validate([idParam, body('notes').optional({ nullable: true }).trim()]),
  maintenance.cancelRecord);

// ============================================================
// DAMAGE LOGS — Batch 3
// Dicatat dan dikelola sendiri oleh Divisi Alat. Laporan dari Lapangan masuk
// di luar sistem (telepon), jadi belum ada jalur lapor untuk role lapangan.
// ============================================================

const DAMAGE_STATUSES = ['reported', 'resolved', 'cancelled'];
const SPARE_PART_SOURCES = ['warehouse', 'supplier'];
const MECHANIC_TEAMS = ['internal', 'external'];

const damageFilterRules = [
  ...pageRules,
  query('status').optional().isIn(DAMAGE_STATUSES)
    .withMessage(`status harus salah satu dari: ${DAMAGE_STATUSES.join(', ')}`),
  query('stopsOperation').optional().isBoolean().withMessage('stopsOperation harus boolean'),
  query('sparePartSource').optional().isIn(SPARE_PART_SOURCES)
    .withMessage(`sparePartSource harus salah satu dari: ${SPARE_PART_SOURCES.join(', ')}`),
  query('mechanicTeam').optional().isIn(MECHANIC_TEAMS)
    .withMessage(`mechanicTeam harus salah satu dari: ${MECHANIC_TEAMS.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate harus format tanggal YYYY-MM-DD'),
  query('endDate').optional().isISO8601().withMessage('endDate harus format tanggal YYYY-MM-DD'),
];

router.get('/damage-logs',
  authorize('damage:read'),
  validate([
    ...damageFilterRules,
    query('equipmentItemId').optional().isInt({ min: 1 }).withMessage('equipmentItemId harus angka'),
  ]),
  damage.list);

router.get('/damage-logs/:id', authorize('damage:read'), validate([idParam]), damage.detail);

router.get('/items/:itemId/damage-logs',
  authorize('damage:read'),
  validate([itemIdParam, ...damageFilterRules]),
  damage.listByItem);

router.post('/damage-logs',
  authorize('damage:create'),
  validate([
    body('equipmentItemId').isInt({ min: 1 }).withMessage('equipmentItemId wajib diisi dan harus angka').toInt(),
    body('damageDate').notEmpty().withMessage('Tanggal kerusakan wajib diisi')
      .isISO8601().withMessage('damageDate harus format tanggal YYYY-MM-DD'),
    body('description').trim().notEmpty().withMessage('Deskripsi kerusakan wajib diisi'),
    // Wajib di API meski nullable di database — pelonggarannya nanti saat
    // Lapangan boleh melapor sendiri dan belum tahu jawabannya.
    body('sparePartSource').notEmpty().withMessage('Sumber sparepart wajib dipilih')
      .isIn(SPARE_PART_SOURCES).withMessage(`sparePartSource harus salah satu dari: ${SPARE_PART_SOURCES.join(', ')}`),
    body('mechanicTeam').notEmpty().withMessage('Tim mekanik wajib dipilih')
      .isIn(MECHANIC_TEAMS).withMessage(`mechanicTeam harus salah satu dari: ${MECHANIC_TEAMS.join(', ')}`),
    body('stopsOperation').optional().isBoolean().withMessage('stopsOperation harus boolean').toBoolean(),
    body('projectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('projectId harus angka').toInt(),
    body('subProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('subProjectId harus angka').toInt(),
    body('damageCode').not().exists().withMessage('Nomor laporan dibuat otomatis oleh sistem'),
    body('status').not().exists().withMessage('Status laporan dikelola sistem lewat aksi selesai/batal'),
  ]),
  damage.create);

router.put('/damage-logs/:id',
  authorize('damage:update'),
  validate([
    idParam,
    body('description').optional().trim().notEmpty().withMessage('Deskripsi kerusakan tidak boleh kosong'),
    body('damageDate').optional().isISO8601().withMessage('damageDate harus format tanggal YYYY-MM-DD'),
    body('sparePartSource').optional().isIn(SPARE_PART_SOURCES)
      .withMessage(`sparePartSource harus salah satu dari: ${SPARE_PART_SOURCES.join(', ')}`),
    body('mechanicTeam').optional().isIn(MECHANIC_TEAMS)
      .withMessage(`mechanicTeam harus salah satu dari: ${MECHANIC_TEAMS.join(', ')}`),
    body('stopsOperation').optional().isBoolean().withMessage('stopsOperation harus boolean').toBoolean(),
    body('status').not().exists().withMessage('Status laporan dikelola sistem lewat aksi selesai/batal'),
  ]),
  damage.update);

// Menyelesaikan kerusakan WAJIB mengisi tindakan — hasilnya satu maintenance record
router.put('/damage-logs/:id/resolve',
  authorize('damage:update'),
  validate([
    idParam,
    body('maintenanceType').notEmpty().withMessage('Jenis tindakan wajib dipilih')
      .isIn(MAINTENANCE_TYPES).withMessage(`maintenanceType harus salah satu dari: ${MAINTENANCE_TYPES.join(', ')}`),
    body('actionDescription').trim().notEmpty().withMessage('Deskripsi tindakan wajib diisi'),
    body('performedBy').optional({ nullable: true }).trim()
      .isLength({ max: 150 }).withMessage('Nama pelaksana maksimal 150 karakter'),
    body('maintenanceDate').optional().isISO8601().withMessage('maintenanceDate harus format tanggal YYYY-MM-DD'),
    body('maintenanceSettingId').optional({ nullable: true })
      .isInt({ min: 1 }).withMessage('maintenanceSettingId harus angka').toInt(),
  ]),
  damage.resolve);

router.put('/damage-logs/:id/cancel',
  authorize('damage:update'),
  validate([idParam, body('notes').optional({ nullable: true }).trim()]),
  damage.cancel);

module.exports = router;
