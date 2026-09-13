const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');

// Role bawaan sistem — tidak boleh dihapus / dinonaktifkan
const PROTECTED_ROLES = ['super_admin'];

const roleWithPermissions = {
  permissions: { include: { permission: true } },
  _count: { select: { userRoles: true } },
};

// Bentuk response role yang konsisten dipakai semua endpoint role
const shapeRole = (role) => ({
  id: role.id,
  code: role.code,
  name: role.name,
  description: role.description,
  isActive: role.isActive,
  createdAt: role.createdAt,
  userCount: role._count?.userRoles ?? 0,
  permissions: (role.permissions || []).map((rp) => ({
    id: rp.permission.id,
    module: rp.permission.module,
    action: rp.permission.action,
    label: rp.permission.label,
    key: `${rp.permission.module}:${rp.permission.action}`,
  })),
});

const findRoleOrFail = async (id) => {
  const role = await prisma.role.findUnique({ where: { id }, include: roleWithPermissions });
  if (!role) throw httpError('Role tidak ditemukan', 404);
  return role;
};

const list = async ({ page = 1, limit = 20, search, isActive }) => {
  const where = {
    ...(search && {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(isActive !== undefined && { isActive }),
  };

  const [rows, total] = await Promise.all([
    prisma.role.findMany({
      where,
      include: roleWithPermissions,
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.role.count({ where }),
  ]);

  return { data: rows.map(shapeRole), total, page, limit };
};

const getById = async (id) => shapeRole(await findRoleOrFail(id));

const create = async ({ code, name, description }) => {
  const exists = await prisma.role.findUnique({ where: { code } });
  if (exists) throw httpError(`Role dengan kode "${code}" sudah ada`, 409);

  const role = await prisma.role.create({
    data: { code, name, description },
    include: roleWithPermissions,
  });
  return shapeRole(role);
};

// Catatan: `code` sengaja immutable — dipakai sebagai acuan authorize() dan seeder.
const update = async (id, { name, description, isActive }) => {
  const role = await findRoleOrFail(id);

  if (isActive === false && PROTECTED_ROLES.includes(role.code)) {
    throw httpError(`Role "${role.code}" adalah role sistem dan tidak bisa dinonaktifkan`, 409);
  }

  const updated = await prisma.role.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
    },
    include: roleWithPermissions,
  });
  return shapeRole(updated);
};

const remove = async (id) => {
  const role = await findRoleOrFail(id);

  if (PROTECTED_ROLES.includes(role.code)) {
    throw httpError(`Role "${role.code}" adalah role sistem dan tidak bisa dihapus`, 409);
  }
  if (role._count.userRoles > 0) {
    throw httpError(
      `Role masih dipakai ${role._count.userRoles} user. Lepas role dari user tersebut terlebih dahulu.`,
      409
    );
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);

  return { id, code: role.code };
};

const assertPermissionsExist = async (permissionIds) => {
  const found = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { id: true },
  });
  const foundIds = found.map((p) => p.id);
  const missing = permissionIds.filter((id) => !foundIds.includes(id));
  if (missing.length) throw httpError(`Permission tidak ditemukan: ${missing.join(', ')}`, 404);
};

// Replace seluruh permission milik role (bulk set dari halaman matrix permission)
const setPermissions = async (roleId, permissionIds) => {
  await findRoleOrFail(roleId);
  const unique = [...new Set(permissionIds)];
  if (unique.length) await assertPermissionsExist(unique);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    ...(unique.length
      ? [prisma.rolePermission.createMany({ data: unique.map((permissionId) => ({ roleId, permissionId })) })]
      : []),
  ]);

  return shapeRole(await findRoleOrFail(roleId));
};

const addPermission = async (roleId, permissionId) => {
  await findRoleOrFail(roleId);
  await assertPermissionsExist([permissionId]);

  const exists = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId } },
  });
  if (exists) throw httpError('Permission sudah dimiliki role ini', 409);

  await prisma.rolePermission.create({ data: { roleId, permissionId } });
  return shapeRole(await findRoleOrFail(roleId));
};

const removePermission = async (roleId, permissionId) => {
  await findRoleOrFail(roleId);

  const exists = await prisma.rolePermission.findUnique({
    where: { roleId_permissionId: { roleId, permissionId } },
  });
  if (!exists) throw httpError('Permission tidak dimiliki role ini', 404);

  await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId, permissionId } } });
  return shapeRole(await findRoleOrFail(roleId));
};

module.exports = {
  list, getById, create, update, remove,
  setPermissions, addPermission, removePermission,
};
