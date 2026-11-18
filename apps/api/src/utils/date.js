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

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tanggal kalender WIB dari sebuah waktu, sebagai Date tengah malam UTC — bentuk
 * yang sama dengan kolom @db.Date yang dikirim klien ("2026-11-16" → 2026-11-16T00:00Z).
 * Dipakai jurnal yang bertanggal hari aksi (plan Finance F3b): server boleh berjalan
 * di zona mana pun, buku tetap mengikuti hari kerja di Indonesia.
 */
const wibDateOf = (moment = new Date()) =>
  new Date(new Date(new Date(moment).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10));

const todayDate = () => wibDateOf(new Date());

module.exports = { assertNotFuture, wibDateOf, todayDate };
