// ============================================================
// DATA CONTOH — Income records.
//
// Modul Income BELUM ADA di backend (app.js masih mengomentari
// /api/income). Payload yang disimpan di sini sengaja mengikuti kontrak
// Swagger POST /api/income/records, sehingga begitu backend tersedia cukup
// ganti isi fungsi-fungsi di file ini dengan apiRequest — halaman tidak perlu
// diubah. Disimpan di localStorage dan dibersihkan saat sign out.
// ============================================================

import { lineSubtotal } from '../utils/incomeFormat.js';

const STORE_KEY = 'admin_mock_income_records';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};
const dateOnly = (days) => daysAgo(days).slice(0, 10);
const year = new Date().getFullYear();

const item = (incomeComponentType, sourceType, description, quantity, unit, rateSnapshot, rateSource = 'manual_input', extra = {}) => ({
  incomeComponentType, sourceType, description, quantity, unit, rateSnapshot, rateSource, subtotalAmount: Math.round(quantity * rateSnapshot), ...extra,
});

const SEED = [
  {
    id: 1, referenceCode: `REV-${year}-001`, projectSourceType: 'external_rental', externalRentalProjectId: 'demo-1',
    partyName: 'PT Wika', projectName: 'Jalan Tol Subang', billingPeriodStart: dateOnly(60), billingPeriodEnd: dateOnly(31),
    items: [
      item('equipment_income', 'equipment_workhour_log', 'Excavator Komatsu PC200-8 · SSB-EXC-DEMO1', 168, 'jam', 450000, 'equipment_default_rate'),
      item('equipment_income', 'equipment_workhour_log', 'Buldoser CAT D6R XL · SSB-BLD-DEMO1', 152, 'jam', 500000, 'equipment_default_rate'),
    ],
    status: 'paid', paidAmount: null, createdAt: daysAgo(29), adminNotes: 'Tagihan bulan lalu',
  },
  {
    id: 2, referenceCode: `REV-${year}-002`, projectSourceType: 'external_supply', externalSupplyProjectId: 'demo-1',
    partyName: 'PT Wika', projectName: 'Tol Subang - Section 2', billingPeriodStart: dateOnly(30), billingPeriodEnd: dateOnly(16),
    items: [
      item('material_income', 'material_receipt_item', 'Base A Aggregate', 245.5, 'm3', 285000),
      item('material_income', 'material_receipt_item', 'Split 2/3', 132, 'm3', 310000),
    ],
    status: 'verified', createdAt: daysAgo(14), adminNotes: null,
  },
  {
    id: 3, referenceCode: `REV-${year}-003`, projectSourceType: 'construction_project', constructionProjectId: null, subProjectId: null,
    partyName: 'Dinas PUPR (contoh)', projectName: 'Proyek Trans Kalimantan (contoh)', subProjectLabel: 'Galian',
    billingPeriodStart: dateOnly(30), billingPeriodEnd: dateOnly(1),
    items: [
      item('contract_progress_income', 'contract_progress', 'Progress Galian tervalidasi 12,5%', 12.5, '%', 14400000, 'contract_reference'),
      item('equipment_income', 'equipment_workhour_log', 'Excavator Komatsu PC200', 120, 'jam', 450000, 'equipment_default_rate'),
      item('material_income', 'material_receipt_item', 'Beton Ready Mix K-350', 45, 'm3', 1150000),
    ],
    status: 'submitted', createdAt: daysAgo(1), adminNotes: null,
  },
  {
    id: 4, referenceCode: `REV-${year}-004`, projectSourceType: 'external_rental', externalRentalProjectId: 'demo-2',
    partyName: 'PT Adhi Karya', projectName: 'Jalan Akses Cileunyi', billingPeriodStart: dateOnly(45), billingPeriodEnd: dateOnly(15),
    items: [item('equipment_income', 'equipment_workhour_log', 'Vibro Roller Sakai SV512 · SSB-VBR-DEMO2', 96, 'jam', 350000, 'manual_override', { rateNotes: 'Diskon 10% sesuai kesepakatan' })],
    status: 'rejected', financeNotes: 'Tarif override belum dilampiri addendum kontrak.', createdAt: daysAgo(12), adminNotes: null,
  },
].map((record) => ({
  ...record,
  isDemo: true,
  totalAmount: record.items.reduce((sum, row) => sum + row.subtotalAmount, 0),
  createdBy: { username: 'demo', fullName: 'Data Contoh' },
}));

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(stored)) return stored;
  } catch {
    // jatuh ke data awal
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(SEED));
  return JSON.parse(JSON.stringify(SEED));
}

const write = (rows) => localStorage.setItem(STORE_KEY, JSON.stringify(rows));

export async function listIncomeRecords({ projectSourceType, status } = {}) {
  return read()
    .filter((row) => (!projectSourceType || row.projectSourceType === projectSourceType) && (!status || row.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getIncomeRecord(id) {
  const row = read().find((record) => record.id === Number(id));
  if (!row) throw new Error('Income record tidak ditemukan.');
  return row;
}

/** Kode referensi berikutnya untuk ditampilkan di form sebelum disimpan. */
export async function peekReferenceCode() {
  const rows = read();
  return `REV-${year}-${String(rows.reduce((max, row) => Math.max(max, row.id), 0) + 1).padStart(3, '0')}`;
}

/**
 * Progress kontrak yang SUDAH diajukan untuk satu tahapan (record yang tidak
 * ditolak). Dipakai supaya tagihan progress berikutnya hanya selisihnya —
 * menagih progress yang sama dua kali adalah kesalahan paling mahal di sini.
 */
export async function billedProgressFor(subProjectId) {
  return read()
    .filter((row) => row.status !== 'rejected' && row.subProjectId === subProjectId)
    .flatMap((row) => row.items)
    .filter((row) => row.incomeComponentType === 'contract_progress_income')
    .reduce((acc, row) => ({ percent: acc.percent + Number(row.quantity || 0), amount: acc.amount + row.subtotalAmount }), { percent: 0, amount: 0 });
}

/**
 * Simpan income record. `payload` = bentuk body POST /api/income/records,
 * ditambah label tampilan (partyName, projectName, subProjectLabel) yang di
 * backend nanti diturunkan dari relasi.
 */
export async function createIncomeRecord(payload) {
  const rows = read();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const items = payload.items.map((row) => ({ ...row, subtotalAmount: lineSubtotal(row) }));
  const user = readUser();
  const record = {
    ...payload,
    id,
    referenceCode: `REV-${year}-${String(id).padStart(3, '0')}`,
    items,
    totalAmount: items.reduce((sum, row) => sum + row.subtotalAmount, 0),
    status: 'submitted',
    createdAt: new Date().toISOString(),
    createdBy: { username: user.username, fullName: user.fullName },
  };
  rows.push(record);
  write(rows);
  return record;
}

/** Hanya record yang belum diproses Finance yang boleh ditarik kembali. */
export async function withdrawIncomeRecord(id) {
  const rows = read();
  const row = rows.find((record) => record.id === Number(id));
  if (!row) throw new Error('Income record tidak ditemukan.');
  if (row.status !== 'submitted') throw new Error(`Record berstatus "${row.status}" sudah diproses Finance dan tidak bisa ditarik.`);
  write(rows.filter((record) => record.id !== row.id));
}
