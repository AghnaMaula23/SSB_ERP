const jwt = require('jsonwebtoken');
const prisma = require('../config/database.js');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userRoles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User tidak aktif' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      employeeId: user.employeeId,
      roles: user.userRoles.map(ur => ur.role.code),
      permissions: [...new Set(
        user.userRoles.flatMap(ur =>
          ur.role.permissions.map(rp => `${rp.permission.module}:${rp.permission.action}`)
        )
      )]
    };
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

module.exports = { authenticate, authorize };
