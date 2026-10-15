const multer = require('multer');
const { PROFILES, detect } = require('../modules/file/file-types.js');

/**
 * Terima SATU file multipart di `field`, cek ukuran & jenis menurut profil
 * (docs/keputusan-desain-lampiran.md L3), lalu taruh hasilnya di
 * `req.upload = { buffer, originalName, type }`. Field teks lain tetap di
 * req.body, jadi validator express-validator berjalan sesudahnya seperti biasa.
 *
 *   router.post('/', authorize(...), uploadSingle('deliveryNote', 'evidence'), validate(rules), controller.create)
 *
 * Disimpan di memori: ukuran maksimum dibatasi profil (≤ 50 MB) dan volume
 * unggah rendah. File baru menyentuh storage di service, setelah validasi lolos.
 */
const uploadSingle = (field, profileName, { required = true } = {}) => {
  const profile = PROFILES[profileName];
  // Field teks juga dibatasi: tanpa batas, satu request bisa membanjiri memori
  // dengan ribuan field sebelum validator sempat berjalan.
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: profile.maxBytes, files: 1, fields: 50, fieldSize: 64 * 1024 },
  }).single(field);

  return (req, res, next) => parse(req, res, (err) => {
    const fail = (message) => res.status(400).json({ success: false, message, errors: [{ field, message }] });
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(`Ukuran file maksimal ${profile.maxBytes / (1024 * 1024)} MB`);
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return fail(`File harus dikirim di field "${field}", satu file saja`);
      return fail(err.message);
    }
    // Error lain dari parser = body multipart rusak/terpotong (koneksi putus, boundary
    // salah). Itu kesalahan kiriman, bukan server — tanpa ini jatuh ke 500 + stack trace.
    if (err) return fail('Data form rusak atau terpotong. Kirim ulang formnya.');

    if (!req.file) return required ? fail(`File wajib dilampirkan di field "${field}"`) : next();
    // multer membaca nama file sebagai latin1; ubah ke UTF-8 supaya nama berhuruf non-ASCII utuh
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255);
    try {
      req.upload = { buffer: req.file.buffer, originalName, type: detect(req.file.buffer, originalName, profileName) };
    } catch (e) {
      return fail(e.message);
    }
    return next();
  });
};

module.exports = { uploadSingle };
