const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./labor-payment-proof.service.js');

const list = async (req, res, next) => {
  try {
    const result = await service.list({
      ...pageParams(req),
      laborWageClaimId: numQuery(req.query.laborWageClaimId),
      subProjectId: numQuery(req.query.subProjectId),
      status: req.query.status,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detail = async (req, res, next) => {
  try {
    return success(res, await service.getById(req.params.id));
  } catch (err) { next(err); }
};

// `req.uploads` diisi middleware upload (berkas yang sudah diperiksa jenis & ukurannya)
const create = async (req, res, next) => {
  try {
    return created(res, await service.create(req.body, req.uploads, req.user.id), 'Bukti bayar upah dikirim');
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    return success(res, await service.cancel(req.params.id, req.body, req.user.id), 'Bukti bayar upah dibatalkan');
  } catch (err) { next(err); }
};

const validate = async (req, res, next) => {
  try {
    return success(res, await service.validate(req.params.id, req.body, req.user.id), 'Bukti bayar upah divalidasi');
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    return success(res, await service.reject(req.params.id, req.body, req.user.id), 'Bukti bayar upah ditolak');
  } catch (err) { next(err); }
};

module.exports = { list, detail, create, cancel, validate, reject };
