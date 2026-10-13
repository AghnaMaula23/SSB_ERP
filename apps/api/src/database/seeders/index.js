const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const { seedDivisiAlatDemo } = require('./divisi-alat.seed.js');
const { seedProjectDemo } = require('./project.seed.js');
// divisi-alat.seed.js jalan lewat service module, yang memakai singleton
// Prisma di src/config/database.js — koneksi terpisah dari `prisma` di atas,
// jadi ikut ditutup manual saat proses seed selesai (lihat main().finally di bawah).
const appPrisma = require('../../config/database.js');

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
  { module: 'user',       action: 'create', label: 'Buat akun user baru' },
  { module: 'role',       action: 'read',   label: 'Lihat daftar role' },
  { module: 'role',       action: 'create', label: 'Tambah role' },
  { module: 'role',       action: 'update', label: 'Ubah role dan permission-nya' },
  { module: 'role',       action: 'delete', label: 'Hapus role' },
  { module: 'permission', action: 'read',   label: 'Lihat daftar permission' },
  { module: 'permission', action: 'create', label: 'Tambah permission' },
  { module: 'permission', action: 'delete', label: 'Hapus permission' },
  // MODUL PROJECT — fondasi hampir semua modul lain.
  // Dipisah tiga modul permission karena aktornya beda: Admin memiliki header
  // project dan kontrak tahapan, Lapangan mencatat realisasi harian, dan
  // validasi progress adalah wewenang Admin yang TIDAK boleh dipegang pencatatnya.
  { module: 'project',     action: 'read',     label: 'Lihat project (construction, rental, supply)' },
  { module: 'project',     action: 'create',   label: 'Buat project baru' },
  { module: 'project',     action: 'update',   label: 'Ubah data dan status project' },
  { module: 'sub-project', action: 'read',     label: 'Lihat tahapan dan progress billing' },
  { module: 'sub-project', action: 'create',   label: 'Buat tahapan beserta kontraknya' },
  { module: 'sub-project', action: 'update',   label: 'Ubah kontrak dan status tahapan' },
  { module: 'progress',    action: 'read',     label: 'Lihat progress harian' },
  { module: 'progress',    action: 'create',   label: 'Catat dan ubah progress harian' },
  { module: 'progress',    action: 'validate', label: 'Validasi progress harian (Admin) — dasar tagihan klien' },
  { module: 'equipment-pool', action: 'read',    label: 'Lihat pool alat dan isinya' },
  { module: 'equipment-pool', action: 'create',  label: 'Buat pool alat baru' },
  { module: 'equipment-pool', action: 'update',  label: 'Ubah status pool, tambah/ikat/tutup item pool' },
  { module: 'allocation',     action: 'read',    label: 'Lihat alokasi alat ke tahapan' },
  { module: 'allocation',     action: 'create',  label: 'Alokasikan alat ke tahapan (Divisi Alat)' },
  { module: 'allocation',     action: 'receive', label: 'Konfirmasi alat diterima di lokasi (Lapangan)' },
  { module: 'allocation',     action: 'update',  label: 'Tutup alokasi: completed, returned, atau cancelled' },
  { module: 'equipment-request', action: 'read',    label: 'Lihat request alat' },
  { module: 'equipment-request', action: 'create',  label: 'Ajukan dan batalkan request alat' },
  { module: 'equipment-request', action: 'review',  label: 'Review Admin: teruskan atau tolak request alat internal' },
  { module: 'equipment-request', action: 'approve', label: 'Putuskan kuantitas request alat (Divisi Alat)' },
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
  // Purchase request: tiga aksi pertama milik Divisi Alat sebagai pengaju.
  // `validate` dan `approve` sengaja dipisah karena pemiliknya divisi berbeda —
  // dan super_admin TIDAK boleh memegang keduanya (lihat authorizeStrict).
  { module: 'purchase-request', action: 'read',     label: 'Lihat purchase request alat' },
  { module: 'purchase-request', action: 'create',   label: 'Ajukan purchase request alat' },
  { module: 'purchase-request', action: 'update',   label: 'Ubah dan batalkan purchase request sendiri' },
  { module: 'purchase-request', action: 'validate', label: 'Validasi purchase request (Admin)' },
  { module: 'purchase-request', action: 'approve',  label: 'Setujui dan cairkan purchase request (Finance)' },
  // Kas Alat. Pencatatan, bukan persetujuan — cash-out order lahir sendiri saat
  // Finance approve, jadi permission ini tidak memberi wewenang mencairkan dana.
  { module: 'cash', action: 'read',   label: 'Lihat saldo, kategori, dan transaksi Kas Alat' },
  { module: 'cash', action: 'create', label: 'Catat transaksi kas manual dan tambah kategori kas' },
  { module: 'cash', action: 'update', label: 'Ubah dan batalkan transaksi kas manual, ubah kategori kas' },
  { module: 'cash', action: 'delete', label: 'Hapus kategori kas yang belum terpakai' },
];

