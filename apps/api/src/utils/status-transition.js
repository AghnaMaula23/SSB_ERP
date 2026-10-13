const { httpError } = require('./error.js');

/**
 * Ubah baris HANYA kalau keadaannya masih seperti yang diperiksa, di dalam
 * transaksi pemanggil.
 *
 * Kenapa perlu: pola "baca status → cek → update({ where: { id } })" punya
 * celah. Dua permintaan bersamaan sama-sama lolos pengecekan, lalu sama-sama
 * menulis. Terbukti 10 Okt 2026 di purchase request: tiga approval bersamaan
 * menghasilkan tiga cash-out Kas Alat untuk satu order, dan approve + cancel
 * bersamaan sama-sama menjawab 200.
 *
 * `updateMany` dengan syarat keadaan di WHERE dieksekusi atomik oleh database:
 * hanya satu yang menang, sisanya mendapat count 0 → 409. Pengecekan di luar
 * transaksi tetap dipakai untuk pesan error yang jelas; fungsi ini yang
 * menjamin kebenarannya.
 *
 *   await claimTransition(tx.equipmentPurchaseRequest,
 *     { id, status: 'waiting_finance_approval' },
 *     { status: 'approved', ... });
 */
const claimTransition = async (delegate, where, data) => {
  const { count } = await delegate.updateMany({ where, data });
  if (count === 0) throw httpError('Data ini baru saja diproses orang lain. Muat ulang datanya.', 409);
};

module.exports = { claimTransition };
