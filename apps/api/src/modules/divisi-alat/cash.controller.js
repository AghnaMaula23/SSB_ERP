const service = require('./cash.service.js');
const { success, created, paginated } = require('../../utils/response.js');

// Query boolean arrives as string ("true"/"false"). express-validator's
// .toBoolean() sanitizes req.query, which is read-only on Express 5, so the
// coercion has to dilakukan di sini — kalau tidak, Prisma menolak string
// untuk kolom Boolean.
const boolQuery = (value) => (value === undefined ? undefined : value === 'true');

// ---------- Saldo ----------

const balance = async (req, res, next) => {
  try {
    return success(res, await service.getBalance());
  } catch (err) { next(err); }
};

const summary = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    return success(res, await service.getSummary({ dateFrom, dateTo }));
  } catch (err) { next(err); }
};

// ---------- Kategori ----------

const listCategories = async (req, res, next) => {
  try {
    const { transactionType, orderCategory } = req.query;
    return success(res, await service.listCategories({ transactionType, isActive: boolQuery(req.query.isActive), orderCategory }));
  } catch (err) { next(err); }
};

const storeCategory = async (req, res, next) => {
  try {
    return created(res, await service.createCategory(req.body), 'Kategori kas berhasil dibuat');
  } catch (err) { next(err); }
};

const updateCategory = async (req, res, next) => {
  try {
    const result = await service.updateCategory(Number(req.params.id), req.body);
    return success(res, result, 'Kategori kas berhasil diperbarui');
  } catch (err) { next(err); }
};

const removeCategory = async (req, res, next) => {
  try {
    const result = await service.removeCategory(Number(req.params.id));
    return success(res, result, 'Kategori kas berhasil dihapus');
  } catch (err) { next(err); }
};

// ---------- Transaksi ----------

const listTransactions = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, transactionType, categoryId,
      sourceType, dateFrom, dateTo, search,
    } = req.query;

    const result = await service.listTransactions({
      page: Number(page),
      limit: Number(limit),
      transactionType,
      categoryId: categoryId === undefined ? undefined : Number(categoryId),
      sourceType,
      dateFrom,
      dateTo,
      includeVoided: boolQuery(req.query.includeVoided),
      search,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailTransaction = async (req, res, next) => {
  try {
    return success(res, await service.getTransactionById(Number(req.params.id)));
  } catch (err) { next(err); }
};

const storeTransaction = async (req, res, next) => {
  try {
    const result = await service.createTransaction(req.body, req.user.id);
    return created(res, result, 'Transaksi kas berhasil dicatat');
  } catch (err) { next(err); }
};

const updateTransaction = async (req, res, next) => {
  try {
    const result = await service.updateTransaction(Number(req.params.id), req.body);
    return success(res, result, 'Transaksi kas berhasil diperbarui');
  } catch (err) { next(err); }
};

const voidTransaction = async (req, res, next) => {
  try {
    const result = await service.voidTransaction(Number(req.params.id), req.body, req.user.id);
    return success(res, result, 'Transaksi kas dibatalkan');
  } catch (err) { next(err); }
};

module.exports = {
  balance, summary,
  listCategories, storeCategory, updateCategory, removeCategory,
  listTransactions, detailTransaction, storeTransaction, updateTransaction, voidTransaction,
};
