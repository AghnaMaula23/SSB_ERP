// Data demo alur kerja lintas modul — supaya setiap antrean Approval Center dan
// layar modul Project punya isi, termasuk riwayat keputusan (diteruskan,
// disetujui, ditolak beserta alasannya).
//
// Filosofi sama dengan seeder lain: SEMUA lewat service yang dipakai controller.
// Bedanya, setiap langkah dijalankan AKTOR yang benar (Lapangan mengajukan, Admin
// memvalidasi, Finance memutuskan). Itu wajib, bukan kosmetik: service menolak
// orang yang memutuskan dokumennya sendiri, dan antrean menyembunyikan dokumen
// yang diajukan/diteruskan user itu sendiri.
//
// Idempoten PER BAGIAN (pola material.seed.js): database dev dipakai bersama,
// jadi tiap bagian memeriksa penandanya sendiri dan tidak pernah menghapus apa
// pun. Bagian yang gagal dicatat lalu dilewati — bagian lain tetap jalan.
//
// Tidak dibuat di sini: delivery & penerimaan material (butuh unggah file ke
// storage) dan klaim upah (modulnya belum ada).
const prisma = require('../../config/database.js');
const cashSvc = require('../../modules/divisi-alat/cash.service.js');
const prSvc = require('../../modules/divisi-alat/purchase-request.service.js');
const materialRequestSvc = require('../../modules/request-material/request-material.service.js');
const equipmentRequestSvc = require('../../modules/request-alat/request-alat.service.js');
const progressSvc = require('../../modules/project/progress.service.js');
const stockSvc = require('../../modules/request-material/material-stock.service.js');
const workerSvc = require('../../modules/labor/worker.service.js');
const assignmentSvc = require('../../modules/labor/worker-assignment.service.js');
const laborLogSvc = require('../../modules/labor/labor-log.service.js');
const projectFileSvc = require('../../modules/project-file/project-file.service.js');

