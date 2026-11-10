const jwt = require('jsonwebtoken');
const prisma = require('../config/database.js');

// Setiap request API lewat sini. Dulu include berlapis = 5 query per request,
// sehingga lewat pooler Supabase cek login saja memakan ratusan ms. Sekarang satu
// JOIN, lalu disimpan sebentar. Perubahan akun lewat API langsung membersihkan cache
// (clearAuthCacheOnWrite); selain itu perubahan berlaku paling lambat AUTH_CACHE_MS.
const AUTH_CACHE_MS = 30_000;
const sessionCache = new Map();

const clearAuthCache = () => sessionCache.clear();

/** Pasang di route manajemen akun: tulis yang berhasil langsung berlaku. */
const clearAuthCacheOnWrite = (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => { if (res.statusCode < 400) clearAuthCache(); });
  }
  next();
};

const loadSessionUser = async (userId) => {
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const rows = await prisma.$queryRaw`
    SELECT u.id, u.username, u.email, u.full_name, u.employee_id, u.is_active,
      r.code AS role_code, p.module, p.action
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = ${userId}`;
  if (!rows.length || !rows[0].is_active) {
    sessionCache.delete(userId);
    return null;
  }

  const [first] = rows;
  const user = {
    id: first.id,
    username: first.username,
    email: first.email,
    fullName: first.full_name,
    employeeId: first.employee_id,
    roles: [...new Set(rows.map((row) => row.role_code).filter(Boolean))],
    permissions: [...new Set(rows.filter((row) => row.module).map((row) => `${row.module}:${row.action}`))],
  };
  sessionCache.set(userId, { user, expiresAt: Date.now() + AUTH_CACHE_MS });
  return user;
};

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await loadSessionUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User tidak aktif' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

/**
 * Pengecekan permission. TIDAK ADA bypass untuk role mana pun, termasuk
 * super_admin (kebijakan 15 Okt 2026): super_admin hanya memegang `*:read` di
 * semua modul plus CRUD manajemen akun (user, role, permission) — semuanya
 * didefinisikan sebagai permission biasa di seeder. Sebelumnya super_admin
 * mem-bypass authorize() dan hanya dikecualikan lewat authorizeStrict() di dua
 * aksi Finance; pola "bypass lalu kecualikan" itu dibuang supaya kebijakannya
 * hidup di satu tempat (daftar permission), bukan tersebar di route.
 */
const authorize = (...required) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
  if (required.some((p) => req.user.permissions.includes(p))) return next();

  // Pesan dibedakan supaya super_admin tahu ini kebijakan, bukan permission
  // yang lupa diberikan.
  const message = req.user.roles.includes('super_admin')
    ? 'super_admin hanya bisa melihat data dan mengelola akun sistem. Aksi ini milik role operasional yang berwenang.'
    : 'Tidak memiliki akses';
  return res.status(403).json({ success: false, message });
};

module.exports = { authenticate, authorize, clearAuthCacheOnWrite };
