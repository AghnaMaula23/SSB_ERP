const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./payroll.service.js');

const list = async (req, res, next) => {
  try {
    return paginated(res, await service.list({ ...pageParams(req), year: numQuery(req.query.year), status: req.query.status }));
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

// Karyawan aktif tanpa gaji berlaku dilaporkan di meta.skipped (kontrak 5d)
const create = async (req, res, next) => {
  try {
    const { payroll, skipped } = await service.create(req.body, req.user.id);
    return created(res, payroll, 'Payroll draft dibuat', { skipped });
  } catch (err) { next(err); }
};

const regenerate = async (req, res, next) => {
  try {
    const { payroll, skipped } = await service.regenerate(req.params.id);
    return success(res, payroll, 'Karyawan & gaji ditarik ulang', 200, { skipped });
  } catch (err) { next(err); }
};

const replaceComponents = async (req, res, next) => {
  try {
    return success(res, await service.replaceComponents(req.params.id, req.params.itemId, req.body), 'Komponen gaji diperbarui');
  } catch (err) { next(err); }
};

const finalize = async (req, res, next) => {
  try {
    return success(res, await service.finalize(req.params.id, req.user.id), 'Payroll dikunci');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Payroll dibatalkan');
  } catch (err) { next(err); }
};

// `req.uploads` diisi middleware upload (bukti yang sudah diperiksa jenis & ukurannya)
const pay = async (req, res, next) => {
  try {
    return success(res, await service.pay(req.params.id, req.body, req.uploads, req.user.id), 'Payroll dibayar dan dijurnal');
  } catch (err) { next(err); }
};

const voidPayroll = async (req, res, next) => {
  try {
    return success(res, await service.voidPayroll(req.params.id, req.body, req.user.id), 'Payroll dibatalkan (jurnal dibalik)');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, regenerate, replaceComponents, finalize, cancel, pay, voidPayroll };
