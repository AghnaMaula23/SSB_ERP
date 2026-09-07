const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const ROLES = [
  { code: 'super_admin',  name: 'Super Admin' },
  { code: 'admin',        name: 'Admin Kantor' },
  { code: 'finance',      name: 'Finance' },
  { code: 'divisi_alat',  name: 'Divisi Alat' },
  { code: 'lapangan',     name: 'Divisi Lapangan' },
];

async function main() {
  console.log('Seeding roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
  }

  console.log('Seeding super admin user...');
  const password = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'admin@ssb-inc.com',
      password,
      fullName: 'Super Administrator',
    },
  });

  const superRole = await prisma.role.findUnique({ where: { code: 'super_admin' } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superRole.id },
  });

  console.log('Seed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
