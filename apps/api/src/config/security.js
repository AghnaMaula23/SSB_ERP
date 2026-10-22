/**
 * Pemeriksaan konfigurasi keamanan saat server dinyalakan. Gagal di sini lebih
 * baik daripada berjalan dengan konfigurasi yang bisa dibobol.
 */

// HS256 dengan secret pendek bisa dipecahkan OFFLINE dari satu token yang bocor,
// lalu dipakai memalsukan token super_admin. 32 karakter acak = batas bawah wajar.
const MIN_JWT_SECRET_LENGTH = 32;

const assertSecurityConfig = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET belum diisi di .env');

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    const msg = `JWT_SECRET hanya ${secret.length} karakter (minimal ${MIN_JWT_SECRET_LENGTH}). ` +
      'Buat yang baru: openssl rand -base64 48';
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    console.warn(`[SECURITY] ${msg}`);
  }
};

module.exports = { assertSecurityConfig };
