/**
 * Pembaca query string.
 *
 * ADA JEBAKAN DI SINI, jangan dihapus tanpa membaca ini dulu:
 * Express 5 membuat `req.query` menjadi GETTER yang read-only. Akibatnya
 * sanitizer express-validator seperti `.toInt()` pada `query('limit')`
 * **tidak berpengaruh sama sekali** — tidak error, tidak ada peringatan,
 * nilainya tetap string. Prisma lalu menolaknya:
 *
 *   Argument `take`: Invalid value provided. Expected Int, provided String.
 *
 * Jadi konversi angka dari query string WAJIB dilakukan di controller, bukan
 * di validator. `.toInt()` pada `query(...)` jangan dipakai karena menyesatkan
 * pembaca — seolah konversinya sudah ditangani padahal tidak.
 *
 * `req.params` TIDAK kena masalah ini (masih objek biasa yang bisa ditulis),
 * jadi `param('id').toInt()` tetap sah dan tetap dipakai.
 */

/** Paginasi standar: page >= 1, limit 1-100 dengan default 20. */
const pageParams = (req) => ({
  page: Number(req.query.page) || 1,
  limit: Math.min(Number(req.query.limit) || 20, 100),
});

/** Query numerik opsional. undefined kalau tidak dikirim atau bukan angka. */
const numQuery = (value) => {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
};

/** Query boolean opsional: hanya string "true"/"false" yang berarti. */
const boolQuery = (value) => (value === undefined ? undefined : value === 'true');

module.exports = { pageParams, numQuery, boolQuery };
