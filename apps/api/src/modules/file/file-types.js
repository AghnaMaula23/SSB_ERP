// ============================================================
// Jenis file dikenali dari ISI (byte awal), bukan dari ekstensi atau header
// Content-Type kiriman klien — keduanya bisa dipalsukan (L3,
// docs/keputusan-desain-lampiran.md). Sengaja tanpa dependency: daftar jenis
// yang diterima pendek dan tetap.
// ============================================================

const MB = 1024 * 1024;

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

/**
 * `ext` = ekstensi yang dipakai di kunci storage. XLSX & DOCX sama-sama ZIP,
 * jadi dibedakan lewat ekstensi nama asli — isi ZIP lain (arsip biasa, .xlsm
 * ber-makro) tetap ditolak karena ekstensinya tidak cocok.
 */
const TYPES = {
  pdf: { mime: 'application/pdf', ext: 'pdf', inline: true, match: (b) => ascii(b, 0, 5) === '%PDF-' },
  jpg: { mime: 'image/jpeg', ext: 'jpg', inline: true, match: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  png: { mime: 'image/png', ext: 'png', inline: true, match: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  webp: { mime: 'image/webp', ext: 'webp', inline: true, match: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  dwg: { mime: 'image/vnd.dwg', ext: 'dwg', inline: false, match: (b) => /^AC10\d\d$/.test(ascii(b, 0, 6)) },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', inline: false,
    match: (b, name) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && /\.xlsx$/i.test(name),
  },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', inline: false,
    match: (b, name) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && /\.docx$/i.test(name),
  },
};

/** Profil = jenis + ukuran yang sah untuk satu kelompok pemakai (L3). */
const PROFILES = {
  evidence: { label: 'PDF, JPG, PNG, atau WebP', maxBytes: 10 * MB, types: ['pdf', 'jpg', 'png', 'webp'] },
  project: { label: 'PDF, JPG, PNG, WebP, DWG, XLSX, atau DOCX', maxBytes: 50 * MB, types: ['pdf', 'jpg', 'png', 'webp', 'dwg', 'xlsx', 'docx'] },
};

// HEIC (kamera iPhone) dikenali khusus supaya pesannya bisa menunjukkan jalan keluar
const isHeic = (b) => ascii(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 12));

/** Kembalikan jenis yang cocok, atau lempar pesan yang bisa dibaca pengguna. */
const detect = (buffer, originalName, profileName) => {
  const profile = PROFILES[profileName];
  if (isHeic(buffer)) {
    throw Object.assign(new Error('Foto HEIC (format bawaan iPhone) tidak didukung. Ubah Pengaturan › Kamera › Format ke "Most Compatible", atau kirim sebagai JPG/PDF.'), { statusCode: 400 });
  }
  const type = profile.types.map((t) => TYPES[t]).find((t) => t.match(buffer, originalName));
  if (!type) {
    throw Object.assign(new Error(`Jenis file tidak diterima. Yang diterima: ${profile.label}.`), { statusCode: 400 });
  }
  return type;
};

const isInline = (mimeType) => Object.values(TYPES).some((t) => t.mime === mimeType && t.inline);

module.exports = { PROFILES, detect, isInline };
