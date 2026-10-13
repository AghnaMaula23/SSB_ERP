const { success, created, paginated } = require('../../utils/response.js');
// Konversi query string WAJIB di sini — `.toInt()` pada query() tidak berfungsi
// di Express 5. Lihat utils/query.js.
const { pageParams, boolQuery } = require('../../utils/query.js');
const service = require('./material.service.js');

const listQuery = (req) => ({ ...pageParams(req), search: req.query.search, isActive: boolQuery(req.query.isActive) });

const listUnits = async (req, res, next) => {
  try {
    return success(res, service.listUnits());
  } catch (err) { next(err); }
};

// ============================================================
// JENIS MATERIAL
// ============================================================

const listTypes = async (req, res, next) => {
  try {
    return paginated(res, await service.listTypes(listQuery(req)));
  } catch (err) { next(err); }
};

const detailType = async (req, res, next) => {
  try {
    return success(res, await service.getType(req.params.id));
  } catch (err) { next(err); }
};

const createType = async (req, res, next) => {
  try {
    return created(res, await service.createType(req.body), 'Jenis material berhasil dibuat');
  } catch (err) { next(err); }
};

const updateType = async (req, res, next) => {
  try {
    return success(res, await service.updateType(req.params.id, req.body), 'Jenis material berhasil diperbarui');
  } catch (err) { next(err); }
};

// ============================================================
// SUPPLIER
// ============================================================

const listSuppliers = async (req, res, next) => {
  try {
    return paginated(res, await service.listSuppliers(listQuery(req)));
  } catch (err) { next(err); }
};

const detailSupplier = async (req, res, next) => {
  try {
    return success(res, await service.getSupplier(req.params.id));
  } catch (err) { next(err); }
};

const createSupplier = async (req, res, next) => {
  try {
    return created(res, await service.createSupplier(req.body), 'Supplier berhasil dibuat');
  } catch (err) { next(err); }
};

const updateSupplier = async (req, res, next) => {
  try {
    return success(res, await service.updateSupplier(req.params.id, req.body), 'Supplier berhasil diperbarui');
  } catch (err) { next(err); }
};

module.exports = {
  listUnits,
  listTypes, detailType, createType, updateType,
  listSuppliers, detailSupplier, createSupplier, updateSupplier,
};
