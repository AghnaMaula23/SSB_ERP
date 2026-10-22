// Data demo Request Material RM-1: master material & supplier, material pool
// untuk construction dan supply project, plus isi pool rental — supaya FE bisa
// membuang lapisan data demo rental/supply (backlog-fe.md E11).
//
// Sama filosofinya dengan project.seed.js: SEMUA lewat service yang dipakai
// controller, bukan prisma.create langsung. Untuk rental ini penting — log jam
// kerja lewat createWorkhourLog ikut menggerakkan total_workhour alat dan
// counter servis, persis seperti input lapangan sungguhan.
//
// BEDA dengan project.seed.js: idempoten PER BAGIAN, bukan "lewati semua kalau
// sudah ada data". Database dev dipakai bersama dan sudah berisi project, jadi
// tiap bagian memeriksa dirinya sendiri dan tidak pernah menghapus apa pun.
const prisma = require('../../config/database.js');
const materialSvc = require('../../modules/material/material.service.js');
const materialPoolSvc = require('../../modules/project/material-pool.service.js');
const projectSvc = require('../../modules/project/project.service.js');
const poolSvc = require('../../modules/project/pool.service.js');
const divisiAlat = require('../../modules/divisi-alat/divisi-alat.service.js');

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Diambil dari daftar material yang dipakai layar supply & inventori FE
const MATERIAL_TYPES = [
  { materialCode: 'AGG-BA', materialName: 'Base A Aggregate', unit: 'm³' },
  { materialCode: 'AGG-BB', materialName: 'Base B Aggregate', unit: 'm³' },
  { materialCode: 'AGG-SBB', materialName: 'Sub-Base B', unit: 'm³' },
  { materialCode: 'SPL-23', materialName: 'Split 2/3', unit: 'm³' },
  { materialCode: 'SPL-12', materialName: 'Split 1/2', unit: 'm³' },
  { materialCode: 'PSR-CUCI', materialName: 'Pasir Cuci', unit: 'm³' },
  { materialCode: 'PSR-URUG', materialName: 'Pasir Urug', unit: 'm³' },
  { materialCode: 'TNH-TIMBUN', materialName: 'Tanah Timbun', unit: 'm³' },
  { materialCode: 'SMN-PC1', materialName: 'Semen Portland Tipe 1', unit: 'sak' },
  { materialCode: 'BBM-SOLAR', materialName: 'Solar B30', unit: 'liter' },
];

const SUPPLIERS = [
  { supplierName: 'Quarry Arjawinangun', phone: '0231-358100', address: 'Arjawinangun, Kab. Cirebon' },
  { supplierName: 'Galunggung Depo', phone: '0265-331200', address: 'Indihiang, Tasikmalaya' },
  { supplierName: 'Quarry Jatiluhur', phone: '0264-201455', address: 'Jatiluhur, Purwakarta' },
];

/** Pool hidup milik owner; dibuat kalau belum ada. Isi ditambahkan yang belum ada saja. */
const ensureMaterialPool = async (ownerType, ownerField, ownerId, materialCodes, userId) => {
  let pool = await prisma.materialPool.findFirst({
    where: { ownerType, [ownerField]: ownerId, status: { in: ['draft', 'active'] } },
  });
  if (!pool) pool = await materialPoolSvc.create({ ownerType, [ownerField]: ownerId }, userId);

  const types = await prisma.materialType.findMany({ where: { materialCode: { in: materialCodes } } });
  const existing = await prisma.materialPoolItem.findMany({ where: { materialPoolId: pool.id }, select: { materialTypeId: true } });
  let added = 0;
  for (const type of types) {
    if (existing.some((e) => e.materialTypeId === type.id)) continue;
    await materialPoolSvc.addItem(pool.id, { materialTypeId: type.id });
    added += 1;
  }
  return { poolCode: pool.poolCode, added };
};

