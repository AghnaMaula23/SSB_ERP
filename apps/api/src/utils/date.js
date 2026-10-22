const { httpError } = require('./error.js');

/**
 * Tanggal kejadian tidak boleh di masa depan. Batasnya AKHIR hari ini, bukan
 * detik ini — kalau dibandingkan dengan `new Date()` mentah, mencatat kejadian
 * "hari ini" akan tertolak hanya karena jamnya sudah lewat.
 *
 * Mengembalikan Date hasil parse supaya pemanggil tidak perlu mem-parse ulang.
 */
const assertNotFuture = (value, label) => {
  const date = new Date(value);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) throw httpError(`${label} tidak boleh di masa depan`, 400);
  return date;
};

module.exports = { assertNotFuture };
