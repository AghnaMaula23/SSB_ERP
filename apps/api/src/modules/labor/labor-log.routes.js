const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./labor-log.controller.js');

// ============================================================
// Log tenaga kerja harian — docs/skema-tenaga-kerja-harian.md P1–P10.
// Tanpa endpoint validasi: pemeriksaan terjadi di klaim upah (P1).
// ============================================================

const router = Router();
router.use(authenticate);

const WORKER_TYPES = ['contract', 'daily'];
const MAX_ITEMS = 300;
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi'),
  query('projectWorkerId').optional().isInt({ min: 1 }).withMessage('projectWorkerId tidak valid'),
  query('startDate').optional().isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  query('endDate').optional().isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD)'),
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];

const itemRules = (required) => [
  (required ? body('items') : body('items').optional())
    .isArray({ min: 1, max: MAX_ITEMS }).withMessage(`items wajib berisi 1–${MAX_ITEMS} pekerja (satu baris = satu orang)`),
  body('items.*.projectWorkerId').isInt({ min: 1 })
    .withMessage('projectWorkerId wajib — pekerja baru didaftarkan dulu lewat POST /workers').toInt(),
  body('items.*.workerRole').isString().trim().notEmpty().withMessage('workerRole wajib diisi')
    .isLength({ max: 100 }).withMessage('workerRole maksimal 100 karakter'),
  body('items.*.workerType').isIn(WORKER_TYPES).withMessage(`workerType harus salah satu dari: ${WORKER_TYPES.join(', ')}`),
  body('items.*.dailyWage').isFloat({ gt: 0, max: 999999999 })
    .withMessage('dailyWage harus lebih dari 0 — pekerja kontrak juga berupah harian').toFloat(),
  body('items.*.overtimeAmount').optional().isFloat({ min: 0, max: 999999999 }).withMessage('overtimeAmount tidak boleh negatif').toFloat(),
  body('items.*.taskNotes').optional({ values: 'null' }).isString().isLength({ max: 2000 }).withMessage('taskNotes maksimal 2000 karakter'),
  ...['items.*.totalWage', 'items.*.isOvertime', 'items.*.workerName']
    .map((f) => body(f).not().exists().withMessage(`${f} tidak dikirim — total dihitung sistem, lembur = overtimeAmount > 0, nama dari master`)),
];

const managedFields = ['createdBy', 'updatedBy', 'totalWorkers', 'totalWage', 'status']
  .map((f) => body(f).not().exists().withMessage(`${f} dikelola sistem dan tidak bisa dikirim lewat request`));

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('workDate').isISO8601().withMessage('workDate wajib berupa tanggal ISO (YYYY-MM-DD)'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...itemRules(true),
  ...managedFields,
];

const updateRules = [
  idParam,
  body('subProjectId').not().exists().withMessage('subProjectId tidak bisa diubah'),
  body('workDate').not().exists().withMessage('workDate tidak bisa diubah — salah tanggal: hapus log lalu catat ulang'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...itemRules(false),
  ...managedFields,
];

router.get('/', authorize('labor-log:read'), validate(listRules), controller.list);
router.get('/:id', authorize('labor-log:read'), validate([idParam]), controller.detail);
router.post('/', authorize('labor-log:create'), validate(createRules), controller.create);
router.put('/:id', authorize('labor-log:update'), validate(updateRules), controller.update);
router.delete('/:id', authorize('labor-log:delete'), validate([idParam]), controller.remove);

module.exports = router;