// Kategori kas Divisi Alat. Data master, bukan data demo — sistem tidak bisa
// membuat cash-out otomatis tanpa pemetaan orderCategory di bawah.
// Divisi Alat boleh menambah atau menonaktifkan kategori lain lewat API.
const CASH_CATEGORIES = [
  // Cash-in — tidak ada yang berasal dari purchase request
  { categoryName: 'Alokasi Dana dari Klaim Pendapatan', transactionType: 'cash_in',  orderCategory: null,          description: 'Dibuat sistem saat klaim pendapatan alat disetujui Finance' },
  { categoryName: 'Saldo Awal / Injeksi Dana',          transactionType: 'cash_in',  orderCategory: null,          description: 'Saldo pembuka dan penambahan dana langsung dari Finance' },
  { categoryName: 'Koreksi Masuk',                      transactionType: 'cash_in',  orderCategory: null,          description: 'Pengembalian dana order batal, koreksi selisih kas' },

  // Cash-out — tiga pertama dipetakan dari kategori order purchase request,
  // sehingga cash-out-nya terbentuk otomatis tanpa dipilih manual.
  { categoryName: 'Perbaikan Alat',                     transactionType: 'cash_out', orderCategory: 'repair',      description: 'Sparepart dan jasa untuk menangani kerusakan' },
  { categoryName: 'Perawatan Berkala',                  transactionType: 'cash_out', orderCategory: 'maintenance', description: 'Biaya servis terjadwal per aspek maintenance' },
  { categoryName: 'Stok Gudang',                        transactionType: 'cash_out', orderCategory: 'stock',       description: 'Pembelian persediaan gudang yang belum terikat unit' },
  { categoryName: 'Operasional Divisi',                 transactionType: 'cash_out', orderCategory: null,          description: 'Bukan biaya alat: perkakas, kebutuhan gudang, ATK. Sementara lewat manual_expense' },
  { categoryName: 'Koreksi Keluar',                     transactionType: 'cash_out', orderCategory: null,          description: 'Koreksi saldo yang tercatat kelebihan' },
];

