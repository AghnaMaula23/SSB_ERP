const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, authorize } = require('../../middleware/auth.js');
const validate = require('../../middleware/validate.js');
const controller = require('./cash.controller.js');

const router = express.Router();
router.use(authenticate);

const TRANSACTION_TYPES = ['cash_in', 'cash_out'];
const ORDER_CATEGORIES = ['repair', 'maintenance', 'stock'];
const SOURCE_TYPES = [
  'opening_balance', 'equipment_income_claim', 'equipment_purchase_request',
  'manual_expense', 'adjustment',
];
// Sumber yang boleh diketik manusia. `equipment_purchase_request` dan
// `equipment_income_claim` sengaja tidak ada: barisnya dibuat sistem dari
// dokumennya. Ditolak di validator DAN di service — lapis pertama memberi pesan
// yang jelas, lapis kedua menjaga kalau ada pemanggil lain.
const MANUAL_SOURCE_TYPES = ['opening_balance', 'manual_expense', 'adjustment'];

const idParam = param('id').isInt({ min: 1 }).withMessage('ID harus angka').toInt();

const pageRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page harus angka minimal 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit 1-100').toInt(),
];

// Kolom terkelola sistem. Ditolak terang-terangan supaya klien tidak bisa
// mengarang nomor transaksi, mengaitkan barisnya ke dokumen yang tidak ada,
// atau menandai barisnya batal tanpa melewati endpoint void.
const systemManagedRules = [
  body('transactionCode').not().exists().withMessage('Nomor transaksi dibuat otomatis oleh sistem'),
  body('sourceId').not().exists()
    .withMessage('Kaitan ke dokumen sumber diisi sistem — transaksi manual tidak menunjuk dokumen'),
  body('isVoided').not().exists().withMessage('Pembatalan lewat PUT /transactions/{id}/void'),
  body('voidReason').not().exists().withMessage('Alasan pembatalan diisi lewat PUT /transactions/{id}/void'),
];

// ============================================================
// SALDO — /api/equipment/cash
// ============================================================

router.get('/balance', authorize('cash:read'), controller.balance);

router.get('/summary',
  authorize('cash:read'),
  validate([
    query('dateFrom').optional().isISO8601().withMessage('dateFrom harus format tanggal YYYY-MM-DD'),
    query('dateTo').optional().isISO8601().withMessage('dateTo harus format tanggal YYYY-MM-DD'),
  ]),
  controller.summary);

// ============================================================
// KATEGORI KAS — /api/equipment/cash/categories
// ============================================================

