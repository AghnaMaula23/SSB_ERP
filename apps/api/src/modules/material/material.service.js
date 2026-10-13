const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { MATERIAL_UNITS } = require('./material.constants.js');

// ============================================================
// MASTER MATERIAL — jenis material dan supplier (Request Material RM-1).
// Keputusan desain: docs/keputusan-desain-request-material.md
// ============================================================

// ---------- Jenis material ----------

const shapeType = (row) => ({
  id: row.id,
  materialCode: row.materialCode,
  materialName: row.materialName,
  unit: row.unit,
  description: row.description,
  isActive: row.isActive,
  poolItemCount: row._count?.poolItems,
  createdAt: row.createdAt,
});

const TYPE_INCLUDE = { _count: { select: { poolItems: true } } };

const findTypeOrFail = async (id) => {
  const row = await prisma.materialType.findUnique({ where: { id }, include: TYPE_INCLUDE });
  if (!row) throw httpError('Jenis material tidak ditemukan', 404);
  return row;
};

/**
 * Nama unik TANPA melihat huruf besar-kecil: "Pasir Urug" dan "pasir urug"
 * akan memecah stok material yang sama ke dua baris. @unique di database hanya
 * menjaga kecocokan persis, jadi pemeriksaan ini yang menutup sisanya.
 */
const assertTypeNameFree = async (materialName, excludeId) => {
  const clash = await prisma.materialType.findFirst({
    where: { materialName: { equals: materialName, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
  });
  if (clash) throw httpError(`Jenis material "${clash.materialName}" sudah ada`, 409);
};

const listTypes = async ({ page = 1, limit = 20, search, isActive }) => {
  const where = {
    ...(search && {
      OR: [
        { materialCode: { contains: search, mode: 'insensitive' } },
        { materialName: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(isActive !== undefined && { isActive }),
  };
  const [rows, total] = await Promise.all([
    prisma.materialType.findMany({ where, include: TYPE_INCLUDE, orderBy: { materialCode: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.materialType.count({ where }),
  ]);
  return { data: rows.map(shapeType), total, page, limit };
};

const getType = async (id) => shapeType(await findTypeOrFail(id));

/** Kode disimpan uppercase, sehingga @unique juga menolak "agg-ba" vs "AGG-BA". */
const createType = async ({ materialCode, materialName, unit, description }) => {
  const code = materialCode.toUpperCase();
  if (await prisma.materialType.findUnique({ where: { materialCode: code } })) {
    throw httpError(`Jenis material dengan kode "${code}" sudah ada`, 409);
  }
  await assertTypeNameFree(materialName);

  const row = await prisma.materialType.create({
    data: { materialCode: code, materialName, unit, description: description ?? null },
    include: TYPE_INCLUDE,
  });
  return shapeType(row);
};

/**
 * `materialCode` immutable, seperti typeCode alat. `unit` TERKUNCI begitu jenis
 * material dipakai: mengubah m³ ke ton membuat semua angka lama terbaca dalam
 * satuan yang salah. Kalau satuannya keliru sejak awal dan sudah terpakai,
 * buat jenis material baru.
 */
const updateType = async (id, { materialName, unit, description, isActive }) => {
  const row = await findTypeOrFail(id);

  if (materialName !== undefined) await assertTypeNameFree(materialName, id);
  if (unit !== undefined && unit !== row.unit && row._count.poolItems > 0) {
    throw httpError(
      `Satuan "${row.materialName}" tidak bisa diubah karena sudah dipakai di ${row._count.poolItems} pool. ` +
      'Buat jenis material baru kalau satuannya memang berbeda.',
      409
    );
  }

  const updated = await prisma.materialType.update({
    where: { id },
    data: {
      ...(materialName !== undefined && { materialName }),
      ...(unit !== undefined && { unit }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
    },
    include: TYPE_INCLUDE,
  });
  return shapeType(updated);
};

// ---------- Supplier ----------

const shapeSupplier = (row) => ({
  id: row.id,
  supplierName: row.supplierName,
  phone: row.phone,
  address: row.address,
  isActive: row.isActive,
  createdAt: row.createdAt,
});

const findSupplierOrFail = async (id) => {
  const row = await prisma.supplier.findUnique({ where: { id } });
  if (!row) throw httpError('Supplier tidak ditemukan', 404);
  return row;
};

const assertSupplierNameFree = async (supplierName, excludeId) => {
  const clash = await prisma.supplier.findFirst({
    where: { supplierName: { equals: supplierName, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
  });
  if (clash) throw httpError(`Supplier "${clash.supplierName}" sudah ada`, 409);
};

const listSuppliers = async ({ page = 1, limit = 20, search, isActive }) => {
  const where = {
    ...(search && { supplierName: { contains: search, mode: 'insensitive' } }),
    ...(isActive !== undefined && { isActive }),
  };
  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { supplierName: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.supplier.count({ where }),
  ]);
  return { data: rows.map(shapeSupplier), total, page, limit };
};

const getSupplier = async (id) => shapeSupplier(await findSupplierOrFail(id));

const createSupplier = async ({ supplierName, phone, address }) => {
  await assertSupplierNameFree(supplierName);
  const row = await prisma.supplier.create({ data: { supplierName, phone: phone ?? null, address: address ?? null } });
  return shapeSupplier(row);
};

const updateSupplier = async (id, { supplierName, phone, address, isActive }) => {
  await findSupplierOrFail(id);
  if (supplierName !== undefined) await assertSupplierNameFree(supplierName, id);
  const row = await prisma.supplier.update({
    where: { id },
    data: {
      ...(supplierName !== undefined && { supplierName }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return shapeSupplier(row);
};

const listUnits = () => MATERIAL_UNITS;

module.exports = {
  listTypes, getType, createType, updateType,
  listSuppliers, getSupplier, createSupplier, updateSupplier,
  listUnits,
};
