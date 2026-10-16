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
const WORK_SESSIONS = ['pagi', 'siang', 'overtime'];
// Kolom pembatalan hanya diisi lewat PUT /workhour-logs/:id/void
const VOID_FIELDS_REJECTED = ['isVoided', 'voidReason', 'voidedBy', 'voidedAt'].map((f) =>
  body(f).not().exists().withMessage(`${f} dikelola sistem — batalkan log lewat PUT /workhour-logs/:id/void`));

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

// assetCode SELALU dibuat sistem (SSB-{typeCode}-{NNN}) — ditolak kalau dikirim.
// Override manual untuk migrasi dibuang 15 Okt 2026 (lewat skrip impor).
const assetCodeOverrideRule = body('assetCode').not().exists()
  .withMessage('Kode aset dibuat otomatis oleh sistem dan tidak bisa diisi manual');

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
    // equipmentItemId HANYA untuk manual_adjustment. Untuk internal_project dan
    // external_rental dia diturunkan sistem dari alokasi/pool item — service
    // menolak kalau dikirim dan tidak cocok. Di sini cuma dicek bentuknya,
    // kebijakannya hidup di satu tempat (service).
    body('equipmentItemId').optional({ nullable: true }).isInt({ min: 1 })
      .withMessage('equipmentItemId harus angka').toInt(),
    body('subProjectEquipmentAllocationId').optional({ nullable: true }).isInt({ min: 1 })
      .withMessage('subProjectEquipmentAllocationId harus angka').toInt(),
    body('equipmentPoolItemId').optional({ nullable: true }).isInt({ min: 1 })
      .withMessage('equipmentPoolItemId harus angka').toInt(),
    body('workDate').notEmpty().withMessage('Tanggal kerja wajib diisi')
      .isISO8601().withMessage('workDate harus format tanggal YYYY-MM-DD'),
    body('startedAt').optional({ nullable: true }).isISO8601().withMessage('startedAt harus format tanggal-waktu ISO'),
    body('stoppedAt').optional({ nullable: true }).isISO8601().withMessage('stoppedAt harus format tanggal-waktu ISO'),
    body('pausedDurationMinutes').optional().isInt({ min: 0 })
      .withMessage('pausedDurationMinutes tidak boleh negatif').toInt(),
    body('totalWorkhour').notEmpty().withMessage('totalWorkhour wajib diisi')
      .isFloat({ gt: 0, max: 24 }).withMessage('totalWorkhour harus lebih dari 0 dan maksimal 24 jam').toFloat(),
    body('sourceType').notEmpty().withMessage('sourceType wajib diisi')
      .isIn(WORKHOUR_SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${WORKHOUR_SOURCE_TYPES.join(', ')}`),
    // Kolom lama sudah dibuang dari tabel (migrasi contract P4). Ditolak terbuka
    // supaya klien lama tahu kontraknya berubah, bukan datanya diam-diam hilang.
    body('projectId').not().exists()
      .withMessage('projectId sudah tidak dipakai — kirim subProjectEquipmentAllocationId untuk internal_project'),
    body('subProjectId').not().exists()
      .withMessage('subProjectId sudah tidak dipakai — kirim subProjectEquipmentAllocationId untuk internal_project'),
    // Sesi hanya untuk external_rental (service & CHECK database). Opsional
    // sampai FE rental pindah ke /workhour-logs/rental-sheet (backlog-fe).
    body('workSession').optional({ nullable: true }).isIn(WORK_SESSIONS)
      .withMessage(`workSession harus salah satu dari: ${WORK_SESSIONS.join(', ')}`),
    body('description').optional({ nullable: true }).trim(),
    ...VOID_FIELDS_REJECTED,
  ]),
  controller.createWorkhourLog);

// Timesheet rental satu unit satu tanggal: semua sesi masuk dalam satu transaksi.
// totalWorkhour dihitung sistem dari jam mulai/selesai dikurangi jeda.
router.post('/workhour-logs/rental-sheet',
  authorize('workhour:create'),
  validate([
    body('equipmentPoolItemId').isInt({ min: 1 }).withMessage('equipmentPoolItemId wajib diisi').toInt(),
    body('workDate').notEmpty().withMessage('Tanggal kerja wajib diisi')
      .isISO8601().withMessage('workDate harus format tanggal YYYY-MM-DD'),
    body('sessions').isArray({ min: 1, max: WORK_SESSIONS.length })
      .withMessage(`sessions wajib berisi 1–${WORK_SESSIONS.length} sesi`),
    body('sessions.*.workSession').isIn(WORK_SESSIONS)
      .withMessage(`workSession harus salah satu dari: ${WORK_SESSIONS.join(', ')}`),
    body('sessions.*.startedAt').isISO8601().withMessage('startedAt wajib, format tanggal-waktu ISO'),
    body('sessions.*.stoppedAt').isISO8601().withMessage('stoppedAt wajib, format tanggal-waktu ISO'),
    body('sessions.*.pausedDurationMinutes').optional().isInt({ min: 0 })
      .withMessage('pausedDurationMinutes tidak boleh negatif').toInt(),
    body('sessions.*.totalWorkhour').not().exists()
      .withMessage('totalWorkhour dihitung sistem dari jam mulai/selesai — jangan dikirim'),
    body('sessions.*.description').optional({ nullable: true }).trim(),
  ]),
  controller.createRentalSheet);

// Log tidak pernah diubah: salah input dibatalkan, lalu dicatat ulang
router.put('/workhour-logs/:id/void',
  authorize('workhour:update'),
  validate([
    idParam,
    body('reason').trim().notEmpty().withMessage('Alasan pembatalan wajib diisi'),
  ]),
  controller.voidWorkhourLog);

router.get('/items/:itemId/workhour-logs',
  authorize('workhour:read'),
  validate([
    param('itemId').isInt({ min: 1 }).withMessage('ID alat tidak valid').toInt(),
    ...pageRules,
    query('startDate').optional().isISO8601().withMessage('startDate harus format tanggal YYYY-MM-DD'),
    query('endDate').optional().isISO8601().withMessage('endDate harus format tanggal YYYY-MM-DD'),
    query('sourceType').optional().isIn(WORKHOUR_SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${WORKHOUR_SOURCE_TYPES.join(', ')}`),
    query('includeVoided').optional().isIn(['true', 'false']).withMessage('includeVoided harus true atau false'),
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

