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

const checkPermission = (req, res, next, required, allowSuperAdminBypass) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });

  if (req.user.roles.includes('super_admin')) {
    if (allowSuperAdminBypass) return next();
    // Pemisahan wewenang mengalahkan bypass. Pesannya dibedakan supaya
    // super_admin tahu ini kebijakan, bukan permission yang lupa diberikan.
    if (!required.some(p => req.user.permissions.includes(p))) {
      return res.status(403).json({
        success: false,
        message: 'super_admin hanya memantau dan tidak menyetujui transaksi keuangan. Aksi ini milik role yang berwenang.',
      });
    }
    return next();
  }

  if (!required.some(p => req.user.permissions.includes(p))) {
    return res.status(403).json({ success: false, message: 'Tidak memiliki akses' });
  }
  next();
};

/** Pengecekan permission normal — super_admin di-bypass. */
const authorize = (...required) => (req, res, next) =>
  checkPermission(req, res, next, required, true);

/**
 * Untuk endpoint yang menuntut pemisahan wewenang: validasi Admin dan approval
 * Finance pada purchase request. super_admin TIDAK di-bypass di sini — dia harus
 * benar-benar memegang permission-nya, dan by design tidak memegangnya.
 * Keputusan 27 September 2026: super_admin hanya memantau.
 */
const authorizeStrict = (...required) => (req, res, next) =>
  checkPermission(req, res, next, required, false);

module.exports = { authenticate, authorize, authorizeStrict };
