/**
 * Purchase Order — localStorage-backed demo service.
 * The purchase-request API is documented but not mounted yet, so these records
 * are intentionally kept separate from database-backed equipment data. Divisi
 * Alat may submit/edit pending requests only; approval and rejection belong to
 * another module.
 */

const STORAGE_KEY = 'po_data';
const SEQ_KEY = 'po_seq';

const SEED_DATA = [
  {
    id: 1,
    orderCode: 'PO-2023-0892',
    date: '2023-10-10',
    category: 'suku_cadang',
    unitAlat: 'Bulldozer-02',
    description: 'Ban Bulldozer',
    quantity: 3,
    unitPrice: 600000,
    totalPrice: 1800000,
    status: 'pending',
    notes: '',
  },
  {
    id: 2,
    orderCode: 'PO-2023-0893',
    date: '2023-10-11',
    category: 'service_rutin',
    unitAlat: 'HINO DT-01',
    description: 'Ganti Oli Gardan',
    quantity: 1,
    unitPrice: 500000,
    totalPrice: 500000,
    status: 'approved',
    notes: '',
  },
  {
    id: 3,
    orderCode: 'PO-2023-0894',
    date: '2023-10-14',
    category: 'suku_cadang',
    unitAlat: 'Bulldozer-03',
    description: 'Knalpot bulldozer',
    quantity: 10,
    unitPrice: 150000,
    totalPrice: 1500000,
    status: 'approved',
    notes: '',
  },
  {
    id: 4,
    orderCode: 'PO-2023-0895',
    date: '2023-10-15',
    category: 'service_rutin',
    unitAlat: 'Excavator-PC200',
    description: 'Ganti Filter Oli & Inspeksi',
    quantity: 1,
    unitPrice: 850000,
    totalPrice: 850000,
    status: 'rejected',
    notes: 'Budget exceeded',
  },
];

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    localStorage.setItem(SEQ_KEY, '4');
    return [...SEED_DATA];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...SEED_DATA];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return [...SEED_DATA];
  }
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
  return `PO-${year}-${String(seq).padStart(4, '0')}`;
}

// ---------- public API ----------

export function getPurchaseOrders({ search = '', status = '', startDate = '', endDate = '' } = {}) {
  let rows = readAll();

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.orderCode.toLowerCase().includes(q) ||
        r.unitAlat.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }

  if (status && status !== 'all') {
    rows = rows.filter((r) => r.status === status);
  }

  if (startDate) {
    rows = rows.filter((r) => r.date >= startDate);
  }
  if (endDate) {
    rows = rows.filter((r) => r.date <= endDate);
  }

  // newest first
  rows.sort((a, b) => b.id - a.id);
  return rows;
}

export function getPurchaseOrderById(id) {
  const rows = readAll();
  return rows.find((r) => r.id === Number(id)) || null;
}

export function createPurchaseOrder(data) {
  const rows = readAll();
  const code = generateCode();
  const id = nextId();
  const totalPrice = (Number(data.quantity) || 0) * (Number(data.unitPrice) || 0);
  const newItem = {
    id,
    orderCode: code,
    date: data.date || new Date().toISOString().slice(0, 10),
    category: data.category || 'suku_cadang',
    unitAlat: data.unitAlat || '',
    description: data.description || '',
    quantity: Number(data.quantity) || 0,
    unitPrice: Number(data.unitPrice) || 0,
    totalPrice,
    status: 'pending',
    notes: data.notes || '',
  };
  rows.push(newItem);
  writeAll(rows);
  return newItem;
}

export function updatePurchaseOrder(id, data) {
  if (Object.prototype.hasOwnProperty.call(data, 'status')) {
    throw new Error('Status purchase request hanya dapat diubah oleh modul approval lain.');
  }
  const rows = readAll();
  const idx = rows.findIndex((r) => r.id === Number(id));
  if (idx === -1) throw new Error('Purchase order tidak ditemukan');
  if (rows[idx].status !== 'pending') {
    throw new Error('Purchase order yang sudah diproses modul lain tidak dapat diubah dari Divisi Alat.');
  }
  const updated = { ...rows[idx], ...data };
  updated.totalPrice = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0);
  rows[idx] = updated;
  writeAll(rows);
  return updated;
}

export function deletePurchaseOrder(id) {
  const rows = readAll();
  const target = rows.find((row) => row.id === Number(id));
  if (!target) throw new Error('Purchase order tidak ditemukan');
  if (target.status !== 'pending') {
    throw new Error('Purchase order yang sudah diproses modul lain tidak dapat dihapus dari Divisi Alat.');
  }
  writeAll(rows.filter((row) => row.id !== Number(id)));
}

export const CATEGORY_OPTIONS = [
  { value: 'suku_cadang', label: 'Suku Cadang' },
  { value: 'service_rutin', label: 'Service Rutin' },
];

export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved (Other Module)' },
  { value: 'rejected', label: 'Rejected (Other Module)' },
];

export const categoryLabel = (val) => CATEGORY_OPTIONS.find((o) => o.value === val)?.label || val;
export const statusLabel = (val) => STATUS_OPTIONS.find((o) => o.value === val)?.label || val;
