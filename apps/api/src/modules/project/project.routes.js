const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('./project.controller.js');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');

const router = Router();

router.use(authenticate);

const PROJECT_STATUSES = ['planned', 'active', 'completed', 'cancelled'];
const SUB_PROJECT_TYPES = ['galian', 'timbunan', 'line_clearing', 'aspal'];
const SUB_PROJECT_STATUSES = ['planned', 'active', 'completed', 'cancelled'];
const PROGRESS_STATUSES = ['submitted', 'validated', 'rejected'];
const BILLING_METHODS = ['hourly', 'daily', 'monthly', 'contract'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const projectIdParam = param('projectId').isInt({ min: 1 }).withMessage('projectId tidak valid').toInt();
const subProjectIdParam = param('subProjectId').isInt({ min: 1 }).withMessage('subProjectId tidak valid').toInt();

// TANPA .toInt() — sanitizer itu tidak berfungsi pada req.query di Express 5
// dan hanya menyesatkan pembaca. Konversinya di controller (utils/query.js).
// Validator di sini murni MEMERIKSA bentuknya, tidak mengubah apa pun.
const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];

const statusBodyRule = (allowed) =>
  body('status').isIn(allowed).withMessage(`status harus salah satu dari: ${allowed.join(', ')}`);

/**
 * Kolom yang dibuat sistem. Ditolak dengan 400 kalau dikirim klien daripada
 * diterima lalu dibuang diam-diam — pengirimnya harus tahu nilainya tidak dipakai.
 * Kode project TIDAK termasuk: super_admin boleh mengirimnya untuk migrasi data
 * lama, dan siapa yang boleh diputuskan di service (403 kalau bukan super_admin).
 */
