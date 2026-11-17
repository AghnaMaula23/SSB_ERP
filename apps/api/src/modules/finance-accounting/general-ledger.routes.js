const { Router } = require('express');
const { param, query } = require('express-validator');
const validate = require('../../middleware/validate.js');
const { authenticate, authorize } = require('../../middleware/auth.js');
const controller = require('./general-ledger.controller.js');

// ============================================================
// Laporan GL baca saja — buku besar per akun & neraca saldo (plan Finance 5a, F25)
// ============================================================

const router = Router();
router.use(authenticate);

// TANPA .toInt() di query() — tidak berfungsi pada req.query di Express 5
const isoDate = (field) => query(field).isISO8601().withMessage(`${field} wajib tanggal ISO (YYYY-MM-DD)`);

router.get('/accounts/:accountId', authorize('journal:read'), validate([
  param('accountId').isInt({ min: 1 }).withMessage('accountId tidak valid').toInt(),
  isoDate('startDate'), isoDate('endDate'),
]), controller.accountLedger);
router.get('/trial-balance', authorize('journal:read'), validate([isoDate('date')]), controller.trialBalance);

module.exports = router;
