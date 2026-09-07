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

const authorize = (...required) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Tidak terautentikasi' });
    if (req.user.roles.includes('super_admin')) return next();
    const has = required.some(p => req.user.permissions.includes(p));
    if (!has) return res.status(403).json({ success: false, message: 'Tidak memiliki akses' });
    next();
  };
};

module.exports = { authenticate, authorize };