// Penanda baris buatan seeder ini — dipakai untuk memeriksa "sudah pernah jalan".
const MARK = '[demo]';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** User demo beserta permission-nya, bentuk sama dengan req.user dari middleware auth. */
async function loadActor(username) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user) throw new Error(`User demo "${username}" tidak ada — jalankan seed utama dulu`);
  return {
    id: user.id,
    roles: user.userRoles.map((ur) => ur.role.code),
    permissions: [...new Set(user.userRoles.flatMap((ur) =>
      ur.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`)))],
  };
}

async function section(name, fn) {
  try {
    const result = await fn();
    console.log(`  - ${name}: ${result}`);
  } catch (err) {
    console.log(`  - ${name}: GAGAL, dilewati (${err.message})`);
  }
}

const materialIds = async (codes) => {
  const rows = await prisma.materialType.findMany({ where: { materialCode: { in: codes } } });
  const byCode = new Map(rows.map((r) => [r.materialCode, r.id]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new Error(`jenis material belum ada: ${missing.join(', ')}`);
  return byCode;
};

const equipmentTypeIds = async (codes) => {
  const rows = await prisma.equipmentType.findMany({ where: { typeCode: { in: codes } } });
  const byCode = new Map(rows.map((r) => [r.typeCode, r.id]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) throw new Error(`jenis alat belum ada: ${missing.join(', ')}`);
  return byCode;
};

// ─────────────────────────────────────────────────────────────────────────
// Kas Alat — saldo pembuka, supaya layar approval PR Finance menampilkan
// proyeksi saldo yang masuk akal.
// ─────────────────────────────────────────────────────────────────────────
async function seedCash(alat) {
  if (await prisma.equipmentCashTransaction.count({ where: { description: { startsWith: MARK } } })) return 'sudah ada';
  const category = (name, type) => prisma.equipmentCashCategory.findUnique({
    where: { categoryName_transactionType: { categoryName: name, transactionType: type } },
  });
  const opening = await category('Saldo Awal / Injeksi Dana', 'cash_in');
  const ops = await category('Operasional Divisi', 'cash_out');
  if (!opening || !ops) throw new Error('kategori kas belum di-seed');

  await cashSvc.createTransaction({
    transactionDate: daysAgo(30), transactionType: 'cash_in', categoryId: opening.id, amount: 75000000,
    sourceType: 'opening_balance', description: `${MARK} Saldo awal Kas Alat Oktober`,
  }, alat.id);
  await cashSvc.createTransaction({
    transactionDate: daysAgo(6), transactionType: 'cash_out', categoryId: ops.id, amount: 1250000,
    sourceType: 'manual_expense', description: `${MARK} Kunci torsi & perkakas bengkel lapangan`,
  }, alat.id);
  return 'saldo awal Rp 75 jt + 1 pengeluaran operasional';
}

// ─────────────────────────────────────────────────────────────────────────
// Purchase request — antrean Finance (belum ada sama sekali) + riwayat.
// ─────────────────────────────────────────────────────────────────────────
async function seedPurchaseRequests(alat, admin, finance) {
  const done = await prisma.equipmentPurchaseStockItem.count({ where: { itemName: { startsWith: MARK } } });
  if (done) return 'sudah ada';

  const stock = (name, quantity, price) => ({ itemName: `${MARK} ${name}`, quantity, estimatedUnitPrice: price });
  const createStock = (items, day) =>
    prSvc.create({ requestDate: daysAgo(day), orderCategory: 'stock', stockItems: items }, alat.id);

  // 1. Menunggu Finance — divalidasi Admin dengan catatan
  const waiting = await createStock([
    stock('Oli Mesin SAE 15W-40 (drum 209 L)', 2, 4500000),
    stock('Filter oli Komatsu 6736-51-5142', 6, 185000),
  ], 4);
  await prSvc.validateByAdmin(waiting.id, admin.id, 'Stok oli gudang tinggal 1 drum, perlu untuk servis 4 unit minggu depan.');

  // 2. Menunggu Finance — maintenance pada aspek yang sudah mendekati jatuh tempo
  let maintenanceNote = 'tanpa PR maintenance (tidak ada aspek jatuh tempo yang bebas)';
  const settings = await prisma.equipmentMaintenanceSetting.findMany({
    where: {
      isActive: true,
      status: { in: ['warning', 'due', 'overdue'] },
      purchaseMaintenanceItems: { none: { purchaseRequest: { status: { in: ['submitted', 'waiting_finance_approval'] } } } },
    },
    take: 2,
    orderBy: { id: 'asc' },
  });
  if (settings.length) {
    const pr = await prSvc.create({
      requestDate: daysAgo(3),
      orderCategory: 'maintenance',
      maintenanceItems: settings.map((s, i) => ({ maintenanceSettingId: s.id, estimatedPrice: i === 0 ? 1350000 : 850000 })),
    }, alat.id);
    await prSvc.validateByAdmin(pr.id, admin.id);
    maintenanceNote = `PR maintenance ${settings.length} aspek`;
  }

  // 3. Disetujui Finance dengan nominal AKTUAL (lebih kecil dari estimasi) → cash-out otomatis
  const approved = await createStock([stock('Grease EP2 (pail 18 kg)', 3, 950000)], 9);
  await prSvc.validateByAdmin(approved.id, admin.id);
  const [line] = await prisma.equipmentPurchaseStockItem.findMany({ where: { purchaseRequestId: approved.id } });
  await prSvc.approve(approved.id, {
    approvedStockItems: [{ itemId: line.id, approvedTotalPrice: 2700000 }],
    notes: 'Dapat harga Rp 900 rb/pail dari toko langganan.',
  }, finance.id);

  // 4. Ditolak Admin & 5. ditolak Finance — supaya alasan keputusan tampil ke pengaju
  const rejectedByAdmin = await createStock([stock('Ban Dump Truck 10.00-20', 4, 3800000)], 7);
  await prSvc.reject(rejectedByAdmin.id, admin.id, admin.permissions,
    'Stok ban di gudang masih 4 buah. Pakai stok dulu, ajukan lagi kalau sudah habis.');

  const rejectedByFinance = await createStock([stock('Kompresor angin portable 100 L', 1, 8500000)], 8);
  await prSvc.validateByAdmin(rejectedByFinance.id, admin.id);
  await prSvc.reject(rejectedByFinance.id, finance.id, finance.permissions,
    'Belum masuk anggaran kuartal ini. Ajukan ulang awal kuartal depan.');

  return `2 menunggu Finance (stok + ${maintenanceNote}), 1 approved, 1 ditolak Admin, 1 ditolak Finance`;
}

// ─────────────────────────────────────────────────────────────────────────
// Request material — antrean Admin & Finance, konstruksi & supply.
// ─────────────────────────────────────────────────────────────────────────
async function seedMaterialRequests(ctx, lapangan, admin, finance) {
  if (await prisma.materialRequest.count({ where: { requestNotes: { startsWith: MARK } } })) return 'sudah ada';
  const m = await materialIds(['PSR-URUG', 'BBM-SOLAR', 'TNH-TIMBUN', 'AGG-BA', 'SPL-23', 'SPL-12', 'SMN-PC1']);

  const create = (scope, notes, items, day) => materialRequestSvc.create({
    ...scope,
    requestDate: daysAgo(day),
    neededDate: daysAgo(day - 5),
    requestNotes: `${MARK} ${notes}`,
    items: items.map(([code, requestedQuantity, itemNotes]) => ({ materialTypeId: m.get(code), requestedQuantity, itemNotes })),
  }, lapangan.id);

  const stage = { requestType: 'internal_project', subProjectId: ctx.stage.id };
  const supply = ctx.supply ? { requestType: 'external_supply', externalSupplyProjectId: ctx.supply.id } : null;

  // Biaya lengkap: satu material_cost per item + ongkos angkut
  const costAll = (row, prices, extra = []) => materialRequestSvc.replaceCosts(row.id, {
    costs: [
      ...row.items.map((item) => ({
        costType: 'material_cost', materialRequestItemId: item.id,
        description: `Harga ${item.materialType.materialName}`, amount: prices[item.materialType.materialCode],
        payeeName: 'Quarry Arjawinangun',
      })),
      ...extra,
    ],
  }, admin.id);
  const freight = (amount) => ({ costType: 'delivery_fee', description: 'Ongkos angkut dump truck', amount, payeeName: 'CV Angkut Lancar' });

  const out = [];

  // 1. Antrean Admin (konstruksi) — belum disentuh
  await create(stage, 'Kebutuhan urugan & BBM minggu depan', [['PSR-URUG', 120, 'Untuk lapisan dasar segmen 7-8'], ['BBM-SOLAR', 800, null]], 2);
  out.push('1 antrean Admin konstruksi');

  // 2. Antrean Admin (supply)
  if (supply) {
    await create(supply, 'Pengiriman batch 2 ke klien', [['SPL-23', 200, null], ['AGG-BA', 150, null]], 1);
    out.push('1 antrean Admin supply');
  }

  // 3. Antrean Finance (konstruksi) — kuantitas dikurangi Admin, biaya lengkap, diteruskan
  const forwarded = await create(stage, 'Material timbunan tahap lanjutan', [['TNH-TIMBUN', 300, null], ['AGG-BA', 80, 'Untuk perbaikan bahu jalan']], 5);
  const baItem = forwarded.items.find((i) => i.materialType.materialCode === 'AGG-BA');
  await materialRequestSvc.adminValidate(forwarded.id, {
    items: [{ itemId: baItem.id, adminValidatedQuantity: 60, adminNotes: 'Bahu jalan segmen 6 sudah dikerjakan, cukup 60 m³' }],
  }, admin.id);
  await costAll(forwarded, { 'TNH-TIMBUN': 27000000, 'AGG-BA': 15600000 }, [freight(4500000)]);
  await materialRequestSvc.submitToFinance(forwarded.id, { notes: 'Harga sudah dibandingkan dengan 2 quarry, ini yang termurah.' }, admin.id);
  out.push('1 antrean Finance');

  // 4. Disetujui Finance (supply) — material masuk pool
  if (supply) {
    const approved = await create(supply, 'Pengiriman batch 1', [['SPL-12', 100, null]], 12);
    await costAll(approved, { 'SPL-12': 21000000 }, [freight(3000000)]);
    await materialRequestSvc.submitToFinance(approved.id, { notes: null }, admin.id);
    await materialRequestSvc.approve(approved.id, { notes: 'Dana cair dari rekening operasional.' }, finance.id);
    out.push('1 approved');
  }

  // 5. Ditolak Admin & 6. ditolak Finance
  const rejectedAdmin = await create(stage, 'Semen untuk gorong-gorong', [['SMN-PC1', 50, null]], 6);
  await materialRequestSvc.reject(rejectedAdmin.id, { notes: 'Gorong-gorong bukan lingkup kontrak galian. Koordinasikan dengan kontraktor drainase.' }, admin);

  const rejectedFinance = await create(stage, 'Tambahan solar genset', [['BBM-SOLAR', 400, null]], 8);
  await costAll(rejectedFinance, { 'BBM-SOLAR': 2720000 });
  await materialRequestSvc.submitToFinance(rejectedFinance.id, { notes: null }, admin.id);
  await materialRequestSvc.reject(rejectedFinance.id, { notes: 'Solar genset sudah termasuk pengajuan BBM mingguan. Gabungkan ke sana.' }, finance);
  out.push('1 ditolak Admin, 1 ditolak Finance');

  return out.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────
// Request alat internal — antrean Admin + riwayat.
// ─────────────────────────────────────────────────────────────────────────
async function seedEquipmentRequests(ctx, lapangan, admin) {
  if (await prisma.equipmentRequest.count({ where: { requestNotes: { startsWith: MARK } } })) return 'sudah ada';
  const t = await equipmentTypeIds(['EXC', 'DT', 'WL', 'BLD']);

  const create = (notes, items, day) => equipmentRequestSvc.create({
    requestType: 'internal_project',
    subProjectId: ctx.stage.id,
    requestDate: daysAgo(day),
    neededDate: daysAgo(day - 4),
    locationDetail: 'Ruas Demak-Kudus KM 15, sisi utara',
    requestNotes: `${MARK} ${notes}`,
    items: items.map(([code, requestedQuantity, estimatedWorkhours]) => ({ equipmentTypeId: t.get(code), requestedQuantity, estimatedWorkhours })),
  }, lapangan);

  await create('Percepatan galian segmen 9-10', [['EXC', 1, 160], ['DT', 2, 160]], 2);
  await create('Pemuatan material timbunan', [['WL', 1, 80]], 1);

  const forwarded = await create('Perataan badan jalan sebelum timbunan', [['BLD', 1, 60]], 5);
  await equipmentRequestSvc.adminReview(forwarded.id, { action: 'forward', notes: 'Disetujui, mohon Divisi Alat cek unit buldoser yang selesai servis.' }, admin.id);

  const rejected = await create('Tambahan dump truck', [['DT', 3, 120]], 6);
  await equipmentRequestSvc.adminReview(rejected.id, {
    action: 'reject', notes: 'Dua DT di pool belum dialokasikan. Pakai unit yang ada dulu.',
  }, admin.id);

  return '2 antrean Admin, 1 diteruskan ke Divisi Alat, 1 ditolak';
}

// ─────────────────────────────────────────────────────────────────────────
// Progress harian — tambah antrean validasi + contoh penolakan beralasan.
// ─────────────────────────────────────────────────────────────────────────
async function seedProgress(ctx, lapangan, admin) {
  const plan = [
    { day: 3, volume: 61, weather: 'cerah' },
    { day: 4, volume: 66, weather: 'cerah' },
    { day: 5, volume: 140, weather: 'cerah', reject: 'Volume 140 m³ melebihi kapasitas 2 excavator sehari. Ukur ulang bersama surveyor lalu ajukan lagi.' },
    { day: 6, volume: 52, weather: 'mendung', validate: true },
  ];
  let added = 0;
  for (const p of plan) {
    const date = new Date(daysAgo(p.day));
    const exists = await prisma.dailyProgressLog.findUnique({ where: { subProjectId_progressDate: { subProjectId: ctx.stage.id, progressDate: date } } });
    if (exists) continue;
    const log = await progressSvc.create(ctx.stage.id, {
      progressDate: daysAgo(p.day),
      realizedVolume: p.volume,
      notes: `${MARK} Galian badan jalan`,
      fieldCondition: { weatherMorning: p.weather, weatherAfternoon: p.weather, incidentNotes: 'Tidak ada insiden' },
    }, lapangan.id);
    if (p.reject) await progressSvc.setValidationStatus(ctx.stage.id, log.id, 'rejected', admin.id, p.reject);
    if (p.validate) await progressSvc.setValidationStatus(ctx.stage.id, log.id, 'validated', admin.id);
    added += 1;
  }
  return added ? `+${added} log (antrean, ditolak beralasan, tervalidasi)` : 'sudah ada';
}

// ─────────────────────────────────────────────────────────────────────────
// Pekerja — master, penugasan di tahapan aktif, dan log harian 5 hari.
// ─────────────────────────────────────────────────────────────────────────
const WORKERS = [
  { fullName: 'Slamet Riyadi', idNumber: '3321010501800001', phone: '0812-2900-1101', defaultRole: 'Pelaksana', type: 'contract', wage: 250000 },
  { fullName: 'Agus Santoso', idNumber: '3321011207850002', phone: '0812-2900-1102', defaultRole: 'Foreman', type: 'contract', wage: 200000 },
  { fullName: 'Bambang Wijaya', idNumber: '3321012003880003', phone: '0813-2711-0203', defaultRole: 'Operator Excavator', type: 'daily', wage: 180000 },
  { fullName: 'Dedi Kurniawan', idNumber: null, phone: '0857-4210-3304', defaultRole: 'Sopir DT', type: 'daily', wage: 160000 },
  { fullName: 'Eko Prasetyo', idNumber: null, phone: null, defaultRole: 'Checker', type: 'daily', wage: 130000 },
  { fullName: 'Joko Susilo', idNumber: '3321010909900006', phone: null, defaultRole: 'Harian K3', type: 'daily', wage: 120000 },
  { fullName: 'Rudi Hartono', idNumber: null, phone: null, defaultRole: 'Helper', type: 'daily', wage: 110000, endedDaysAgo: 3 },
  // Pekerja sekali-datang: ada di master, tanpa penugasan (P6)
  { fullName: 'Sutrisno', idNumber: null, phone: null, defaultRole: 'Helper', type: 'daily', wage: 110000, noAssignment: true },
];

async function seedLabor(ctx, lapangan) {
  if (await prisma.projectWorker.count({ where: { notes: { startsWith: MARK } } })) return 'sudah ada';

  const workers = [];
  for (const w of WORKERS) {
    const row = await workerSvc.create({
      fullName: w.fullName, idNumber: w.idNumber, phone: w.phone, defaultRole: w.defaultRole,
      joinedAt: daysAgo(40), notes: `${MARK} Pekerja demo`,
    }, lapangan.id);
    workers.push({ ...w, id: row.id });
  }

  for (const w of workers.filter((x) => !x.noAssignment)) {
    await assignmentSvc.create({
      subProjectId: ctx.stage.id, projectWorkerId: w.id, workerType: w.type, assignedRole: w.defaultRole,
      dailyWage: w.wage, startDate: daysAgo(20), endDate: w.endedDaysAgo ? daysAgo(w.endedDaysAgo) : null,
    }, lapangan.id);
  }

  let logs = 0;
  for (const day of [5, 4, 3, 2, 1]) {
    const date = new Date(daysAgo(day));
    if (await prisma.dailyLaborLog.findUnique({ where: { subProjectId_workDate: { subProjectId: ctx.stage.id, workDate: date } } })) continue;
    const present = workers.filter((w) => !w.noAssignment && !(w.endedDaysAgo && day < w.endedDaysAgo));
    if (day === 4) present.push(workers.find((w) => w.noAssignment));
    await laborLogSvc.create({
      subProjectId: ctx.stage.id,
      workDate: daysAgo(day),
      notes: day === 2 ? 'Hujan sejak pukul 14.00, pekerjaan dihentikan lebih awal' : null,
      items: present.map((w) => ({
        projectWorkerId: w.id, workerRole: w.defaultRole, workerType: w.type, dailyWage: w.wage,
        overtimeAmount: day === 3 && w.defaultRole === 'Operator Excavator' ? 60000 : 0,
        taskNotes: day === 3 && w.defaultRole === 'Operator Excavator' ? 'Lembur 3 jam kejar target segmen 9' : null,
      })),
    }, lapangan.id);
    logs += 1;
  }
  return `${workers.length} pekerja, ${workers.length - 1} penugasan (1 sudah keluar), ${logs} log harian`;
}

// ─────────────────────────────────────────────────────────────────────────
// Stok material tahapan — koreksi masuk (stok awal) + pemakaian harian.
// Stok dari penerimaan butuh delivery + file, jadi tidak dibuat di sini.
// ─────────────────────────────────────────────────────────────────────────
async function seedStock(ctx, lapangan) {
  if (await prisma.materialStockMovement.count({ where: { notes: { startsWith: MARK } } })) return 'sudah ada';
  const m = await materialIds(['BBM-SOLAR', 'PSR-URUG']);
  const move = (code, movementType, quantity, day, notes) => stockSvc.createMovement({
    subProjectId: ctx.stage.id, materialTypeId: m.get(code), movementType, quantity, movementDate: daysAgo(day), notes: `${MARK} ${notes}`,
  }, lapangan.id);

  await move('BBM-SOLAR', 'adjustment_in', 1500, 10, 'Stok awal di tangki lokasi saat sistem mulai dipakai');
  await move('PSR-URUG', 'adjustment_in', 220, 10, 'Stok awal tumpukan pasir di lokasi');
  for (const day of [5, 4, 3, 2, 1]) await move('BBM-SOLAR', 'used', 140 + day * 5, day, 'Solar 2 excavator + 2 DT');
  await move('PSR-URUG', 'used', 45, 4, 'Lapisan dasar segmen 6');
  await move('PSR-URUG', 'used', 38, 2, 'Lapisan dasar segmen 7');
  await move('PSR-URUG', 'adjustment_out', 6, 1, 'Selisih hitung ulang tumpukan (susut)');
  return '2 stok awal, 8 mutasi pemakaian/koreksi';
}

// ─────────────────────────────────────────────────────────────────────────
// Berkas project — folder kosong, supaya halaman Files tidak hanya folder sistem.
// ─────────────────────────────────────────────────────────────────────────
async function seedFolders(ctx, admin) {
  const folders = [
    ['construction', ctx.project.id, 'Kontrak & Addendum', null],
    ['construction', ctx.project.id, 'Gambar Kerja', ctx.stage.id],
    ['construction', ctx.project.id, 'Dokumentasi Lapangan', ctx.stage.id],
    ...(ctx.supply ? [['supply', ctx.supply.id, 'Kontrak & PO Klien', null]] : []),
  ];
  let added = 0;
  for (const [kind, projectId, name, subProjectId] of folders) {
    try {
      await projectFileSvc.createFolder(kind, projectId, { name, subProjectId }, admin.id);
      added += 1;
    } catch (err) {
      if (err.statusCode !== 409) throw err; // 409 = folder sudah ada
    }
  }
  return added ? `+${added} folder` : 'sudah ada';
}

async function seedWorkflowDemo() {
  console.log('Seeding demo alur kerja (Approval Center & modul Project)...');
  const [admin, finance, alat, lapangan] = await Promise.all(['admin', 'finance', 'alat', 'lapangan'].map(loadActor));

  // Konteks: tahapan aktif pertama di project konstruksi aktif, dan supply terbuka pertama
  const stage = await prisma.subProject.findFirst({
    where: { status: 'active', constructionProject: { status: 'active' } },
    include: { constructionProject: true },
    orderBy: { id: 'asc' },
  });
  if (!stage) {
    console.log('  (tidak ada tahapan aktif — seed alur kerja dilewati)');
    return;
  }
  const supply = await prisma.externalSupplyProject.findFirst({
    where: { status: { notIn: ['completed', 'cancelled'] } }, orderBy: { id: 'asc' },
  });
  const ctx = { stage, project: stage.constructionProject, supply };
  console.log(`  konteks: ${ctx.project.projectCode} · ${stage.subProjectType}${supply ? ` · ${supply.supplyProjectCode}` : ''}`);

  await section('Kas Alat', () => seedCash(alat));
  await section('Purchase request', () => seedPurchaseRequests(alat, admin, finance));
  await section('Request material', () => seedMaterialRequests(ctx, lapangan, admin, finance));
  await section('Request alat', () => seedEquipmentRequests(ctx, lapangan, admin));
  await section('Progress harian', () => seedProgress(ctx, lapangan, admin));
  await section('Pekerja', () => seedLabor(ctx, lapangan));
  await section('Stok material', () => seedStock(ctx, lapangan));
  await section('Berkas project', () => seedFolders(ctx, admin));

  const queue = await prisma.$queryRaw`SELECT source_type, stage, count(*)::int AS n FROM approval_queue GROUP BY 1, 2 ORDER BY 1, 2`;
  console.log(`  antrean Approval Center: ${queue.map((q) => `${q.source_type}/${q.stage}=${q.n}`).join(', ')}`);
}

module.exports = { seedWorkflowDemo };
