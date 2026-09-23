/**
 * Kas (Cash) — localStorage-backed mock service.
 * Swap these functions with real apiRequest() calls once the backend is ready.
 */

const STORAGE_KEY = 'kas_data';
const SEQ_KEY = 'kas_seq';

const SEED_DATA = [
  {
    id: 1,
    transactionCode: 'KAS-2024-0001',
    date: '2024-05-24',
    type: 'masuk',
    category: 'rental_unit',
    unitAlat: '-',
    description: 'Transfer pusat peri',
    nominal: 15000000,
  },
  {
    id: 2,
    transactionCode: 'KAS-2024-0002',
    date: '2024-05-25',
    type: 'keluar',
    category: 'solar_hsd',
    unitAlat: 'Bulldozer01',
    description: 'Pengisian 200L solar',
    nominal: 3400000,
  },
  {
    id: 3,
    transactionCode: 'KAS-2024-0003',
    date: '2024-05-26',
    type: 'keluar',
    category: 'sparepart',
    unitAlat: 'Bulldozer02',
    description: 'Ban Bulldozer',
    nominal: 1250000,
  },
  {
    id: 4,
    transactionCode: 'KAS-2024-0004',
    date: '2024-05-27',
    type: 'masuk',
    category: 'rental_unit',
    unitAlat: '-',
    description: 'PT Sinar Utara',
    nominal: 5000000,
  },
  {
    id: 5,
    transactionCode: 'KAS-2024-0005',
    date: '2024-05-28',
    type: 'keluar',
    category: 'servis_rutin',
    unitAlat: 'Excavator-PC200',
    description: 'Service berkala 500 jam',
    nominal: 2800000,
  },
];

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    localStorage.setItem(SEQ_KEY, '5');
    return [...SEED_DATA];
  }
  return JSON.parse(raw);
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function nextId() {
  const seq = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
  localStorage.setItem(SEQ_KEY, String(seq));
  return seq;
}

function generateCode() {
  const now = new Date();
  const year = now.getFullYear();
  const seq = Number(localStorage.getItem(SEQ_KEY) || '0') + 1;
  return `KAS-${year}-${String(seq).padStart(4, '0')}`;
}

// ---------- public API ----------

export function getKasSummary() {
  const rows = readAll();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let totalMasuk = 0;
  let totalKeluar = 0;
  let monthlyMasuk = 0;
  let monthlyKeluar = 0;

  rows.forEach((r) => {
    const d = new Date(r.date);
    if (r.type === 'masuk') {
      totalMasuk += r.nominal;
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) monthlyMasuk += r.nominal;
    } else {
      totalKeluar += r.nominal;
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) monthlyKeluar += r.nominal;
    }
  });

  return {
    saldo: totalMasuk - totalKeluar,
    monthlyIncome: monthlyMasuk,
    monthlyExpense: monthlyKeluar,
  };
}

export function getKasTransactions({ search = '', type = '', category = '' } = {}) {
  let rows = readAll();

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.transactionCode.toLowerCase().includes(q) ||
        r.unitAlat.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }

  if (type && type !== 'all') {
    rows = rows.filter((r) => r.type === type);
  }

  if (category && category !== 'all') {
    rows = rows.filter((r) => r.category === category);
  }

  rows.sort((a, b) => b.id - a.id);
  return rows;
}

export function getKasTransactionById(id) {
  const rows = readAll();
  return rows.find((r) => r.id === Number(id)) || null;
}

export function createKasTransaction(data) {
  const rows = readAll();
  const code = generateCode();
  const id = nextId();
  const newItem = {
    id,
    transactionCode: code,
    date: data.date || new Date().toISOString().slice(0, 10),
    type: data.type || 'keluar',
    category: data.category || 'operasional',
    unitAlat: data.unitAlat || '-',
    description: data.description || '',
    nominal: Number(data.nominal) || 0,
  };
  rows.push(newItem);
  writeAll(rows);
  return newItem;
}

export function updateKasTransaction(id, data) {
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === Number(id));
  if (idx === -1) throw new Error('Transaksi kas tidak ditemukan');
  rows[idx] = { ...rows[idx], ...data, nominal: Number(data.nominal ?? rows[idx].nominal) };
  writeAll(rows);
  return rows[idx];
}

export function deleteKasTransaction(id) {
  const rows = readAll();
  const filtered = rows.filter((r) => r.id !== Number(id));
  writeAll(filtered);
}

export const TYPE_OPTIONS = [
  { value: 'masuk', label: 'Pemasukan' },
  { value: 'keluar', label: 'Pengeluaran' },
];

export const CATEGORY_OPTIONS = [
  { value: 'rental_unit', label: 'Rental Unit' },
  { value: 'solar_hsd', label: 'Solar HSD' },
  { value: 'sparepart', label: 'Sparepart' },
  { value: 'servis_rutin', label: 'Servis Rutin' },
  { value: 'operasional', label: 'Operasional' },
  { value: 'lainnya', label: 'Lainnya' },
];

export const UNIT_OPTIONS = [
  'Bulldozer01', 'Bulldozer02', 'Bulldozer03',
  'Excavator-PC200', 'HINO DT-01', 'Wheel Loader-05',
];

export const typeLabel = (val) => TYPE_OPTIONS.find((o) => o.value === val)?.label || val;
export const categoryLabel = (val) => CATEGORY_OPTIONS.find((o) => o.value === val)?.label || val;

export function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID').format(num);
}
