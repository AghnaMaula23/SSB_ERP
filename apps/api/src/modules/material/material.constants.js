/**
 * Satuan baku material (keputusan D1, 13 Okt 2026). Satuan hanya disimpan di
 * material_types dan diikuti semua baris kuantitas, jadi daftarnya harus baku:
 * kalau diketik bebas, "m3", "m³", dan "M3" jadi tiga satuan berbeda dan admin
 * bisa tanpa sadar membuat dua jenis material yang sama.
 *
 * "rit" sengaja TIDAK ada: muatan truk berbeda-beda, jadi rit bukan ukuran yang
 * stabil — konversikan ke m³ saat input. Menambah satuan baru cukup di sini.
 */
const MATERIAL_UNITS = ['m³', 'ton', 'kg', 'liter', 'sak', 'roll', 'batang', 'unit'];

module.exports = { MATERIAL_UNITS };
