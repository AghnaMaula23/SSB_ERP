// Data demo modul Project, supaya FE punya API sungguhan untuk dikonsumsi.
//
// Sama filosofinya dengan divisi-alat.seed.js: SEMUA lewat service yang dipakai
// controller, bukan prisma.create langsung. Jadi kode project (PRJ/RNT/SPL/POOL)
// lahir dari counter atomik yang sama, transisi status lewat guard yang sama,
// dan angka progress billing dihitung rumus yang sama — bukan duplikat logikanya
// yang bisa menyimpang diam-diam.
//
// Idempoten: dilewati kalau sudah ada construction project. Sengaja dicek pada
// "ada project apa pun", bukan pada nama project demo ini — supaya seed tidak
// pernah menimpa atau menduplikasi data yang sudah dipakai orang lain di
// database dev bersama.

const prisma = require('../../config/database.js');
const projectSvc = require('../../modules/project/project.service.js');
const subProjectSvc = require('../../modules/project/sub-project.service.js');
const progressSvc = require('../../modules/project/progress.service.js');
const poolSvc = require('../../modules/project/pool.service.js');
const allocationSvc = require('../../modules/project/allocation.service.js');
const divisiAlat = require('../../modules/divisi-alat/divisi-alat.service.js');

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

async function seedProjectDemo(adminId) {
  const existing = await prisma.constructionProject.count();
  if (existing > 0) {
    console.log('Data Project sudah ada, seed demo dilewati (hapus manual dulu kalau mau re-seed).');
    return;
  }

  // Service create() membaca user.roles untuk memutuskan boleh/tidaknya kode
  // manual. Seeder tidak memakai kode manual, jadi role biasa sudah cukup.
  const actor = { id: adminId, roles: ['admin'] };

  console.log('Seeding demo data Project...');

  // ── Construction project ────────────────────────────────────────────────
  const project = await projectSvc.create('construction', {
    projectName: 'Peningkatan Jalan Kabupaten Demak-Kudus',
    clientName: 'Dinas PUPR Kabupaten Demak',
    location: 'Ruas Demak-Kudus KM 12-18, Jawa Tengah',
    startDate: daysAgo(45),
    endDate: daysAgo(-120),
  }, actor);

  await projectSvc.changeStatus('construction', project.id, 'active');

  // Sengaja HANYA 2 dari 4 tahapan. Ini mencontohkan aturan bisnis inti:
  // "Perusahaan tidak wajib mengerjakan semua tahapan" — line_clearing dan
  // aspal dikerjakan perusahaan lain dan tidak pernah masuk sistem ini.
  const galian = await subProjectSvc.create(project.id, {
    subProjectType: 'galian',
    targetVolume: 1200,
    dailyTargetVolume: 60,
    volumeUnit: 'm3',
    contractValue: 1800000000,
    contractNo: 'KTR-DMK-2026-011',
    contractDate: daysAgo(50),
    contractStartDate: daysAgo(45),
    contractEndDate: daysAgo(-30),
  }, adminId);

  const timbunan = await subProjectSvc.create(project.id, {
    subProjectType: 'timbunan',
    targetVolume: 900,
    dailyTargetVolume: 45,
    volumeUnit: 'm3',
    contractValue: 1250000000,
    contractNo: 'KTR-DMK-2026-012',
    contractDate: daysAgo(50),
    contractStartDate: daysAgo(-25),
    contractEndDate: daysAgo(-90),
  }, adminId);

  // Galian jalan, timbunan menunggu gilirannya — tahapan berjalan berurutan
  await subProjectSvc.changeStatus(project.id, galian.id, 'active');

  // ── Progress harian ─────────────────────────────────────────────────────
  // Dibuat dua kelompok supaya FE punya contoh kedua sisi gerbang validasi:
  // yang sudah jadi uang, dan yang masih menunggu diperiksa Admin.
  const progressPlan = [
    { day: 12, volume: 55, weather: 'cerah', validate: true },
    { day: 11, volume: 70, weather: 'cerah', validate: true },
    { day: 10, volume: 48, weather: 'mendung', validate: true, incident: 'Excavator sempat berhenti 1 jam, isi solar' },
    { day: 9, volume: 62, weather: 'cerah', validate: true },
    { day: 8, volume: 35, weather: 'hujan', validate: true, incident: 'Hujan deras sejak siang, pekerjaan dihentikan lebih awal' },
    // Dua terakhir SENGAJA dibiarkan submitted — belum diperiksa Admin, jadi
    // belum menghasilkan angka tagihan. FE perlu contoh keadaan ini.
    { day: 2, volume: 58, weather: 'cerah', validate: false },
    { day: 1, volume: 64, weather: 'cerah', validate: false },
  ];

  for (const p of progressPlan) {
    const log = await progressSvc.create(galian.id, {
      progressDate: daysAgo(p.day),
      realizedVolume: p.volume,
      notes: `Galian badan jalan segmen ${18 - p.day}`,
      fieldCondition: {
        weatherMorning: p.weather,
        weatherAfternoon: p.weather === 'hujan' ? 'hujan' : 'cerah',
        incidentNotes: p.incident ?? 'Tidak ada insiden',
      },
    }, adminId);

    if (p.validate) {
      await progressSvc.setValidationStatus(galian.id, log.id, 'validated', adminId);
    }
  }

  // ── Equipment pool + alokasi ────────────────────────────────────────────
  const pool = await poolSvc.create({
    ownerType: 'construction_project',
    constructionProjectId: project.id,
  }, adminId);

  // Pakai unit yang benar-benar bebas: operational, aktif, dan belum dipegang
  // pool item hidup manapun. Kalau seed Divisi Alat tidak jalan, bagian ini
  // dilewati tanpa menggagalkan seluruh seed.
  const freeUnits = await prisma.equipmentItem.findMany({
    where: {
      currentStatus: 'operational',
      isActive: true,
      poolItems: { none: { status: { in: ['available', 'assigned'] } } },
    },
    take: 2,
  });

  if (freeUnits.length === 0) {
    console.log('  (tidak ada unit alat bebas — pool dibuat kosong, alokasi dilewati)');
  }

  let allocatedCount = 0;
  for (const unit of freeUnits) {
    const poolItem = await poolSvc.addItem(pool.id, {
      equipmentTypeId: unit.equipmentTypeId,
      equipmentItemId: unit.id,
    });

    const allocation = await allocationSvc.create(galian.id, {
      equipmentPoolItemId: poolItem.id,
    }, adminId);

    // Unit pertama sudah dikonfirmasi sampai di lokasi, unit kedua belum —
    // supaya FE punya contoh alokasi yang receivedAt-nya masih null.
    if (allocatedCount === 0) {
      await allocationSvc.receive(galian.id, allocation.id, adminId);

      // Jam kerja lewat konteks alokasi (bukan project_id/sub_project_id yang
      // sudah dibuang). Menggerakkan total_workhour alat DAN hitung mundur
      // maintenance lewat jalur yang sama dengan input lapangan sungguhan.
      for (const day of [3, 2, 1]) {
        await divisiAlat.createWorkhourLog({
          sourceType: 'internal_project',
          subProjectEquipmentAllocationId: allocation.id,
          workDate: daysAgo(day),
          totalWorkhour: 8,
          pausedDurationMinutes: 45,
          description: 'Galian badan jalan',
        }, adminId);
      }
    }
    allocatedCount += 1;
  }

  // ── External rental & supply ────────────────────────────────────────────
  // Dua tipe project lain, supaya FE tahu bentuk response-nya berbeda
  // (kontrak + billingMethod, bukan startDate/endDate).
  const rental = await projectSvc.create('external-rental', {
    rentalProjectName: 'Sewa Excavator - PT Karya Bangun Persada',
    clientName: 'PT Karya Bangun Persada',
    location: 'Proyek Perumahan Grand Semarang',
    contractNo: 'RNT-KBP-2026-004',
    billingMethod: 'monthly',
    contractStartDate: daysAgo(20),
    contractEndDate: daysAgo(-70),
  }, actor);
  await projectSvc.changeStatus('external-rental', rental.id, 'active');

  await projectSvc.create('external-supply', {
    supplyProjectName: 'Supply Material Batu Split - CV Mitra Sejahtera',
    clientName: 'CV Mitra Sejahtera',
    location: 'Gudang Genuk, Semarang',
    contractNo: 'SPL-MS-2026-002',
    contractStartDate: daysAgo(15),
    contractEndDate: daysAgo(-60),
  }, actor);

  const billing = await subProjectSvc.getProgress(project.id, galian.id);

  console.log('Demo data Project selesai di-seed:');
  console.log(`  - ${project.projectCode} (2 dari 4 tahapan: galian aktif, timbunan planned)`);
  console.log(`  - galian: target ${billing.targetVolume} m3, kontrak Rp ${Number(billing.contractValue).toLocaleString('id-ID')}`);
  console.log(`  - progress: ${billing.billableProgress}% tervalidasi = Rp ${Number(billing.billableAmount).toLocaleString('id-ID')} siap ditagih`);
  console.log(`  - menunggu validasi: ${billing.pendingVolume} m3 (${billing.pendingProgress}%) — belum jadi uang`);
  console.log(`  - ${pool.poolCode}: ${freeUnits.length} unit, ${allocatedCount} alokasi`);
  console.log('  - 1 external rental project, 1 external supply project');
}

module.exports = { seedProjectDemo };
