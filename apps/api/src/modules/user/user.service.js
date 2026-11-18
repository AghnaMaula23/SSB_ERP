const bcrypt = require('bcryptjs');
const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');

const SUPER_ADMIN = 'super_admin';

const userInclude = {
  userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  employee: { select: { id: true, employeeCode: true, fullName: true } },
};

// Jangan pernah kirim kolom password keluar dari service ini
const shapeUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  isActive: user.isActive,
  employeeId: user.employeeId,
  employee: user.employee ?? null,
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

/**
 * Kebijakan 15 Okt 2026 (2b): super_admin read-only, tapi bisa CRUD akun. Dua
 * kunci supaya ia tidak bisa memberi dirinya hak tulis:
 * 1. Tidak ada yang boleh mengubah role AKUNNYA SENDIRI — perubahan role selalu
 *    dilakukan orang lain.
 * 2. Role super_admin EKSKLUSIF: tidak bisa digabung dengan role lain, sehingga
 *    dua super_admin pun tidak bisa saling memberi role operasional.
 */
const assertNotSelf = (userId, actorId) => {
  if (userId === actorId) throw httpError('Role akun sendiri tidak bisa diubah. Minta super_admin lain melakukannya.', 403);
};

const assertSuperAdminExclusive = (roleCodes) => {
  if (roleCodes.includes(SUPER_ADMIN) && roleCodes.length > 1) {
    throw httpError('Role super_admin tidak bisa digabung dengan role lain — super_admin hanya memantau dan mengelola akun', 409);
  }
};

// Replace seluruh role user sekaligus
const setRoles = async (userId, roleIds, actorId) => {
  assertNotSelf(userId, actorId);
  await findUserOrFail(userId);
  const unique = [...new Set(roleIds)];

  const roles = await prisma.role.findMany({ where: { id: { in: unique } } });
  const missing = unique.filter((id) => !roles.some((r) => r.id === id));
  if (missing.length) throw httpError(`Role tidak ditemukan: ${missing.join(', ')}`, 404);

  assertSuperAdminExclusive(roles.map((r) => r.code));
  await assertNotLastSuperAdmin(userId, roles.map((r) => r.code));

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    ...(unique.length
      ? [prisma.userRole.createMany({ data: unique.map((roleId) => ({ userId, roleId })) })]
      : []),
  ]);

  return shapeUser(await findUserOrFail(userId));
};

const addRole = async (userId, roleId, actorId) => {
  assertNotSelf(userId, actorId);
  await findUserOrFail(userId);
  const role = await findRoleOrFail(roleId);
  if (!role.isActive) throw httpError(`Role "${role.code}" sedang nonaktif`, 409);

  const current = await prisma.userRole.findMany({ where: { userId }, include: { role: { select: { code: true } } } });
  assertSuperAdminExclusive([...current.map((ur) => ur.role.code), role.code]);

  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
  if (exists) throw httpError('User sudah memiliki role ini', 409);

  await prisma.userRole.create({ data: { userId, roleId } });
  return shapeUser(await findUserOrFail(userId));
};

const removeRole = async (userId, roleId, actorId) => {
  assertNotSelf(userId, actorId);
  await findUserOrFail(userId);
  const role = await findRoleOrFail(roleId);

  const exists = await prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
  if (!exists) throw httpError('User tidak memiliki role ini', 404);

  if (role.code === SUPER_ADMIN) await assertNotLastSuperAdmin(userId, []);

  await prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
  return shapeUser(await findUserOrFail(userId));
};

/**
 * Tautkan akun ke karyawan tetap (plan Finance F26): "akun ini milik karyawan itu".
 * null melepas tautan. Satu karyawan satu akun — unique users.employee_id menjadi
 * jaring terakhir kalau dua permintaan bersamaan lolos pengecekan (P2002 → 409).
 */
const setEmployee = async (userId, employeeId) => {
  await findUserOrFail(userId);
  if (employeeId !== null) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: { select: { id: true, username: true } } } });
    if (!employee) throw httpError(`Karyawan dengan ID ${employeeId} tidak ditemukan`, 404);
    if (employee.user && employee.user.id !== userId) {
      throw httpError(`Karyawan ${employee.employeeCode} ${employee.fullName} sudah tertaut ke akun ${employee.user.username}`, 409);
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { employeeId } });
  return shapeUser(await findUserOrFail(userId));
};

/**
 * Ubah data akun: nama, email, aktif/nonaktif, dan reset password. Akun tidak
 * dihapus — terlalu banyak dokumen merujuk pembuatnya — jadi "hapus" = nonaktif.
 * Akun sendiri tidak bisa dinonaktifkan, dan super_admin aktif terakhir tidak
 * boleh hilang (sama dengan aturan role di atas).
 */
const update = async (userId, { fullName, email, isActive, password }, actorId) => {
  const user = await findUserOrFail(userId);
  if (isActive === false && userId === actorId) throw httpError('Akun sendiri tidak bisa dinonaktifkan', 403);
  if (isActive === false && user.isActive && user.userRoles.some((ur) => ur.role.code === SUPER_ADMIN)) {
    const activeSuperAdmins = await prisma.userRole.count({ where: { role: { code: SUPER_ADMIN }, user: { isActive: true } } });
    if (activeSuperAdmins <= 1) throw httpError('super_admin aktif terakhir tidak bisa dinonaktifkan', 409);
  }
  if (email && email !== user.email) {
    const taken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw httpError('Email sudah dipakai akun lain', 409);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(fullName !== undefined && { fullName: fullName.trim() }),
      ...(email !== undefined && { email: email.trim() }),
      ...(isActive !== undefined && { isActive }),
      ...(password && { password: await bcrypt.hash(password, 12) }),
    },
  });
  return shapeUser(await findUserOrFail(userId));
};

module.exports = { list, getById, update, setRoles, addRole, removeRole, setEmployee };
