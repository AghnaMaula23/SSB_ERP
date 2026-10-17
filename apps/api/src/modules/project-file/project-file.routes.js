const { Router } = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { uploadSingle } = require('../../middleware/upload.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./project-file.controller.js');

// ============================================================
// BERKAS PROJECT (L8, docs/keputusan-desain-lampiran.md). Kontrak: Swagger tag
// Project Files. Unduh berkas tetap lewat GET /api/files/:id/url.
// ============================================================

const router = Router();
router.use(authenticate);

const PROJECT_TYPES = ['construction', 'rental', 'supply'];
const FILE_KINDS = ['image', 'pdf', 'sheet', 'doc', 'cad'];
const SYSTEM_KEYS = ['delivery-notes', 'receipt-proofs'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt();
const projectParams = [
  param('type').isIn(PROJECT_TYPES).withMessage(`type harus salah satu dari: ${PROJECT_TYPES.join(', ')}`),
  param('projectId').isInt({ min: 1 }).withMessage('projectId tidak valid').toInt(),
];
// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];
const folderName = body('name').isString().withMessage('Nama folder wajib diisi').trim()
  .notEmpty().withMessage('Nama folder wajib diisi').isLength({ max: 120 }).withMessage('Nama folder maksimal 120 karakter');
const fileName = (optional) => {
  const chain = body('name');
  return (optional ? chain.optional() : chain).isString().withMessage('Nama berkas wajib diisi').trim()
    .notEmpty().withMessage('Nama berkas wajib diisi').isLength({ max: 150 }).withMessage('Nama berkas maksimal 150 karakter');
};
const description = body('description').optional({ values: 'null' }).isString().withMessage('description harus teks').trim()
  .isLength({ max: 500 }).withMessage('Deskripsi maksimal 500 karakter');

router.get('/projects', authorize('project-file:read'),
  validate([query('type').optional().isIn(PROJECT_TYPES).withMessage(`type harus salah satu dari: ${PROJECT_TYPES.join(', ')}`)]),
  controller.listProjects);

router.get('/projects/:type/:projectId', authorize('project-file:read'), validate(projectParams), controller.getDirectory);

router.post('/projects/:type/:projectId/folders', authorize('project-file:create'),
  validate([...projectParams, folderName,
    body('subProjectId').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('subProjectId tidak valid').toInt()]),
  controller.createFolder);

router.get('/projects/:type/:projectId/trash', authorize('project-file:read'),
  validate([...projectParams, ...pageRules]), controller.listTrash);

router.get('/projects/:type/:projectId/system-folders/:key', authorize('project-file:read'),
  validate([...projectParams,
    param('key').isIn(SYSTEM_KEYS).withMessage(`key harus salah satu dari: ${SYSTEM_KEYS.join(', ')}`),
    query('subProjectId').optional().isInt({ min: 1 }).withMessage('subProjectId tidak valid'),
    ...pageRules]),
  controller.listSystemFolder);

router.patch('/folders/:id', authorize('project-file:update'), validate([idParam, folderName]), controller.renameFolder);
router.delete('/folders/:id', authorize('project-file:delete'), validate([idParam]), controller.deleteFolder);

router.get('/folders/:id/files', authorize('project-file:read'),
  validate([idParam, ...pageRules,
    query('q').optional().isString().trim().isLength({ max: 100 }).withMessage('q maksimal 100 karakter'),
    query('kind').optional().isIn(FILE_KINDS).withMessage(`kind harus salah satu dari: ${FILE_KINDS.join(', ')}`)]),
  controller.listFolderFiles);

// Form + file dalam SATU multipart (L4). File diperiksa jenis & ukurannya (profil
// `project`, L3) sebelum validator teks berjalan.
router.post('/folders/:id/files', authorize('project-file:create'),
  uploadSingle('file', 'project'),
  validate([idParam, fileName(false), description]),
  controller.uploadFile);

router.get('/files/:id', authorize('project-file:read'), validate([idParam]), controller.getFile);
router.patch('/files/:id', authorize('project-file:update'),
  validate([idParam, fileName(true), description,
    body('folderId').optional().isInt({ min: 1 }).withMessage('folderId tidak valid').toInt()]),
  controller.updateFile);
router.delete('/files/:id', authorize('project-file:delete'), validate([idParam]), controller.trashFile);
router.post('/files/:id/restore', authorize('project-file:delete'), validate([idParam]), controller.restoreFile);

module.exports = router;
