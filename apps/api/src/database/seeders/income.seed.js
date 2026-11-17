// Data demo Income (docs/claude_knowledge/plan-divisi-finance.md G2, G4) — tagihan konstruksi
// dan rental dengan riwayat keputusan & pembayaran, plus satu klaim pendapatan alat, supaya layar Admin "Income" dan Finance
// "Verifikasi Pendapatan" punya isi. SEMUA lewat service yang dipakai controller, dengan
// aktor yang benar (Admin membuat, Finance memverifikasi & mencatat bayar) — jurnal GL
// ikut lahir dari jalur yang sama.
//
// Dibaca dari data demo modul lain (progress tervalidasi, jam kerja rental), bukan tanggal
// tetap. Idempoten: dilewati kalau sudah ada income record. Tagihan supply TIDAK dibuat —
// seeder belum punya penerimaan material (butuh unggah surat jalan).
const prisma = require('../../config/database.js');
const recordSvc = require('../../modules/income/income-record.service.js');
const paymentSvc = require('../../modules/income/income-payment.service.js');
const claimSvc = require('../../modules/income/equipment-income-claim.service.js');
const { toDateOnly } = require('../../utils/shape.js');
const { todayDate } = require('../../utils/date.js');

// Tarif default demo per jenis alat (Rp/jam) — hanya diisi kalau unitnya belum bertarif
const DEMO_HOURLY_RATE = { DT: 350000, EXC: 450000, BLD: 500000, VBR: 300000 };
const FALLBACK_RATE = 400000;

const userOf = async (username) => {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`user demo ${username} belum ada`);
  return user.id;
};

const seedRates = async () => {
  const items = await prisma.equipmentItem.findMany({ where: { defaultHourlyRate: null }, include: { equipmentType: { select: { typeCode: true } } } });
  for (const item of items) {
    await prisma.equipmentItem.update({
      where: { id: item.id },
      data: { defaultHourlyRate: DEMO_HOURLY_RATE[item.equipmentType.typeCode] ?? FALLBACK_RATE, rateNotes: 'Tarif demo seeder', rateUpdatedAt: new Date() },
    });
  }
  return items.length;
};

/** Tagihan progress sampai separuh log tervalidasi — sisanya dibiarkan untuk dicoba dari layar. */
const seedConstruction = async (admin, finance) => {
  const logs = await prisma.dailyProgressLog.findMany({ where: { status: 'validated' }, orderBy: [{ subProjectId: 'asc' }, { progressDate: 'asc' }] });
  if (logs.length < 2) return 'dilewati (progress tervalidasi < 2)';
  const stage = logs.filter((l) => l.subProjectId === logs[0].subProjectId);
  const cut = stage[Math.floor((stage.length - 1) / 2)];
  const record = await recordSvc.create({
    subProjectId: cut.subProjectId, periodStart: toDateOnly(stage[0].progressDate), periodEnd: toDateOnly(cut.progressDate),
    notes: 'Termin 1 — progress disetujui pengawas klien di lokasi',
  }, admin);
  await recordSvc.verify(record.id, { notes: 'Sesuai berita acara progress.' }, finance);
  const partial = Math.round(record.totalAmount * 0.4);
  await paymentSvc.create({ incomeRecordId: record.id, paymentDate: toDateOnly(todayDate()), amount: partial, payerName: record.context.clientName ?? 'Klien', paymentMethod: 'transfer', referenceNumber: 'TRF-DEMO-001' }, [], finance);
  return `${record.incomeCode} verified, dibayar 40% (Rp${partial})`;
};

/** Rental: separuh tanggal pertama ditagih & lunas, sisanya menunggu verifikasi Finance. */
const seedRental = async (admin, finance) => {
  const logs = await prisma.equipmentWorkhourLog.findMany({
    where: { sourceType: 'external_rental', isVoided: false },
    include: { equipmentItem: { select: { defaultHourlyRate: true } }, equipmentPoolItem: { select: { equipmentPool: { select: { externalRentalProjectId: true } } } } },
    orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
  });
  if (!logs.length) return 'dilewati (belum ada jam kerja rental)';
  const rentalId = logs[0].equipmentPoolItem.equipmentPool.externalRentalProjectId;
  const contractLogs = logs.filter((l) => l.equipmentPoolItem.equipmentPool.externalRentalProjectId === rentalId);
  const dates = [...new Set(contractLogs.map((l) => toDateOnly(l.workDate)))];
  const split = Math.max(1, Math.floor(dates.length / 2));
  const item = (l) => ({ equipmentWorkhourLogId: l.id, unitRate: Number(l.equipmentItem.defaultHourlyRate) });
  const first = contractLogs.filter((l) => dates.slice(0, split).includes(toDateOnly(l.workDate)));
  const rest = contractLogs.filter((l) => !first.includes(l));

  const paid = await recordSvc.create({ externalRentalProjectId: rentalId, periodStart: dates[0], periodEnd: dates[split - 1], items: first.map(item), notes: 'Tagihan sewa periode pertama' }, admin);
  await recordSvc.verify(paid.id, { notes: null }, finance);
  await paymentSvc.create({ incomeRecordId: paid.id, paymentDate: toDateOnly(todayDate()), amount: paid.totalAmount, paymentMethod: 'transfer', referenceNumber: 'TRF-DEMO-002' }, [], finance);
  let waiting = null;
  if (rest.length) {
    waiting = await recordSvc.create({ externalRentalProjectId: rentalId, periodStart: dates[split], periodEnd: dates[dates.length - 1], items: rest.map(item), notes: 'Tagihan sewa periode kedua' }, admin);
  }
  return `${paid.incomeCode} lunas${waiting ? `, ${waiting.incomeCode} menunggu Finance` : ''}`;
};

/** Klaim pendapatan alat atas jam kerja yang tagihannya sudah lunas — menunggu Finance. */
const seedClaim = async (alat) => {
  const claim = await claimSvc.create({ periodStart: '2026-01-01', periodEnd: toDateOnly(todayDate()), notes: 'Klaim jam kerja rental yang sudah dibayar klien' }, alat);
  return `${claim.claimCode} menunggu Finance (Rp${claim.totalAmount}, ${claim.totalHours} jam)`;
};

const seedIncomeDemo = async () => {
  console.log('Seeding demo Income...');
  if (await prisma.incomeRecord.count()) { console.log('  dilewati (sudah ada income record)'); return; }
  const [admin, finance, alat] = [await userOf('admin'), await userOf('finance'), await userOf('alat')];
  console.log(`  tarif default demo: ${await seedRates()} unit diisi`);
  for (const [label, run] of [['konstruksi', () => seedConstruction(admin, finance)], ['rental', () => seedRental(admin, finance)], ['klaim alat', () => seedClaim(alat)]]) {
    try {
      console.log(`  - ${label}: ${await run()}`);
    } catch (err) {
      console.log(`  - ${label}: GAGAL ${err.message}`);
    }
  }
};

module.exports = { seedIncomeDemo };
