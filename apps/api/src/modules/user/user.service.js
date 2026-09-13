const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');

const SUPER_ADMIN = 'super_admin';

const userInclude = {
  userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
};

// Jangan pernah kirim kolom password keluar dari service ini
const shapeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  isActive: user.isActive,
  employeeId: user.employeeId,
  createdAt: user.createdAt,
  roles: user.userRoles.map((ur) => ({
    id: ur.role.id,
    code: ur.role.code,
    name: ur.role.name,
  })),
  permissions: [...new Set(
    user.userRoles.flatMap((ur) =>
      ur.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`)
    )
  )],
});

const findUserOrFail = async (id) => {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw httpError('User tidak ditemukan', 404);
  return user;
};

const findRoleOrFail = async (id) => {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw httpError(`Role dengan ID ${id} tidak ditemukan`, 404);
  return role;
};

const list = async ({ page = 1, limit = 20, search, isActive, roleCode }) => {
  const where = {
    ...(search && {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(isActive !== undefined && { isActive }),
    ...(roleCode && { userRoles: { some: { role: { code: roleCode } } } }),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { data: rows.map(shapeUser), total, page, limit };
};

const getById = async (id) => shapeUser(await findUserOrFail(id));

/**
 * Cegah sistem kehilangan super_admin terakhir — kalau sampai terjadi,
 * tidak ada lagi yang bisa mengelola role dan permission.
 */
const assertNotLastSuperAdmin = async (userId, roleCodesAfter) => {
  const current = await prisma.userRole.findFirst({
    where: { userId, role: { code: SUPER_ADMIN } },
  });
  if (!current || roleCodesAfter.includes(SUPER_ADMIN)) return;

  const superAdminCount = await prisma.userRole.count({
    where: { role: { code: SUPER_ADMIN }, user: { isActive: true } },
  });
  if (superAdminCount <= 1) {
    throw httpError('Tidak bisa melepas role super_admin dari user super_admin aktif terakhir', 409);
  }
};

// Replace seluruh role user sekaligus
const setRoles = async (userId, roleIds) => {
  await findUserOrFail(userId);
  const unique = [...new Set(roleIds)];

  const roles = await prisma.role.findMany({ where: { id: { in: unique } } });
  const missing = unique.filter((id) => !roles.some((r) => r.id === id));
  if (missing.length) throw httpError(`Role tidak ditemukan: ${missing.join(', ')}`, 404);

  await assertNotLastSuperAdmin(userId, roles.map((r) => r.code));

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    ...(unique.length
      ? [prisma.userRole.createMany({ data: unique.map((roleId) => ({ userId, roleId })) })]
      : []),
  ]);

  return shapeUser(await findUserOrFail(userId));
};

const addRole = async (userId, roleId) => {
  await findUserOrFail(userId);
  const role = await findRoleOrFail(roleId);
  if (!role.isActive) throw httpError(`Role "${role.code}" sedang nonaktif`, 409);

  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
  if (exists) throw httpError('User sudah memiliki role ini', 409);

  await prisma.userRole.create({ data: { userId, roleId } });
  return shapeUser(await findUserOrFail(userId));
};

const removeRole = async (userId, roleId) => {
  await findUserOrFail(userId);
  const role = await findRoleOrFail(roleId);

  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
  if (!exists) throw httpError('User tidak memiliki role ini', 404);

  if (role.code === SUPER_ADMIN) await assertNotLastSuperAdmin(userId, []);

  await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
  return shapeUser(await findUserOrFail(userId));
};

module.exports = { list, getById, setRoles, addRole, removeRole };
