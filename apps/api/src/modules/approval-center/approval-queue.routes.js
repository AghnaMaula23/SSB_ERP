const { Router } = require('express');
const { query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');
const controller = require('./approval-queue.controller.js');
const { SOURCE_TYPES, STAGES } = require('./approval-queue.service.js');

const router = Router();
router.use(authenticate);

// Tanpa authorize(): isi antrean ditentukan permission AKSI tiap tahap
// (QUEUES di service). User tanpa satu pun permission itu mendapat antrean kosong.
const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka >= 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100'),
];

router.get('/', validate([
  ...pageRules,
  query('stage').optional().isIn(STAGES).withMessage(`stage harus salah satu dari: ${STAGES.join(', ')}`),
  query('sourceType').optional().isIn(SOURCE_TYPES).withMessage(`sourceType harus salah satu dari: ${SOURCE_TYPES.join(', ')}`),
  query('sort').optional().isIn(['oldest', 'newest']).withMessage('sort harus oldest atau newest'),
  query('search').optional().isString(),
]), controller.list);

router.get('/summary', controller.summary);

module.exports = router;
