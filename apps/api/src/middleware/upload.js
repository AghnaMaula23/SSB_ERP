const multer = require('multer');
const { PROFILES, detect } = require('../modules/file/file-types.js');

/**
 * Terima file multipart di `field`, cek jumlah, ukuran & jenis menurut profil
 * (docs/keputusan-desain-lampiran.md L3). Field teks lain tetap di req.body,
 * jadi validator express-validator berjalan sesudahnya seperti biasa.
 *
 * Disimpan di memori: ukuran maksimum dibatasi profil (≤ 50 MB) dan volume
 * unggah rendah. File baru menyentuh storage di service, setelah validasi lolos.
 */
const parseFiles = (field, profileName, { min, max }) => {
  const profile = PROFILES[profileName];
  // Field teks juga dibatasi: tanpa batas, satu request bisa membanjiri memori
  // dengan ribuan field sebelum validator sempat berjalan.
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: profile.maxBytes, files: max, fields: 50, fieldSize: 64 * 1024 },
  }).array(field, max);

  return (req, res, onParsed) => parse(req, res, (err) => {
    const fail = (message) => res.status(400).json({ success: false, message, errors: [{ field, message }] });
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(`Ukuran file maksimal ${profile.maxBytes / (1024 * 1024)} MB`);
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return fail(`File dikirim di field "${field}", maksimal ${max} file`);
      }
      return fail(err.message);
    }
    // Error lain dari parser = body multipart rusak/terpotong (koneksi putus, boundary
    // salah). Itu kesalahan kiriman, bukan server — tanpa ini jatuh ke 500 + stack trace.
    if (err) return fail('Data form rusak atau terpotong. Kirim ulang formnya.');

    const files = req.files ?? [];
    if (files.length < min) {
      return fail(min === 1 ? `File wajib dilampirkan di field "${field}"` : `Minimal ${min} file di field "${field}"`);
    }
    try {
      const uploads = files.map((f) => {
        // multer membaca nama file sebagai latin1; ubah ke UTF-8 supaya nama berhuruf non-ASCII utuh
        const originalName = Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255);
        return { buffer: f.buffer, originalName, type: detect(f.buffer, originalName, profileName) };
      });
      return onParsed(uploads);
    } catch (e) {
      return fail(e.message);
    }
  });
};

/**
 * Tepat satu file wajib -> `req.upload = { buffer, originalName, type }`.
 *   router.post('/', authorize(...), uploadSingle('deliveryNote', 'evidence'), validate(rules), controller.create)
 */
const uploadSingle = (field, profileName) => {
  const run = parseFiles(field, profileName, { min: 1, max: 1 });
  return (req, res, next) => run(req, res, (uploads) => { [req.upload] = uploads; next(); });
};

/** `min`..`max` file -> `req.uploads = [{ buffer, originalName, type }, ...]`. */
const uploadMany = (field, profileName, { min = 1, max }) => {
  const run = parseFiles(field, profileName, { min, max });
  return (req, res, next) => run(req, res, (uploads) => { req.uploads = uploads; next(); });
};

module.exports = { uploadSingle, uploadMany };
