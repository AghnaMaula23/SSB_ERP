const { httpError } = require('../../utils/error.js');

// ============================================================
// TAHAPAN / PROJECT SELESAI = TERKUNCI (L8, docs/keputusan-desain-lampiran.md)
//
// Arsip penutupan hanya benar kalau data tidak berubah lagi setelah ditutup.
// Dua sisi, satu baris kunci:
// - Jalur TULIS data tahapan/project memanggil assertContextOpen: baris konteks
//   dikunci FOR SHARE (penulis lain tetap jalan bersamaan) lalu statusnya dicek.
// - PENUTUPAN memanggil lockForClosing: baris yang sama dikunci FOR UPDATE —
//   menunggu penulis yang sedang berjalan, dan menahan penulis baru — lalu
//   menghitung urusan yang masih terbuka.
// Tanpa kunci ini tulis & tutup yang bersamaan bisa sama-sama lolos.
// ============================================================

const CLOSED_STATUSES = ['completed', 'cancelled'];

const CONTEXTS = {
  subProjectId: { table: 'sub_projects', label: (r) => `Tahapan ${r.label}`, labelColumn: 'sub_project_type' },
  externalSupplyProjectId: { table: 'external_supply_projects', label: (r) => `Kontrak supply ${r.label}`, labelColumn: 'supply_project_code' },
  externalRentalProjectId: { table: 'external_rental_projects', label: (r) => `Kontrak rental ${r.label}`, labelColumn: 'rental_project_code' },
};

const lockRow = async (tx, key, id, mode) => {
  const { table, labelColumn } = CONTEXTS[key];
  // Nama tabel/kolom dari konstanta di atas, bukan dari input
  const rows = await tx.$queryRawUnsafe(
    `SELECT status::text AS status, ${labelColumn}::text AS label FROM ${table} WHERE id = $1 FOR ${mode}`, id
  );
  return rows[0] ?? null;
};

/**
 * `context` = { subProjectId } | { externalSupplyProjectId } | { externalRentalProjectId }
 * (kunci yang null diabaikan). Dipanggil di DALAM transaksi jalur tulis.
 */
const assertContextOpen = async (tx, context) => {
  for (const key of Object.keys(CONTEXTS)) {
    if (!context[key]) continue;
    const row = await lockRow(tx, key, context[key], 'SHARE');
    if (row && CLOSED_STATUSES.includes(row.status)) {
      throw httpError(`${CONTEXTS[key].label(row)} sudah berstatus "${row.status}" — datanya terkunci`, 409);
    }
  }
};

/** Kunci baris konteks untuk ditutup; dipanggil sebelum menghitung urusan terbuka. */
const lockForClosing = (tx, key, id) => lockRow(tx, key, id, 'UPDATE');

/**
 * Tolak penutupan selama masih ada urusan terbuka. `checks` = [[jumlah, uraian], ...]
 * — semua alasan disebut sekaligus supaya pengguna tidak bolak-balik.
 */
const assertNothingOpen = (label, checks) => {
  const open = checks.filter(([count]) => count > 0).map(([count, what]) => `${count} ${what}`);
  if (open.length) {
    throw httpError(`${label} belum bisa ditutup — masih ada ${open.join(', ')}. Selesaikan, tolak, atau batalkan dulu.`, 409);
  }
};

module.exports = { CLOSED_STATUSES, assertContextOpen, lockForClosing, assertNothingOpen };