// super_admin di-bypass di authorize(), tapi TIDAK di authorizeStrict() — dan
// permission-nya tetap diisi supaya GET /auth/me memantulkan hak akses yang
// sebenarnya ke frontend.
const ROLE_PERMISSIONS = {
  // super_admin memegang semua KECUALI dua aksi approval finansial. Ini bukan
  // kelalaian: keputusan 27 Sep 2026 menetapkan super_admin hanya memantau,
  // dan authorizeStrict() tidak mem-bypass-nya di endpoint itu.
  super_admin: PERMISSIONS
    .map((p) => `${p.module}:${p.action}`)
    .filter((key) => key !== 'purchase-request:validate' && key !== 'purchase-request:approve'),
  admin: [
    'user:read', 'role:read', 'permission:read',
    'equipment:read', 'workhour:read', 'maintenance:read', 'damage:read',
    'purchase-request:read', 'purchase-request:validate',
    'cash:read',
    // Admin pemilik project dan kontrak tahapan, dan satu-satunya yang boleh
    // memvalidasi progress — sengaja TANPA progress:create supaya pemeriksa
    // tidak bisa mengarang angka yang dia periksa sendiri.
    'project:read', 'project:create', 'project:update',
    'sub-project:read', 'sub-project:create', 'sub-project:update',
    'progress:read', 'progress:validate',
    'equipment-pool:read', 'allocation:read',
    // Admin mereview request internal, dan membuat sendiri request external
    // rental (yang karena itu melewati review Admin). Sengaja TANPA approve —
    // keputusan kuantitas milik Divisi Alat yang tahu ketersediaan unit.
    'equipment-request:read', 'equipment-request:create', 'equipment-request:review',
  ],
  // Finance hanya menyentuh sisi persetujuan dana, bukan operasional alat
  // `cash:read` dipakai layar approval untuk menampilkan proyeksi saldo setelah
  // pencairan. Finance tidak mencatat kas manual — itu milik Divisi Alat.
  // Finance perlu membaca kontrak dan progress karena keduanya dasar tagihan
  // klien yang akan dia proses di modul Income (Build Order langkah 6).
  finance: ['purchase-request:read', 'purchase-request:approve', 'equipment:read', 'cash:read',
    'project:read', 'sub-project:read', 'progress:read'],
  // Divisi Alat pemilik master alat; workhour hariannya diinput Lapangan
  divisi_alat: [
    'equipment:read', 'equipment:create', 'equipment:update', 'equipment:delete',
    'workhour:read', 'workhour:create',
    'maintenance:read', 'maintenance:create', 'maintenance:update', 'maintenance:delete',
    'damage:read', 'damage:create', 'damage:update',
    // Sengaja tanpa validate/approve — pengaju tidak boleh menyetujui sendiri
    'purchase-request:read', 'purchase-request:create', 'purchase-request:update',
    // Divisi Alat pemilik Kas Alat: mencatat pengeluaran tak terduga, membuka
    // saldo, dan mengoreksi. Prerogatifnya, tanpa approval — keputusan 25 Sep.
    'cash:read', 'cash:create', 'cash:update', 'cash:delete',
    // Divisi Alat perlu melihat project dan tahapannya untuk menempatkan alat
    'project:read', 'sub-project:read',
    // Divisi Alat pemilik equipment pool dan yang mengalokasikan ke tahapan —
    // sengaja TANPA allocation:receive, itu wewenang Lapangan yang menerima
    // fisik unitnya di lokasi.
    'equipment-pool:read', 'equipment-pool:create', 'equipment-pool:update',
    'allocation:read', 'allocation:create', 'allocation:update',
    // Divisi Alat memutuskan kuantitas; tidak mengajukan dan tidak mereview Admin
    'equipment-request:read', 'equipment-request:approve',
  ],
  // Lapangan boleh melihat jadwal servis alat yang mereka pakai, tapi tidak mengelolanya
  // Lapangan belum boleh mencatat kerusakan — laporan masuk lewat telepon ke
  // Divisi Alat. Membuka aksesnya nanti cukup menambah 'damage:create' di sini.
  // Lapangan pencatat realisasi harian — TANPA progress:validate. Yang mencatat
  // tidak memvalidasi; pemisahan yang sama dengan pengaju purchase request yang
  // tidak boleh menyetujui pengajuannya sendiri.
  lapangan: ['equipment:read', 'workhour:read', 'workhour:create', 'maintenance:read', 'damage:read',
    'project:read', 'sub-project:read', 'progress:read', 'progress:create',
    // Lapangan yang menerima unit di lokasi — sengaja TANPA allocation:create,
    // yang mengalokasikan adalah Divisi Alat.
    'equipment-pool:read', 'allocation:read', 'allocation:receive',
    // Lapangan pengaju request internal — tanpa review/approve
    'equipment-request:read', 'equipment-request:create'],
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

  // User demo per role. Tanpa ini alur persetujuan purchase request TIDAK BISA
  // diuji sama sekali: super_admin sengaja tidak memegang validate/approve,
  // jadi hanya user ber-role admin dan finance yang bisa menjalankannya.
  console.log('Seeding user demo per role...');
  const DEMO_USERS = [
    { username: 'admin',   fullName: 'Admin Kantor',      email: 'admin.kantor@ssb-inc.com', role: 'admin' },
    { username: 'finance', fullName: 'Staf Finance',      email: 'finance@ssb-inc.com',      role: 'finance' },
    { username: 'alat',    fullName: 'Staf Divisi Alat',  email: 'divisi.alat@ssb-inc.com',  role: 'divisi_alat' },
    { username: 'lapangan',fullName: 'Staf Lapangan',     email: 'lapangan@ssb-inc.com',     role: 'lapangan' },
  ];

  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { username: demo.username },
      update: {},
      create: {
        username: demo.username,
        email: demo.email,
        password,
        fullName: demo.fullName,
      },
    });
    const role = await prisma.role.findUnique({ where: { code: demo.role } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log('Seeding kategori kas...');
  for (const category of CASH_CATEGORIES) {
    await prisma.equipmentCashCategory.upsert({
      where: {
        categoryName_transactionType: {
          categoryName: category.categoryName,
          transactionType: category.transactionType,
        },
      },
      update: { description: category.description, orderCategory: category.orderCategory },
      create: category,
    });
  }

  console.log('Seeding demo data Divisi Alat...');
  await seedDivisiAlatDemo(admin.id);

  // Dijalankan SETELAH Divisi Alat: seeder Project memasukkan unit alat ke pool
  // dan mencatat jam kerjanya, jadi butuh master alat sudah ada.
  await seedProjectDemo(admin.id);

  console.log('Seed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });
