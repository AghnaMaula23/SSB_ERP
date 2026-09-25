import { getAllItems } from './alatService.js';

/**
 * Kas (Cash) — localStorage-backed demo service.
 * Cash-in is reserved for approved income claims and cash-out for approved
 * purchase requests. Divisi Alat may only add manual transactions in `other`.
 * The cash API is not mounted yet, so the records remain demo-only.
 */

const STORAGE_KEY = 'kas_data';
const SEQ_KEY = 'kas_seq';

const SEED_DATA = [
  {
    id: 1,
    transactionCode: 'KAS-2024-0001',
    date: '2024-05-24',
    type: 'masuk',
    category: 'income_claim',
    source: 'income_claim',
    sourceId: 'DEMO-CLM-0001',
    unitAlat: '-',
    description: 'Contoh cash-in dari claim pendapatan (approved)',
    nominal: 15000000,
  },
  {
    id: 2,
    transactionCode: 'KAS-2024-0002',
    date: '2024-05-25',
    type: 'keluar',
    category: 'purchase_request',
    source: 'purchase_request',
    sourceId: 'DEMO-PO-0001',
    unitAlat: 'Bulldozer01',
    description: 'Contoh cash-out dari purchase request (approved)',
    nominal: 3400000,
  },
  {
    id: 3,
    transactionCode: 'KAS-2024-0003',
    date: '2024-05-26',
    type: 'masuk',
    category: 'other',
    source: 'manual',
    sourceId: 'MANUAL-0001',
    unitAlat: '-',
    description: 'Penerimaan lain di luar claim pendapatan',
    nominal: 1250000,
  },
  {
    id: 4,
    transactionCode: 'KAS-2024-0004',
    date: '2024-05-27',
    type: 'masuk',
    category: 'income_claim',
    source: 'income_claim',
    sourceId: 'DEMO-CLM-0002',
    unitAlat: '-',
    description: 'Contoh cash-in dari claim pendapatan (approved)',
    nominal: 5000000,
  },
  {
    id: 5,
    transactionCode: 'KAS-2024-0005',
    date: '2024-05-28',
    type: 'keluar',
    category: 'purchase_request',
    source: 'purchase_request',
    sourceId: 'DEMO-PO-0002',
    unitAlat: 'Excavator-PC200',
    description: 'Contoh cash-out dari purchase request (approved)',
    nominal: 2800000,
  },
];

const SOURCE_LABELS = {
  income_claim: 'Income Claim',
  purchase_request: 'Purchase Request',
  manual: 'Manual',
  legacy: 'Legacy / dummy',
};

function normalizeTransaction(row) {
  const source = row.source || 'legacy';
  const category = source === 'manual' || source === 'legacy' ? 'other' : source;
  return {
    ...row,
    id: row.id,
    transactionCode: row.transactionCode || `KAS-${row.date || ''}-${row.id}`,
    date: row.date || '',
    type: row.type === 'masuk' ? 'masuk' : 'keluar',
    category,
    source,
    sourceId: row.sourceId || row.transactionCode || '',
    unitAlat: row.unitAlat || '-',
    description: row.description || '',
    nominal: Number(row.nominal) || 0,
    sourceLabel: SOURCE_LABELS[source] || source,
  };
}

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    localStorage.setItem(SEQ_KEY, String(SEED_DATA.length));
    return SEED_DATA.map(normalizeTransaction);
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeTransaction) : [];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return SEED_DATA.map(normalizeTransaction);
  }
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function nextId() {
  const next = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
  localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

export function getKasSummary() {
  const rows = readAll();
  const now = new Date();
  let totalMasuk = 0;
  let totalKeluar = 0;
  let monthlyMasuk = 0;
  let monthlyKeluar = 0;

  rows.forEach((row) => {
    const date = new Date(row.date);
    if (row.type === 'masuk') {
      totalMasuk += row.nominal;
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) monthlyMasuk += row.nominal;
    } else {
      totalKeluar += row.nominal;
      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) monthlyKeluar += row.nominal;
    }
  });

  return { saldo: totalMasuk - totalKeluar, monthlyIncome: monthlyMasuk, monthlyExpense: monthlyKeluar };
}

