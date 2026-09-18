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

// Permission untuk modul yang sudah jalan (access control).
// Tambahkan permission modul lain saat modulnya dibangun.
const PERMISSIONS = [
  { module: 'user',       action: 'read',   label: 'Lihat daftar user' },
  { module: 'user',       action: 'update', label: 'Kelola role user' },
  { module: 'role',       action: 'read',   label: 'Lihat daftar role' },
  { module: 'role',       action: 'create', label: 'Tambah role' },
  { module: 'role',       action: 'update', label: 'Ubah role dan permission-nya' },
  { module: 'role',       action: 'delete', label: 'Hapus role' },
  { module: 'permission', action: 'read',   label: 'Lihat daftar permission' },
  { module: 'permission', action: 'create', label: 'Tambah permission' },
  { module: 'permission', action: 'delete', label: 'Hapus permission' },
  { module: 'equipment',  action: 'read',   label: 'Lihat master alat' },
  { module: 'equipment',  action: 'create', label: 'Tambah jenis/unit alat' },
  { module: 'equipment',  action: 'update', label: 'Ubah data dan status alat' },
  { module: 'equipment',  action: 'delete', label: 'Hapus jenis alat / nonaktifkan unit alat' },
  { module: 'workhour',   action: 'read',   label: 'Lihat log jam kerja alat' },
  { module: 'workhour',   action: 'create', label: 'Catat jam kerja alat' },
  { module: 'maintenance', action: 'read',   label: 'Lihat aspek, setting, dan riwayat maintenance' },
  { module: 'maintenance', action: 'create', label: 'Tambah aspek, setting, dan riwayat maintenance' },
  { module: 'maintenance', action: 'update', label: 'Ubah setting maintenance dan batalkan riwayat' },
  { module: 'maintenance', action: 'delete', label: 'Hapus aspek dan setting maintenance' },
  { module: 'damage',      action: 'read',   label: 'Lihat laporan kerusakan alat' },
  { module: 'damage',      action: 'create', label: 'Catat laporan kerusakan alat' },
  { module: 'damage',      action: 'update', label: 'Ubah, selesaikan, dan batalkan laporan kerusakan' },
];

// super_admin di-bypass di middleware authorize(), tapi permission-nya tetap
// diisi supaya GET /auth/me memantulkan hak akses yang sebenarnya ke frontend.
const ROLE_PERMISSIONS = {
  super_admin: PERMISSIONS.map((p) => `${p.module}:${p.action}`),
  admin: ['user:read', 'role:read', 'permission:read', 'equipment:read', 'workhour:read', 'maintenance:read', 'damage:read'],
  // Divisi Alat pemilik master alat; workhour hariannya diinput Lapangan
  divisi_alat: [
    'equipment:read', 'equipment:create', 'equipment:update', 'equipment:delete',
    'workhour:read', 'workhour:create',
    'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:delete',
    'damage:read', 'damage:create', 'damage:update',
  ],
  // Lapangan boleh melihat jadwal servis alat yang mereka pakai, tapi tidak mengelolanya
  // Lapangan belum boleh mencatat kerusakan — laporan masuk lewat telepon ke
  // Divisi Alat. Membuka aksesnya nanti cukup menambah 'damage:create' di sini.
  lapangan: ['equipment:read', 'workhour:read', 'workhour:create', 'maintenance:read', 'damage:read'],
};

async function main() {
  console.log('Seeding roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }

  console.log('Seeding permissions...');
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { module_action: { module: permission.module, action: permission.action } },
      update: { label: permission.label },
      create: permission,
    });
  }

  console.log('Mapping permissions to roles...');
  const allPermissions = await prisma.permission.findMany();
  const permissionByKey = new Map(allPermissions.map((p) => [`${p.module}:${p.action}`, p]));

  for (const [roleCode, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
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