router.get('/categories',
  authorize('cash:read'),
  validate([
    query('transactionType').optional().isIn(TRANSACTION_TYPES)
      .withMessage(`transactionType harus salah satu dari: ${TRANSACTION_TYPES.join(', ')}`),
    query('orderCategory').optional().isIn(ORDER_CATEGORIES)
      .withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
    query('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  controller.listCategories);

router.post('/categories',
  authorize('cash:create'),
  validate([
    body('categoryName').trim().notEmpty().withMessage('Nama kategori wajib diisi')
      .isLength({ max: 150 }).withMessage('Nama kategori maksimal 150 karakter'),
    body('transactionType').notEmpty().withMessage('Arah transaksi wajib diisi')
      .isIn(TRANSACTION_TYPES).withMessage(`transactionType harus salah satu dari: ${TRANSACTION_TYPES.join(', ')}`),
    body('orderCategory').optional({ nullable: true }).isIn(ORDER_CATEGORIES)
      .withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
    body('description').optional({ nullable: true }).trim(),
  ]),
  controller.storeCategory);

router.put('/categories/:id',
  authorize('cash:update'),
  validate([
    idParam,
    body('categoryName').optional().trim().notEmpty().withMessage('Nama kategori tidak boleh kosong')
      .isLength({ max: 150 }).withMessage('Nama kategori maksimal 150 karakter'),
    body('transactionType').optional().isIn(TRANSACTION_TYPES)
      .withMessage(`transactionType harus salah satu dari: ${TRANSACTION_TYPES.join(', ')}`),
    body('orderCategory').optional({ nullable: true }).isIn(ORDER_CATEGORIES)
      .withMessage(`orderCategory harus salah satu dari: ${ORDER_CATEGORIES.join(', ')}`),
    body('description').optional({ nullable: true }).trim(),
    body('isActive').optional().isBoolean().withMessage('isActive harus boolean').toBoolean(),
  ]),
  controller.updateCategory);

router.delete('/categories/:id',
  authorize('cash:delete'),
  validate([idParam]),
  controller.removeCategory);

// ============================================================
// TRANSAKSI KAS — /api/equipment/cash/transactions
// ============================================================

router.get('/transactions',
  authorize('cash:read'),
  validate([
    ...pageRules,
    query('transactionType').optional().isIn(TRANSACTION_TYPES)
      .withMessage(`transactionType harus salah satu dari: ${TRANSACTION_TYPES.join(', ')}`),
    query('categoryId').optional().isInt({ min: 1 }).withMessage('categoryId harus angka').toInt(),
    query('sourceType').optional().isIn(SOURCE_TYPES)
      .withMessage(`sourceType harus salah satu dari: ${SOURCE_TYPES.join(', ')}`),
    query('dateFrom').optional().isISO8601().withMessage('dateFrom harus format tanggal YYYY-MM-DD'),
    query('dateTo').optional().isISO8601().withMessage('dateTo harus format tanggal YYYY-MM-DD'),
    query('includeVoided').optional().isBoolean().withMessage('includeVoided harus boolean').toBoolean(),
    query('search').optional().trim(),
  ]),
  controller.listTransactions);

router.get('/transactions/:id',
  authorize('cash:read'),
  validate([idParam]),
  controller.detailTransaction);

router.post('/transactions',
  authorize('cash:create'),
  validate([
    body('transactionDate').notEmpty().withMessage('Tanggal transaksi wajib diisi')
      .isISO8601().withMessage('transactionDate harus format tanggal YYYY-MM-DD'),
    body('transactionType').notEmpty().withMessage('Arah transaksi wajib diisi')
      .isIn(TRANSACTION_TYPES).withMessage(`transactionType harus salah satu dari: ${TRANSACTION_TYPES.join(', ')}`),
    body('categoryId').notEmpty().withMessage('Kategori kas wajib diisi')
      .isInt({ min: 1 }).withMessage('categoryId harus angka').toInt(),
    body('amount').notEmpty().withMessage('Nominal wajib diisi')
      .isFloat({ gt: 0 }).withMessage('Nominal harus lebih dari 0').toFloat(),
    body('sourceType').notEmpty().withMessage('Sumber transaksi wajib diisi')
      .isIn(MANUAL_SOURCE_TYPES)
      .withMessage(`sourceType untuk catatan manual harus salah satu dari: ${MANUAL_SOURCE_TYPES.join(', ')}. Transaksi dari purchase request dan klaim pendapatan dibuat sistem.`),
    body('description').trim().notEmpty().withMessage('Keterangan wajib diisi — tanpa itu baris kas tidak bisa ditelusuri'),
    ...systemManagedRules,
  ]),
  controller.storeTransaction);

// Arah uang dan sumbernya tidak ikut bisa diubah: keduanya menentukan ARTI
// baris, jadi menggantinya sama saja dengan membuat baris lain. Kalau salah,
// batalkan barisnya lalu catat yang benar.
router.put('/transactions/:id',
  authorize('cash:update'),
  validate([
    idParam,
    body('transactionDate').optional().isISO8601().withMessage('transactionDate harus format tanggal YYYY-MM-DD'),
    body('categoryId').optional().isInt({ min: 1 }).withMessage('categoryId harus angka').toInt(),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Nominal harus lebih dari 0').toFloat(),
    body('description').optional().trim().notEmpty().withMessage('Keterangan tidak boleh dikosongkan'),
    body('transactionType').not().exists()
      .withMessage('Arah transaksi tidak bisa diubah. Batalkan transaksi ini lalu catat yang benar.'),
    body('sourceType').not().exists()
      .withMessage('Sumber transaksi tidak bisa diubah. Batalkan transaksi ini lalu catat yang benar.'),
    ...systemManagedRules,
  ]),
  controller.updateTransaction);

router.put('/transactions/:id/void',
  authorize('cash:update'),
  validate([
    idParam,
    body('voidReason').trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')
      .isLength({ max: 500 }).withMessage('Alasan pembatalan maksimal 500 karakter'),
  ]),
  controller.voidTransaction);

module.exports = router;