const rejectSystemManaged = (...fields) =>
  fields.map((f) =>
    body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

// ============================================================
// PROJECT HEADERS — tiga tipe berbagi satu set handler
// ============================================================

// Tipe project ditentukan di sini, bukan dibaca dari URL di controller, supaya
// nilai yang tidak dikenal tidak pernah punya rute.
const withKind = (kind) => (req, res, next) => { req.projectKind = kind; next(); };

const commonProjectRules = [
  body('clientName').optional({ nullable: true }).trim().isLength({ max: 255 })
    .withMessage('Nama klien maksimal 255 karakter'),
  body('location').optional({ nullable: true }).trim(),
  ...rejectSystemManaged('status', 'createdBy'),
];

const constructionRules = [
  body('startDate').optional({ nullable: true }).isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  body('endDate').optional({ nullable: true }).isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
];

const contractRules = [
  body('contractNo').optional({ nullable: true }).trim().isLength({ max: 100 })
    .withMessage('Nomor kontrak maksimal 100 karakter'),
  body('contractStartDate').optional({ nullable: true }).isISO8601().withMessage('contractStartDate harus tanggal ISO'),
  body('contractEndDate').optional({ nullable: true }).isISO8601().withMessage('contractEndDate harus tanggal ISO'),
];

const nameRule = (field, label) =>
  body(field).trim().notEmpty().withMessage(`${label} wajib diisi`)
    .isLength({ max: 255 }).withMessage(`${label} maksimal 255 karakter`);

const optionalNameRule = (field, label) =>
  body(field).optional().trim().notEmpty().withMessage(`${label} tidak boleh kosong`)
    .isLength({ max: 255 }).withMessage(`${label} maksimal 255 karakter`);

const codeOverrideRule = (field) =>
  body(field).optional().trim().notEmpty().withMessage('Kode project tidak boleh string kosong')
    .isLength({ max: 50 }).withMessage('Kode project maksimal 50 karakter');

/**
 * Daftarkan CRUD satu tipe project. Menambah tipe project baru = satu panggilan
 * di sini, bukan menyalin lima rute.
 */
const mountProjectType = (path, kind, { createRules, updateRules }) => {
  const base = `/${path}`;
  const kindMiddleware = withKind(kind);

  router.get(base, authorize('project:read'), kindMiddleware,
    validate([
      ...pageRules,
      query('status').optional().isIn(PROJECT_STATUSES).withMessage(`status harus salah satu dari: ${PROJECT_STATUSES.join(', ')}`),
    ]),
    controller.listProjects);

  router.get(`${base}/:id`, authorize('project:read'), kindMiddleware,
    validate([idParam]), controller.detailProject);

  router.post(base, authorize('project:create'), kindMiddleware,
    validate(createRules), controller.createProject);

  router.put(`${base}/:id`, authorize('project:update'), kindMiddleware,
    validate([idParam, ...updateRules]), controller.updateProject);

  // Status diubah lewat endpoint sendiri, bukan lewat PUT — supaya perubahan
  // status tidak pernah terjadi sebagai efek samping edit data biasa.
  router.put(`${base}/:id/status`, authorize('project:update'), kindMiddleware,
    validate([idParam, statusBodyRule(PROJECT_STATUSES)]), controller.changeProjectStatus);
};

mountProjectType('construction', 'construction', {
  createRules: [nameRule('projectName', 'Nama project'), codeOverrideRule('projectCode'),
    ...commonProjectRules, ...constructionRules],
  updateRules: [optionalNameRule('projectName', 'Nama project'),
    ...commonProjectRules, ...constructionRules],
});

mountProjectType('external-rental', 'external-rental', {
  createRules: [nameRule('rentalProjectName', 'Nama rental project'), codeOverrideRule('rentalProjectCode'),
    ...commonProjectRules, ...contractRules,
    body('billingMethod').optional({ nullable: true }).isIn(BILLING_METHODS)
      .withMessage(`billingMethod harus salah satu dari: ${BILLING_METHODS.join(', ')}`)],
  updateRules: [optionalNameRule('rentalProjectName', 'Nama rental project'),
    ...commonProjectRules, ...contractRules,
    body('billingMethod').optional({ nullable: true }).isIn(BILLING_METHODS)
      .withMessage(`billingMethod harus salah satu dari: ${BILLING_METHODS.join(', ')}`)],
});

// PIC Lapangan yang membuat request material untuk kontrak ini. null = belum ditentukan.
const fieldPicRule = body('fieldPicId').optional({ nullable: true }).isInt({ min: 1 })
  .withMessage('fieldPicId harus ID user').toInt();

mountProjectType('external-supply', 'external-supply', {
  createRules: [nameRule('supplyProjectName', 'Nama supply project'), codeOverrideRule('supplyProjectCode'),
    ...commonProjectRules, ...contractRules, fieldPicRule],
  updateRules: [optionalNameRule('supplyProjectName', 'Nama supply project'),
    ...commonProjectRules, ...contractRules, fieldPicRule],
});

// ============================================================
// SUB-PROJECTS — /api/projects/construction/:projectId/sub-projects
// ============================================================

const SUB = '/construction/:projectId/sub-projects';

// Kontrak dan target volume. Keduanya dasar tagihan, jadi divalidasi ketat.
const subProjectContractRules = [
  body('targetVolume').isFloat({ gt: 0 }).withMessage('targetVolume wajib diisi dan harus lebih dari 0').toFloat(),
  body('volumeUnit').trim().notEmpty().withMessage('volumeUnit wajib diisi (mis. m3, m2, km)')
    .isLength({ max: 30 }).withMessage('volumeUnit maksimal 30 karakter'),
  body('contractValue').optional().isFloat({ min: 0 }).withMessage('contractValue tidak boleh negatif').toFloat(),
  body('dailyTargetVolume').optional({ nullable: true }).isFloat({ gt: 0 })
    .withMessage('dailyTargetVolume harus lebih dari 0').toFloat(),
  body('sequenceOrder').optional().isInt({ min: 1, max: 4 })
    .withMessage('sequenceOrder harus 1-4 (galian, timbunan, line_clearing, aspal)').toInt(),
  body('contractNo').optional({ nullable: true }).trim().isLength({ max: 100 })
    .withMessage('Nomor kontrak maksimal 100 karakter'),
  body('contractDate').optional({ nullable: true }).isISO8601().withMessage('contractDate harus tanggal ISO'),
  body('contractStartDate').optional({ nullable: true }).isISO8601().withMessage('contractStartDate harus tanggal ISO'),
  body('contractEndDate').optional({ nullable: true }).isISO8601().withMessage('contractEndDate harus tanggal ISO'),
  ...rejectSystemManaged('status', 'createdBy', 'constructionProjectId'),
];

router.get(SUB, authorize('sub-project:read'),
  validate([projectIdParam,
    query('status').optional().isIn(SUB_PROJECT_STATUSES).withMessage(`status harus salah satu dari: ${SUB_PROJECT_STATUSES.join(', ')}`)]),
  controller.listSubProjects);

router.get(`${SUB}/:id`, authorize('sub-project:read'),
  validate([projectIdParam, idParam]), controller.detailSubProject);

router.get('/construction/:projectId/sub-projects/:subProjectId/progress', authorize('sub-project:read'),
  validate([projectIdParam, subProjectIdParam]), controller.subProjectProgress);

router.post(SUB, authorize('sub-project:create'),
  validate([projectIdParam,
    body('subProjectType').isIn(SUB_PROJECT_TYPES)
      .withMessage(`subProjectType harus salah satu dari: ${SUB_PROJECT_TYPES.join(', ')}`),
    ...subProjectContractRules]),
  controller.createSubProject);

router.put(`${SUB}/:id`, authorize('sub-project:update'),
  validate([projectIdParam, idParam,
    // Tipe tahapan immutable — dia bagian dari identitas unique-nya bersama project
    body('subProjectType').not().exists()
      .withMessage('subProjectType tidak bisa diubah. Batalkan tahapan ini dan buat yang baru.'),
    body('targetVolume').optional().isFloat({ gt: 0 }).withMessage('targetVolume harus lebih dari 0').toFloat(),
    body('volumeUnit').optional().trim().notEmpty().withMessage('volumeUnit tidak boleh kosong')
      .isLength({ max: 30 }).withMessage('volumeUnit maksimal 30 karakter'),
    ...subProjectContractRules.slice(2)]),
  controller.updateSubProject);

router.put(`${SUB}/:id/status`, authorize('sub-project:update'),
  validate([projectIdParam, idParam, statusBodyRule(SUB_PROJECT_STATUSES)]),
  controller.changeSubProjectStatus);

// ============================================================
// DAILY PROGRESS — /api/projects/sub-projects/:subProjectId/progress-logs
// ============================================================
// Tidak bersarang di bawah /construction/:projectId: lapangan mengakses lewat
// tahapan yang sedang mereka kerjakan, dan sub-project id sudah unik global.

// Detail tahapan lewat id-nya sendiri. Didaftarkan di sini (bukan di bawah
// /construction/:projectId) karena id sub-project sudah unik global — klien
// yang datang dari tautan langsung tidak selalu memegang project id-nya.
router.get('/sub-projects/:id', authorize('sub-project:read'),
  validate([idParam]), controller.detailSubProjectDirect);

const LOGS = '/sub-projects/:subProjectId/progress-logs';

const fieldConditionRules = [
  body('fieldCondition').optional().isObject().withMessage('fieldCondition harus objek'),
  body('fieldCondition.weatherMorning').optional({ nullable: true }).trim().isLength({ max: 50 })
    .withMessage('weatherMorning maksimal 50 karakter'),
  body('fieldCondition.weatherAfternoon').optional({ nullable: true }).trim().isLength({ max: 50 })
    .withMessage('weatherAfternoon maksimal 50 karakter'),
  body('fieldCondition.fieldConditionNotes').optional({ nullable: true }).trim(),
  body('fieldCondition.incidentNotes').optional({ nullable: true }).trim(),
];

router.get(LOGS, authorize('progress:read'),
  validate([subProjectIdParam, ...pageRules,
    query('status').optional().isIn(PROGRESS_STATUSES).withMessage(`status harus salah satu dari: ${PROGRESS_STATUSES.join(', ')}`),
    query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO'),
    query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO')]),
  controller.listProgressLogs);

router.get(`${LOGS}/:id`, authorize('progress:read'),
  validate([subProjectIdParam, idParam]), controller.detailProgressLog);

router.post(LOGS, authorize('progress:create'),
  validate([subProjectIdParam,
    body('progressDate').isISO8601().withMessage('progressDate wajib diisi dan harus tanggal ISO (YYYY-MM-DD)'),
    body('realizedVolume').isFloat({ min: 0 }).withMessage('realizedVolume wajib diisi dan tidak boleh negatif').toFloat(),
    body('notes').optional({ nullable: true }).trim(),
    ...fieldConditionRules,
    ...rejectSystemManaged('status', 'validatedBy', 'validatedAt', 'createdBy')]),
  controller.createProgressLog);

router.put(`${LOGS}/:id`, authorize('progress:create'),
  validate([subProjectIdParam, idParam,
    // Tanggal immutable — dia identitas unique-nya bersama sub-project. Salah
    // tanggal berarti barisnya salah, bukan tanggalnya perlu digeser.
    body('progressDate').not().exists()
      .withMessage('progressDate tidak bisa diubah. Catatan ini milik tanggal tersebut.'),
    body('realizedVolume').optional().isFloat({ min: 0 }).withMessage('realizedVolume tidak boleh negatif').toFloat(),
    body('notes').optional({ nullable: true }).trim(),
    ...fieldConditionRules,
    ...rejectSystemManaged('status', 'validatedBy', 'validatedAt')]),
  controller.updateProgressLog);

/**
 * Gerbang validasi Admin — inilah yang memisahkan catatan lapangan dari angka
 * yang boleh menagih klien. Permission `progress:validate` TIDAK diberikan ke
 * role lapangan: pencatat tidak boleh memvalidasi catatannya sendiri.
 *
 * `notes` DITOLAK: alasan penolakan menunggu Approval Center (keputusan B1 pada
 * purchase request). Ditolak terbuka daripada diterima lalu dibuang diam-diam.
 */
router.put(`${LOGS}/:id/validate`, authorize('progress:validate'),
  validate([subProjectIdParam, idParam, statusBodyRule(PROGRESS_STATUSES),
    body('notes').not().exists().withMessage(
      'Alasan validasi/penolakan belum bisa disimpan — menunggu modul Approval Center. ' +
      'Sampaikan alasannya di luar sistem dulu.')]),
  controller.validateProgressLog);

// ============================================================
// EQUIPMENT POOL — /api/projects/equipment-pools
// ============================================================

const OWNER_TYPES = ['construction_project', 'external_rental_project'];
const POOL_STATUSES = ['draft', 'active', 'closed', 'cancelled'];
const POOL_ITEM_STATUSES = ['pending', 'available', 'assigned', 'completed', 'rejected', 'cancelled'];
const ALLOCATION_STATUSES = ['assigned', 'completed', 'returned', 'cancelled'];

const poolIdParam = param('id').isInt({ min: 1 }).withMessage('id tidak valid').toInt();
const poolItemIdParam = param('itemId').isInt({ min: 1 }).withMessage('itemId tidak valid').toInt();

router.get('/equipment-pools', authorize('equipment-pool:read'),
  validate([...pageRules,
    query('ownerType').optional().isIn(OWNER_TYPES).withMessage(`ownerType harus salah satu dari: ${OWNER_TYPES.join(', ')}`),
    query('constructionProjectId').optional().isInt({ min: 1 }).withMessage('constructionProjectId harus angka'),
    query('externalRentalProjectId').optional().isInt({ min: 1 }).withMessage('externalRentalProjectId harus angka'),
    query('status').optional().isIn(POOL_STATUSES).withMessage(`status harus salah satu dari: ${POOL_STATUSES.join(', ')}`)]),
  controller.listPools);

router.get('/equipment-pools/:id', authorize('equipment-pool:read'),
  validate([poolIdParam]), controller.detailPool);

router.post('/equipment-pools', authorize('equipment-pool:create'),
  validate([
    body('ownerType').isIn(OWNER_TYPES).withMessage(`ownerType wajib diisi, salah satu dari: ${OWNER_TYPES.join(', ')}`),
    body('constructionProjectId').optional().isInt({ min: 1 }).toInt(),
    body('externalRentalProjectId').optional().isInt({ min: 1 }).toInt(),
    ...rejectSystemManaged('poolCode', 'status', 'createdBy')]),
  controller.createPool);

router.put('/equipment-pools/:id/status', authorize('equipment-pool:update'),
  validate([poolIdParam, statusBodyRule(POOL_STATUSES)]), controller.changePoolStatus);

router.post('/equipment-pools/:id/items', authorize('equipment-pool:update'),
  validate([poolIdParam,
    body('equipmentTypeId').isInt({ min: 1 }).withMessage('equipmentTypeId wajib diisi').toInt(),
    body('equipmentItemId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('equipmentItemId harus angka').toInt(),
    body('requestedQuantity').optional().isInt({ min: 1 }).withMessage('requestedQuantity minimal 1').toInt(),
    ...rejectSystemManaged('approvedQuantity', 'status')]),
  controller.addPoolItem);

router.put('/equipment-pools/:id/items/:itemId/bind-unit', authorize('equipment-pool:update'),
  validate([poolIdParam, poolItemIdParam,
    body('equipmentItemId').isInt({ min: 1 }).withMessage('equipmentItemId wajib diisi').toInt()]),
  controller.bindPoolItemUnit);

router.put('/equipment-pools/:id/items/:itemId/close', authorize('equipment-pool:update'),
  validate([poolIdParam, poolItemIdParam,
    body('status').isIn(['completed', 'cancelled']).withMessage('status harus "completed" atau "cancelled"')]),
  controller.closePoolItem);

// ============================================================
// MATERIAL POOL — /api/projects/material-pools (Request Material RM-1)
// ============================================================

const MATERIAL_OWNER_TYPES = ['construction_project', 'external_supply_project'];

router.get('/material-pools', authorize('material-pool:read'),
  validate([...pageRules,
    query('ownerType').optional().isIn(MATERIAL_OWNER_TYPES).withMessage(`ownerType harus salah satu dari: ${MATERIAL_OWNER_TYPES.join(', ')}`),
    query('constructionProjectId').optional().isInt({ min: 1 }).withMessage('constructionProjectId harus angka'),
    query('externalSupplyProjectId').optional().isInt({ min: 1 }).withMessage('externalSupplyProjectId harus angka'),
    query('status').optional().isIn(POOL_STATUSES).withMessage(`status harus salah satu dari: ${POOL_STATUSES.join(', ')}`)]),
  controller.listMaterialPools);

router.get('/material-pools/:id', authorize('material-pool:read'),
  validate([poolIdParam]), controller.detailMaterialPool);

router.post('/material-pools', authorize('material-pool:create'),
  validate([
    body('ownerType').isIn(MATERIAL_OWNER_TYPES).withMessage(`ownerType wajib diisi, salah satu dari: ${MATERIAL_OWNER_TYPES.join(', ')}`),
    body('constructionProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('constructionProjectId harus angka').toInt(),
    body('externalSupplyProjectId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('externalSupplyProjectId harus angka').toInt(),
    ...rejectSystemManaged('poolCode', 'status', 'createdBy')]),
  controller.createMaterialPool);

router.put('/material-pools/:id/status', authorize('material-pool:update'),
  validate([poolIdParam, statusBodyRule(POOL_STATUSES)]), controller.changeMaterialPoolStatus);

// Satuan TIDAK diterima di sini: satuan milik jenis material (keputusan D1).
router.post('/material-pools/:id/items', authorize('material-pool:update'),
  validate([poolIdParam,
    body('materialTypeId').isInt({ min: 1 }).withMessage('materialTypeId wajib diisi').toInt(),
    body('notes').optional({ nullable: true }).isString().trim(),
    body('unit').not().exists().withMessage('Satuan mengikuti jenis material dan tidak bisa dikirim per baris')]),
  controller.addMaterialPoolItem);

router.delete('/material-pools/:id/items/:itemId', authorize('material-pool:update'),
  validate([poolIdParam, poolItemIdParam]), controller.removeMaterialPoolItem);

// ============================================================
// EQUIPMENT ALLOCATIONS — /api/projects/sub-projects/:subProjectId/allocations
// ============================================================

const ALLOC = '/sub-projects/:subProjectId/allocations';

router.get(ALLOC, authorize('allocation:read'),
  validate([subProjectIdParam,
    query('status').optional().isIn(ALLOCATION_STATUSES).withMessage(`status harus salah satu dari: ${ALLOCATION_STATUSES.join(', ')}`)]),
  controller.listAllocations);

router.get(`${ALLOC}/:id`, authorize('allocation:read'),
  validate([subProjectIdParam, idParam]), controller.detailAllocation);

router.post(ALLOC, authorize('allocation:create'),
  validate([subProjectIdParam,
    body('equipmentPoolItemId').isInt({ min: 1 }).withMessage('equipmentPoolItemId wajib diisi').toInt(),
    ...rejectSystemManaged('equipmentItemId', 'status', 'allocatedBy', 'allocatedAt', 'receivedBy', 'receivedAt')]),
  controller.createAllocation);

// Lapangan yang menerima unit di lokasi — permission TERPISAH dari
// allocation:create (Divisi Alat yang mengalokasikan) supaya yang menugaskan
// dan yang menerima bukan wewenang yang sama.
router.put(`${ALLOC}/:id/receive`, authorize('allocation:receive'),
  validate([subProjectIdParam, idParam]), controller.receiveAllocation);

router.put(`${ALLOC}/:id/status`, authorize('allocation:update'),
  validate([subProjectIdParam, idParam, statusBodyRule(ALLOCATION_STATUSES)]),
  controller.changeAllocationStatus);

module.exports = router;