export function getKasTransactions({ search = '', type = '', category = '' } = {}) {
  let rows = readAll();
  if (search) {
    const query = search.toLowerCase();
    rows = rows.filter((row) => [row.transactionCode, row.unitAlat, row.description, row.sourceId]
      .some((value) => String(value || '').toLowerCase().includes(query)));
  }
  if (type && type !== 'all') rows = rows.filter((row) => row.type === type);
  if (category && category !== 'all') rows = rows.filter((row) => row.category === category);
  return rows.sort((a, b) => b.id - a.id);
}

export function getKasTransactionById(id) {
  return readAll().find((row) => row.id === Number(id)) || null;
}

export function createKasTransaction(data) {
  if (data.category && data.category !== 'other') {
    throw new Error('Transaksi manual hanya dapat memakai category Other.');
  }
  const rows = readAll();
  const id = nextId();
  const newItem = normalizeTransaction({
    id,
    transactionCode: `KAS-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`,
    date: data.date || new Date().toISOString().slice(0, 10),
    type: data.type || 'keluar',
    category: 'other',
    source: 'manual',
    sourceId: `MANUAL-${String(id).padStart(4, '0')}`,
    unitAlat: data.unitAlat || '-',
    description: data.description || '',
    nominal: Number(data.nominal) || 0,
  });
  writeAll([...rows, newItem]);
  return newItem;
}

export function updateKasTransaction(id, data) {
  const rows = readAll();
  const index = rows.findIndex((row) => row.id === Number(id));
  if (index === -1) throw new Error('Transaksi kas tidak ditemukan');
  if (rows[index].source !== 'manual' && rows[index].source !== 'legacy') throw new Error('Transaksi otomatis tidak dapat diubah dari modul alat.');
  rows[index] = normalizeTransaction({ ...rows[index], ...data, category: 'other', source: 'manual' });
  writeAll(rows);
  return rows[index];
}

export function deleteKasTransaction(id) {
  const rows = readAll();
  const target = rows.find((row) => row.id === Number(id));
  if (!target) throw new Error('Transaksi kas tidak ditemukan');
  if (target.source !== 'manual' && target.source !== 'legacy') throw new Error('Transaksi otomatis tidak dapat dihapus dari modul alat.');
  writeAll(rows.filter((row) => row.id !== Number(id)));
}

export const TYPE_OPTIONS = [
  { value: 'masuk', label: 'Pemasukan' },
  { value: 'keluar', label: 'Pengeluaran' },
];

export const CATEGORY_OPTIONS = [
  { value: 'income_claim', label: 'Income Claim (otomatis)' },
  { value: 'purchase_request', label: 'Purchase Request (otomatis)' },
  { value: 'other', label: 'Other' },
];

export const UNIT_OPTIONS = [
  'Bulldozer01', 'Bulldozer02', 'Bulldozer03',
  'Excavator-PC200', 'HINO DT-01', 'Wheel Loader-05',
];

export async function getEquipmentUnitOptions() {
  try {
    const result = await getAllItems({ isActive: true });
    const databaseUnits = [...new Set(result.data
      .filter((item) => item.status !== 'retired')
      .map((item) => item.itemCode)
      .filter(Boolean))];
    return databaseUnits.length ? databaseUnits : [...UNIT_OPTIONS];
  } catch {
    return [...UNIT_OPTIONS];
  }
}

export const typeLabel = (value) => TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
export const categoryLabel = (value) => CATEGORY_OPTIONS.find((option) => option.value === value)?.label || value;
export const sourceLabel = (value) => SOURCE_LABELS[value] || value;

export function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID').format(num);
}
