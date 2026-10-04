/**
 * Helper pembentuk response. Sebelumnya disalin identik di 5 service Divisi Alat;
 * disatukan di sini saat modul Project dibangun supaya tidak lahir salinan keenam.
 */

/** Decimal Prisma keluar sebagai objek — JSON-kan jadi angka, null tetap null. */
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

/** Kolom @db.Date keluar sebagai DateTime. Potong ke YYYY-MM-DD supaya klien
 *  tidak menerima jam palsu 00:00:00 yang bergeser karena timezone. */
const toDateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/**
 * Whitelist field yang boleh ditulis klien. Dipakai MENGGANTIKAN spread
 * `...rest` — spread pernah menyebabkan status alat berubah tanpa audit trail
 * karena kolom terkelola sistem ikut masuk dari request body.
 */
const pickWritable = (payload, fields) =>
  Object.fromEntries(fields.filter((f) => payload[f] !== undefined).map((f) => [f, payload[f]]));

/**
 * Kolom @db.Date menolak string — Prisma menuntut Date atau ISO DateTime penuh.
 * Klien mengirim "2026-10-01" (bentuk yang benar untuk tanggal tanpa jam), jadi
 * konversinya harus terjadi di batas service. Dikumpulkan di sini supaya tiap
 * service tidak mengulang `new Date(...)` per kolom dan melewatkan satu.
 * null diteruskan apa adanya — itu cara klien mengosongkan tanggal.
 */
const coerceDates = (payload, fields) => {
  const out = { ...payload };
  for (const field of fields) {
    if (out[field] === undefined || out[field] === null) continue;
    const parsed = new Date(out[field]);
    if (Number.isNaN(parsed.getTime())) continue; // validator sudah menolak bentuk salah
    out[field] = parsed;
  }
  return out;
};

/** Bentuk ringkas user untuk field aktor (createdBy, validatedBy, dst). */
const shapeActor = (user) =>
  user ? { id: user.id, username: user.username, fullName: user.fullName } : null;

/** Kolom select yang dipakai shapeActor. */
const ACTOR_SELECT = { id: true, username: true, fullName: true };

module.exports = { toNumber, toDateOnly, coerceDates, pickWritable, shapeActor, ACTOR_SELECT };
