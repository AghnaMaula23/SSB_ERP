const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { ACCOUNTS, normalBalanceOf } = require('./accounts.js');

// ============================================================
// CHART OF ACCOUNTS (plan Finance F4, diubah 18 Nov 2026 — bagian 8a).
//
// Akun SISTEM = kode di konstanta ACCOUNTS: dipakai jurnal otomatis dan disinkronkan
// seeder, jadi TERKUNCI dari API (ubah lewat accounts.js, satu commit). Finance boleh
// menambah akun lain dan mengubahnya; kode & jenis akun terkunci begitu akun dipakai
// baris jurnal. Akun tidak dihapus — nonaktifkan. Akun buatan Finance belum dipakai
// jurnal otomatis mana pun (pemetaan sumber → akun ada di kode).
// ============================================================

const SYSTEM_CODES = new Set(Object.values(ACCOUNTS));
// Digit pertama kode = golongan (1 aset, 2 kewajiban, 3 ekuitas, 4 pendapatan, 5 HPP / 6 beban)
const CODE_PREFIX = { asset: ['1'], liability: ['2'], equity: ['3'], revenue: ['4'], expense: ['5', '6'] };
const CODE_PATTERN = /^[1-6]-\d{4}$/;

const shape = (r) => ({
  id: r.id,
  accountCode: r.accountCode,
  accountName: r.accountName,
  accountType: r.accountType,
  normalBalance: normalBalanceOf(r.accountType),
  description: r.description,
  isActive: r.isActive,
  isSystem: SYSTEM_CODES.has(r.accountCode),
});

const list = async ({ accountType, isActive }) => {
  const rows = await prisma.chartOfAccount.findMany({
    where: { ...(accountType && { accountType }), ...(isActive !== undefined && { isActive }) },
    orderBy: { accountCode: 'asc' },
  });
  return rows.map(shape);
};

const assertCodeFits = (code, type) => {
  if (!CODE_PATTERN.test(code)) throw httpError('Kode akun berformat N-NNNN, contoh 6-2200', 400);
  if (!CODE_PREFIX[type].includes(code[0])) {
    throw httpError(`Akun jenis ${type} berawalan ${CODE_PREFIX[type].join(' atau ')}-`, 400);
  }
  if (SYSTEM_CODES.has(code)) throw httpError(`Kode ${code} dicadangkan untuk akun sistem`, 409);
};

/** Pesan yang bisa ditindaklanjuti untuk kode/nama kembar (unique tetap jaring terakhir, P2002). */
const assertUnique = async ({ accountCode, accountName }, exceptId = null) => {
  const other = await prisma.chartOfAccount.findFirst({
    where: { OR: [{ accountCode }, { accountName: { equals: accountName, mode: 'insensitive' } }], NOT: exceptId ? { id: exceptId } : undefined },
  });
  if (!other) return;
  throw httpError(other.accountCode === accountCode
    ? `Kode ${accountCode} sudah dipakai akun ${other.accountName}`
    : `Nama akun "${accountName}" sudah dipakai kode ${other.accountCode}`, 409);
};

const create = async ({ accountCode, accountName, accountType, description }) => {
  const data = { accountCode: accountCode.trim(), accountName: accountName.trim(), accountType, description: description?.trim() || null };
  assertCodeFits(data.accountCode, accountType);
  await assertUnique(data);
  return shape(await prisma.chartOfAccount.create({ data }));
};

const update = async (id, payload) => {
  const current = await prisma.chartOfAccount.findUnique({ where: { id } });
  if (!current) throw httpError('Akun tidak ditemukan', 404);
  if (SYSTEM_CODES.has(current.accountCode)) {
    throw httpError(`Akun ${current.accountCode} adalah akun sistem (dipakai jurnal otomatis) dan tidak bisa diubah dari layar`, 409);
  }
  const next = {
    accountCode: payload.accountCode?.trim() ?? current.accountCode,
    accountName: payload.accountName?.trim() ?? current.accountName,
    accountType: payload.accountType ?? current.accountType,
  };
  const structural = next.accountCode !== current.accountCode || next.accountType !== current.accountType;
  if (structural) {
    const used = await prisma.journalEntryLine.count({ where: { accountId: id } });
    if (used) throw httpError(`Akun ${current.accountCode} sudah dipakai ${used} baris jurnal — kode dan jenisnya tidak bisa diubah. Nonaktifkan lalu buat akun baru.`, 409);
    assertCodeFits(next.accountCode, next.accountType);
  }
  await assertUnique(next, id);
  return shape(await prisma.chartOfAccount.update({
    where: { id },
    data: {
      ...next,
      ...(payload.description !== undefined && { description: payload.description?.trim() || null }),
      ...(payload.isActive !== undefined && { isActive: payload.isActive }),
    },
  }));
};

module.exports = { list, create, update };
