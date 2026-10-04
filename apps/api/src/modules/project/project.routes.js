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

const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100').toInt(),
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

mountProjectType('external-supply', 'external-supply', {
  createRules: [nameRule('supplyProjectName', 'Nama supply project'), codeOverrideRule('supplyProjectCode'),
    ...commonProjectRules, ...contractRules],
  updateRules: [optionalNameRule('supplyProjectName', 'Nama supply project'),
    ...commonProjectRules, ...contractRules],
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

module.exports = router;
