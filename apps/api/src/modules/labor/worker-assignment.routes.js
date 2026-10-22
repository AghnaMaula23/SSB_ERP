const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./worker-assignment.controller.js');

// ============================================================
// Penugasan pekerja per tahapan — docs/skema-tenaga-kerja-harian.md P5.
// Permission modul `worker` (master & penugasan satu modul, P4).
// ============================================================

const router = Router();
router.use(authenticate);

const WORKER_TYPES = ['contract', 'daily'];
const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const listRules = [
  query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
  query('projectWorkerId').optional().isInt({ min: 1 }).withMessage('projectWorkerId tidak valid'),
  query().custom((q) => {
    if (!q.subProjectId && !q.projectWorkerId) throw new Error('subProjectId atau projectWorkerId wajib diisi');
    return true;
  }),
  query('workerType').optional().isIn(WORKER_TYPES).withMessage(`workerType harus salah satu dari: ${WORKER_TYPES.join(', ')}`),
  query('active').optional().isIn(['true', 'false']).withMessage('active harus true atau false'),
  query('activeOn').optional().isISO8601().withMessage('activeOn harus tanggal ISO (YYYY-MM-DD)'),
];

const termRules = (required) => [
  (required ? body('workerType') : body('workerType').optional())
    .isIn(WORKER_TYPES).withMessage(`workerType harus salah satu dari: ${WORKER_TYPES.join(', ')}`),
  (required ? body('dailyWage') : body('dailyWage').optional())
    .isFloat({ gt: 0, max: 999999999 }).withMessage('dailyWage harus lebih dari 0 — pekerja kontrak juga berupah harian').toFloat(),
  (required ? body('startDate') : body('startDate').optional())
    .isISO8601().withMessage('startDate harus tanggal ISO (YYYY-MM-DD)'),
  body('endDate').optional({ values: 'null' }).isISO8601().withMessage('endDate harus tanggal ISO (YYYY-MM-DD) atau null'),
  body('assignedRole').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Peran maksimal 100 karakter'),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 5000 }).withMessage('notes maksimal 5000 karakter'),
  ...['createdBy', 'status']
    .map((f) => body(f).not().exists().withMessage(`${f} tidak ada di penugasan — "masih bertugas" dibaca dari endDate`)),
];

const createRules = [
  body('subProjectId').isInt({ min: 1 }).withMessage('subProjectId wajib diisi').toInt(),
  body('projectWorkerId').isInt({ min: 1 }).withMessage('projectWorkerId wajib diisi').toInt(),
  ...termRules(true),
];

const updateRules = [
  idParam,
  ...['subProjectId', 'projectWorkerId']
    .map((f) => body(f).not().exists().withMessage(`${f} tidak bisa diubah — hapus lalu buat penugasan baru`)),
  ...termRules(false),
];

router.get('/', authorize('worker:read'), validate(listRules), controller.list);
router.get('/:id', authorize('worker:read'), validate([idParam]), controller.detail);
router.post('/', authorize('worker:create'), validate(createRules), controller.create);
router.put('/:id', authorize('worker:update'), validate(updateRules), controller.update);
router.delete('/:id', authorize('worker:delete'), validate([idParam]), controller.remove);

module.exports = router;