async function seedMaterialDemo(adminId) {
  console.log('Seeding master material & material pool...');

  // ── Master jenis material & supplier ────────────────────────────────────
  let typesAdded = 0;
  for (const type of MATERIAL_TYPES) {
    if (await prisma.materialType.findUnique({ where: { materialCode: type.materialCode } })) continue;
    await materialSvc.createType(type);
    typesAdded += 1;
  }
  let suppliersAdded = 0;
  for (const supplier of SUPPLIERS) {
    const clash = await prisma.supplier.findFirst({ where: { supplierName: { equals: supplier.supplierName, mode: 'insensitive' } } });
    if (clash) continue;
    await materialSvc.createSupplier(supplier);
    suppliersAdded += 1;
  }
  console.log(`  - jenis material +${typesAdded}, supplier +${suppliersAdded}`);

  // ── Supply project: material pool ───────────────────────────────────────
  const supply = await prisma.externalSupplyProject.findFirst({ where: { status: { notIn: ['completed', 'cancelled'] } }, orderBy: { id: 'asc' } });
  if (supply) {
    const r = await ensureMaterialPool('external_supply_project', 'externalSupplyProjectId', supply.id,
      ['SPL-23', 'SPL-12', 'AGG-BA', 'PSR-CUCI'], adminId);
    console.log(`  - ${supply.supplyProjectCode}: material pool ${r.poolCode} (+${r.added} material)`);
  } else {
    console.log('  (tidak ada supply project aktif — bagian supply dilewati)');
  }

  // ── Construction project: material pool untuk tahapan galian/timbunan ───
  const construction = await prisma.constructionProject.findFirst({ where: { status: 'active' }, orderBy: { id: 'asc' } });
  if (construction) {
    const r = await ensureMaterialPool('construction_project', 'constructionProjectId', construction.id,
      ['PSR-URUG', 'TNH-TIMBUN', 'AGG-BA', 'BBM-SOLAR'], adminId);
    console.log(`  - ${construction.projectCode}: material pool ${r.poolCode} (+${r.added} material)`);
  }

  // ── Rental: equipment pool berisi unit + log jam kerja external_rental ──
  // Menggantikan rentalDemoService di FE. Dilewati kalau rental itu sudah
  // punya pool item — tanda bagian ini pernah dijalankan atau diisi manual.
  const rental = await prisma.externalRentalProject.findFirst({ where: { status: 'active' }, orderBy: { id: 'asc' } });
  if (!rental) {
    console.log('  (tidak ada rental project aktif — bagian rental dilewati)');
    return;
  }
  let pool = await prisma.equipmentPool.findFirst({
    where: { ownerType: 'external_rental_project', externalRentalProjectId: rental.id, status: { in: ['draft', 'active'] } },
  });
  if (pool && await prisma.equipmentPoolItem.count({ where: { equipmentPoolId: pool.id } }) > 0) {
    console.log(`  - ${rental.rentalProjectCode}: pool ${pool.poolCode} sudah berisi, dilewati`);
    return;
  }
  if (!pool) pool = await poolSvc.create({ ownerType: 'external_rental_project', externalRentalProjectId: rental.id }, adminId);

  // Unit yang benar-benar bebas: operational, aktif, dan tidak dipegang pool
  // item hidup di pool hidup manapun — aturan yang sama dengan assertItemAssignable.
  const freeUnits = await prisma.equipmentItem.findMany({
    where: {
      currentStatus: 'operational',
      isActive: true,
      poolItems: { none: { status: { in: ['available', 'assigned'] }, equipmentPool: { status: { in: ['draft', 'active'] } } } },
    },
    orderBy: { id: 'asc' },
    take: 2,
  });

  let logs = 0;
  for (const unit of freeUnits) {
    const poolItem = await poolSvc.addItem(pool.id, { equipmentTypeId: unit.equipmentTypeId, equipmentItemId: unit.id });
    for (const day of [5, 4, 3, 2, 1]) {
      await divisiAlat.createWorkhourLog({
        sourceType: 'external_rental',
        equipmentPoolItemId: poolItem.id,
        workDate: daysAgo(day),
        totalWorkhour: 7.5,
        pausedDurationMinutes: 30,
        description: 'Pekerjaan rental harian',
      }, adminId);
      logs += 1;
    }
  }
  console.log(`  - ${rental.rentalProjectCode}: pool ${pool.poolCode}, ${freeUnits.length} unit, ${logs} log jam kerja`);
}

module.exports = { seedMaterialDemo };
