const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');

const shapePermission = (p) => ({
  id: p.id,
  module: p.module,
  action: p.action,
  label: p.label,
  key: `${p.module}:${p.action}`,
});

/**
 * Katalog permission ukurannya kecil dan UI butuh semuanya sekaligus
 * (matrix role x permission), jadi list-nya tidak dipaginate.
 */
const list = async ({ module, grouped }) => {
  const rows = await prisma.permission.findMany({
    where: { ...(module && { module }) },
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
  });

  const items = rows.map(shapePermission);
  if (!grouped) return items;

  return Object.values(
    items.reduce((acc, item) => {
      acc[item.module] ??= { module: item.module, permissions: [] };
      acc[item.module].permissions.push(item);
      return acc;
    }, {})
  );
};

const create = async ({ module, action, label }) => {
  const exists = await prisma.permission.findUnique({
    where: { module_action: { module, action } },
  });
  if (exists) throw httpError(`Permission "${module}:${action}" sudah ada`, 409);

  const permission = await prisma.permission.create({ data: { module, action, label } });
  return shapePermission(permission);
};

const remove = async (id) => {
  const permission = await prisma.permission.findUnique({
    where: { id },
    include: { _count: { select: { roles: true } } },
  });
  if (!permission) throw httpError('Permission tidak ditemukan', 404);

  // Lepas dulu dari semua role supaya tidak kena foreign key error
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { permissionId: id } }),
    prisma.permission.delete({ where: { id } }),
  ]);

  return { id, key: `${permission.module}:${permission.action}`, detachedFromRoles: permission._count.roles };
};

module.exports = { list, create, remove };
