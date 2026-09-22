// Data demo untuk Divisi Alat, supaya FE bisa langsung konsumsi API sungguhan
// alih-alih dummy data lokal di apps/web/. Sengaja dipanggil lewat service
// yang sama dengan yang dipakai controller (bukan prisma.create langsung),
// supaya kode aset, nomor dokumen, status alat, dan counter maintenance
// terbentuk dengan aturan bisnis yang sama persis — bukan duplikat logikanya.
//
// Idempoten: kalau jenis alat demo (EXC/DT/BLD/WL) sudah ada, seed ini
// dilewati. Untuk re-seed dari nol, hapus datanya dulu secara manual.

const prisma = require('../../config/database.js');
const divisiAlat = require('../../modules/divisi-alat/divisi-alat.service.js');
const maintenanceSvc = require('../../modules/divisi-alat/maintenance.service.js');
const damageSvc = require('../../modules/divisi-alat/damage.service.js');

const SEED_TYPE_CODES = ['EXC', 'DT', 'BLD', 'WL'];

// Jam kerja per panggilan saat mensimulasikan histori workhour mundur ke
// belakang. Di bawah batas 24 jam/hari yang dijaga createWorkhourLog.
const DAILY_HOURS = 10;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Mensimulasikan histori workhour untuk satu alat sampai totalnya tercapai,
 * mundur hari demi hari dari kemarin. Dipanggil lewat createWorkhourLog asli
 * supaya total_workhour alat dan counter maintenance ikut bergerak otomatis
 * lewat applyWorkhourToSettings — statusnya (normal/warning/due/overdue)
 * jadi hasil hitungan sungguhan, bukan ditulis manual.
 */
async function logBackdatedWorkhours(itemId, userId, totalHours) {
  let remaining = totalHours;
  let dayOffset = 1;
  while (remaining > 0) {
    const hours = Math.min(DAILY_HOURS, remaining);
    await divisiAlat.createWorkhourLog({
      equipmentItemId: itemId,
      workDate: daysAgo(dayOffset),
      totalWorkhour: hours,
      // manual_adjustment karena belum ada alokasi sub-project sungguhan —
      // modul Project belum dibangun. Sesuaikan ke internal_project begitu ada.
      sourceType: 'manual_adjustment',
      description: 'Seed demo: simulasi jam operasional',
    }, userId);
    remaining -= hours;
    dayOffset += 1;
  }
}