// Ambang servis kini per JENIS alat × aspek (16 Okt 2026) — default per aspek dibuang
const noDefaultThreshold = body('defaultThresholdValue').not().exists()
  .withMessage('Ambang servis diatur per jenis alat lewat /equipment/types/:typeId/maintenance-thresholds/:aspectId');

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
    noDefaultThreshold,
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
    noDefaultThreshold,
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
    body('thresholdValue').not().exists()
      .withMessage('Ambang mengikuti jenis alat — ubah lewat /equipment/types/:typeId/maintenance-thresholds/:aspectId'),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
    body('currentValueSinceReset').not().exists()
      .withMessage('Counter jam dikelola sistem dari workhour log dan reset maintenance'),
    body('status').not().exists().withMessage('Status dihitung sistem dari sisa jam, tidak bisa diisi manual'),
  ]),
  maintenance.updateSetting);

router.get('/items/:itemId/maintenance-settings',
  authorize('maintenance:read'),
  validate([itemIdParam, ...settingFilterRules]),
  maintenance.listSettingsByItem);

// Setting per unit TIDAK dibuat/dihapus manual lagi: lahir otomatis dari ambang
// jenis alat (saat unit didaftarkan, berganti jenis, atau ambang ditambahkan).

// --- Ambang servis per jenis alat × aspek ---
// Dipakai layar ambang Divisi Alat (MaintenanceThresholdPage).

const thresholdParams = [
  param('typeId').isInt({ min: 1 }).withMessage('ID jenis alat tidak valid').toInt(),
  param('aspectId').isInt({ min: 1 }).withMessage('ID aspek tidak valid').toInt(),
];

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
router.get('/maintenance-thresholds',
  authorize('maintenance:read'),
  validate([query('equipmentTypeId').optional().isInt({ min: 1 }).withMessage('equipmentTypeId harus angka')]),
  maintenance.listTypeThresholds);

// Tambah atau ubah (upsert) — diterapkan ke semua unit jenis itu di transaksi yang sama
router.put('/types/:typeId/maintenance-thresholds/:aspectId',
  authorize('maintenance:update'),
  validate([...thresholdParams,
    body('thresholdValue').isFloat({ gt: 0, max: 9999999999 }).withMessage('thresholdValue wajib, lebih dari 0 jam').toFloat()]),
  maintenance.upsertTypeThreshold);

router.delete('/types/:typeId/maintenance-thresholds/:aspectId',
  authorize('maintenance:update'), validate(thresholdParams), maintenance.removeTypeThreshold);

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
    body('purchaseRequestId').optional({ nullable: true })
      .isInt({ min: 1 }).withMessage('purchaseRequestId harus angka').toInt(),
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
    // Menyelesaikan kerusakan TIDAK boleh mereset jadwal servis: reset perawatan
    // rutin adalah aksi manual terpisah, dan aspek perawatan tidak bisa menumpang
    // order perbaikan karena kategori ordernya berbeda.
    body('maintenanceSettingId').not().exists()
      .withMessage('Reset jadwal servis dilakukan terpisah di halaman Maintenance, bukan lewat penyelesaian kerusakan'),
  ]),
  damage.resolve);

router.put('/damage-logs/:id/cancel',
  authorize('damage:update'),
  validate([idParam, body('notes').optional({ nullable: true }).trim()]),
  damage.cancel);

module.exports = router;
