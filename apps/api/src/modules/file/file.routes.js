const { Router } = require('express');
const { param } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate } = require('../../middleware/auth.js');
const controller = require('./file.controller.js');

const router = Router();
router.use(authenticate);

// Tanpa authorize() di sini: permission yang dibutuhkan bergantung pada modul
// pemilik file (permission READ modul sumbernya, lampiran L5) — diperiksa di service.
router.get('/:id/url', validate([param('id').isInt({ min: 1 }).withMessage('ID tidak valid').toInt()]), controller.downloadUrl);

module.exports = router;