async function seedDivisiAlatDemo(adminUserId) {
  const existing = await prisma.equipmentType.findFirst({
    where: { typeCode: { in: SEED_TYPE_CODES } },
  });
  if (existing) {
    console.log('Demo data Divisi Alat sudah ada, dilewati (hapus manual dulu kalau mau re-seed).');
    return;
  }

  const actor = { id: adminUserId, roles: ['super_admin'] };

  console.log('Seeding equipment types...');
  const typeDefs = [
    { typeCode: 'EXC', typeName: 'Excavator' },
    { typeCode: 'DT', typeName: 'Dump Truck' },
    { typeCode: 'BLD', typeName: 'Buldoser' },
    { typeCode: 'WL', typeName: 'Wheel Loader' },
  ];
  const types = {};
  for (const def of typeDefs) {
    types[def.typeCode] = await divisiAlat.createType(def);
  }

  console.log('Seeding equipment items...');
  // key dipakai sebagai acuan internal seed script, bukan disimpan ke DB.
  // Asset code sungguhan (SSB-EXC-001, dst) dibuat otomatis oleh createItem.
  const itemDefs = [
    { key: 'EXC1', typeCode: 'EXC', brand: 'Komatsu', model: 'PC200-8', manufactureYear: 2019 },
    { key: 'EXC2', typeCode: 'EXC', brand: 'Komatsu', model: 'PC200-8', manufactureYear: 2018 },
    { key: 'EXC3', typeCode: 'EXC', brand: 'Hitachi', model: 'ZX200', manufactureYear: 2020 },
    { key: 'DT1', typeCode: 'DT', brand: 'Hino', model: 'FM 260 JD', manufactureYear: 2021, plateNumber: 'B 9012 XYZ' },
    { key: 'DT2', typeCode: 'DT', brand: 'Mitsubishi Fuso', model: 'FN 527', manufactureYear: 2020, plateNumber: 'B 9013 XYZ' },
    { key: 'DT3', typeCode: 'DT', brand: 'Hino', model: 'FM 260 JD', manufactureYear: 2017, plateNumber: 'B 9014 XYZ' },
    { key: 'BLD1', typeCode: 'BLD', brand: 'Caterpillar', model: 'D6R', manufactureYear: 2019 },
    { key: 'BLD2', typeCode: 'BLD', brand: 'Komatsu', model: 'D65PX', manufactureYear: 2018 },
    { key: 'WL1', typeCode: 'WL', brand: 'Caterpillar', model: '950GC', manufactureYear: 2021 },
    { key: 'WL2', typeCode: 'WL', brand: 'Komatsu', model: 'WA200', manufactureYear: 2019 },
  ];

  const items = {};
  for (const def of itemDefs) {
    items[def.key] = await divisiAlat.createItem({
      equipmentTypeId: types[def.typeCode].id,
      brand: def.brand,
      model: def.model,
      manufactureYear: def.manufactureYear,
      plateNumber: def.plateNumber,
    }, actor);
  }

  console.log('Seeding maintenance aspects...');
  const aspectDefs = [
    { aspectCode: 'OLI-MSN', aspectName: 'Oli Mesin', defaultThresholdValue: 50, warningLeadValue: 10 },
    { aspectCode: 'FLT-UDR', aspectName: 'Filter Udara', defaultThresholdValue: 40, warningLeadValue: 8 },
    { aspectCode: 'FLT-SLR', aspectName: 'Filter Solar', defaultThresholdValue: 60, warningLeadValue: 12 },
    { aspectCode: 'OLI-HDR', aspectName: 'Oli Hidrolik', defaultThresholdValue: 75, warningLeadValue: 15 },
  ];
  const aspects = {};
  for (const def of aspectDefs) {
    aspects[def.aspectCode] = await maintenanceSvc.createAspect(def);
  }

  console.log('Seeding maintenance settings per unit...');
  // Dump truck tidak punya lengan hidrolik seperti alat berat lainnya.
  const aspectsByType = {
    EXC: ['OLI-MSN', 'FLT-UDR', 'FLT-SLR', 'OLI-HDR'],
    BLD: ['OLI-MSN', 'FLT-UDR', 'FLT-SLR', 'OLI-HDR'],
    WL: ['OLI-MSN', 'FLT-UDR', 'FLT-SLR', 'OLI-HDR'],
    DT: ['OLI-MSN', 'FLT-UDR', 'FLT-SLR'],
  };
  const settingsByItem = {};
  for (const def of itemDefs) {
    settingsByItem[def.key] = [];
    for (const aspectCode of aspectsByType[def.typeCode]) {
      const setting = await maintenanceSvc.createSetting(items[def.key].id, {
        maintenanceAspectId: aspects[aspectCode].id,
      });
      settingsByItem[def.key].push(setting);
    }
  }

  console.log('Mensimulasikan histori jam kerja (menggerakkan counter maintenance)...');
  // Target jam sengaja dibuat bervariasi relatif terhadap threshold di atas,
  // supaya status normal/warning/due/overdue muncul tersebar apa adanya —
  // dihitung sistem lewat applyWorkhourToSettings, bukan ditulis manual.
  const workhourPlan = {
    EXC1: 8, EXC2: 48, EXC3: 75,
    DT1: 20, DT2: 55, DT3: 18,
    BLD1: 30, BLD2: 65,
    WL1: 13, WL2: 85,
  };
  for (const [key, hours] of Object.entries(workhourPlan)) {
    await logBackdatedWorkhours(items[key].id, actor.id, hours);
  }

  console.log('Seeding damage logs...');

  // EXC2 & BLD2: kerusakan yang menghentikan alat, masih terbuka -> alat
  // otomatis jadi "maintenance" (lihat damage.service.js moveEquipmentStatus).
  await damageSvc.create({
    equipmentItemId: items.EXC2.id,
    damageDate: daysAgo(3),
    description: 'Hydraulic Leakage pada arm boom, alat tidak bisa dioperasikan',
    stopsOperation: true,
    sparePartSource: 'warehouse',
    mechanicTeam: 'internal',
  }, actor.id);

  await damageSvc.create({
    equipmentItemId: items.BLD2.id,
    damageDate: daysAgo(2),
    description: 'Track kendor, alat tidak stabil dijalankan',
    stopsOperation: true,
    sparePartSource: 'supplier',
    mechanicTeam: 'external',
  }, actor.id);

  // EXC1: masalah kecil, alat tetap beroperasi (demo pembeda stopsOperation)
  await damageSvc.create({
    equipmentItemId: items.EXC1.id,
    damageDate: daysAgo(5),
    description: 'AC kabin mati, tidak mengganggu operasional harian',
    stopsOperation: false,
    sparePartSource: 'warehouse',
    mechanicTeam: 'internal',
  }, actor.id);

  // DT1: laporan salah input, dibatalkan (demo status cancelled)
  const dt1Damage = await damageSvc.create({
    equipmentItemId: items.DT1.id,
    damageDate: daysAgo(4),
    description: 'Rem tidak pakem (laporan awal, salah unit)',
    stopsOperation: true,
    sparePartSource: 'warehouse',
    mechanicTeam: 'internal',
  }, actor.id);
  await damageSvc.cancel(dt1Damage.id, { notes: 'Salah input unit, seharusnya DT-002' }, actor.id);

  // WL2: kerusakan yang sudah tuntas diperbaiki, lengkap dengan maintenance
  // record dan reset salah satu setting (demo alur resolve penuh).
  const wl2Damage = await damageSvc.create({
    equipmentItemId: items.WL2.id,
    damageDate: daysAgo(10),
    description: 'Oli hidrolik bocor dari selang utama',
    stopsOperation: true,
    sparePartSource: 'supplier',
    mechanicTeam: 'external',
  }, actor.id);
  const wl2HidrolikSetting = settingsByItem.WL2.find((s) => s.maintenanceAspectId === aspects['OLI-HDR'].id);
  await damageSvc.resolve(wl2Damage.id, {
    maintenanceType: 'repair',
    actionDescription: 'Ganti selang hidrolik utama dan isi ulang oli hidrolik',
    performedBy: 'Bengkel Mitra Jaya',
    maintenanceDate: daysAgo(8),
    maintenanceSettingId: wl2HidrolikSetting?.id,
  }, actor.id);

  console.log('Menarik DT3 dari operasional (retired)...');
  await divisiAlat.changeItemStatus(items.DT3.id, {
    status: 'retired',
    notes: 'Alat sudah tua, ditarik dari operasional (seed demo)',
  }, actor.id);

  console.log('Demo data Divisi Alat selesai di-seed:');
  console.log(`  - ${typeDefs.length} equipment types, ${itemDefs.length} equipment items`);
  console.log(`  - ${aspectDefs.length} maintenance aspects, ${Object.values(settingsByItem).flat().length} maintenance settings`);
  console.log('  - 5 damage logs (2 reported+stopsOperation, 1 reported non-stopping, 1 cancelled, 1 resolved)');
  console.log('  - 1 unit retired (DT3)');
}

module.exports = { seedDivisiAlatDemo };
