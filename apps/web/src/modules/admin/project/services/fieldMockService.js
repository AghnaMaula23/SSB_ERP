// ============================================================
// DATA CONTOH — Inventory material & Pekerja per tahapan.
//
// Backend-nya BELUM ADA: inventory menunggu modul Request Material, pekerja
// menunggu Finance Field & Labor Payroll (lihat docs/skema-tenaga-kerja-harian.md).
// Disimpan di localStorage per browser dan dibersihkan saat sign out
// (services/auth.js). Bentuk fungsi dibuat async supaya halaman tidak perlu
// diubah ketika diganti ke apiRequest.
// ============================================================

const INVENTORY_KEY = 'admin_mock_inventory';
const WORKER_KEY = 'admin_mock_workers';

export const INVENTORY_CATEGORIES = ['Fuel & Lubricants', 'Aggregates', 'Raw Materials', 'Geosynthetics', 'Maintenance', 'Lainnya'];
export const INVENTORY_UNITS = ['Liter', 'm³', 'Sak (50kg)', 'Roll', 'Unit', 'Kg', 'Batang'];

export const WORKER_ROLES = ['Pelaksana', 'Foreman', 'Operator Excavator', 'Operator Dozer', 'Sopir DT', 'Checker', 'Tukang Cor', 'Tukang Besi', 'Harian K3', 'Helper'];
export const WORKER_STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  standby: { label: 'Standby', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  off_duty: { label: 'Off-Duty', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};
export const EMPLOYMENT_TYPES = { harian: 'Harian', kontrak: 'Kontrak' };

const daysAgo = (days, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
};

const seedInventory = () => {
  const items = [
    ['Solar B30 - High Speed Diesel', 'Fuel & Lubricants', 'Liter', 15400, 2000],
    ['Batu Split 2/3', 'Aggregates', 'm³', 240.5, 50],
    ['Semen Portland Tipe 1', 'Raw Materials', 'Sak (50kg)', 45, 100],
    ['Geotextile Woven 250gr', 'Geosynthetics', 'Roll', 12, 5],
    ['Spare Part CAT 320 Bucket Tooth', 'Maintenance', 'Unit', 8, 4],
  ];
  return items.map(([itemName, category, unit, stock, minStock], index) => ({
    id: index + 1,
    itemName,
    category,
    unit,
    minStock,
    stock,
    updatedAt: daysAgo(index, 14 - index),
    movements: [{ id: 1, type: 'in', quantity: stock, note: 'Saldo awal', date: daysAgo(index + 7).slice(0, 10), createdAt: daysAgo(index + 7) }],
  }));
};

const seedWorkers = () => [
  ['John Doe', '3275010294880001', 'Tukang Cor', 'Grup Beton 1', 'active', 'harian', '081234567801', 150000],
  ['Maria Silva', '3275010298110002', 'Foreman', 'Grup Beton 1', 'standby', 'kontrak', '081234567802', 0],
  ['Robert White', '3275010311440003', 'Tukang Besi', 'Grup Pembesian 2', 'active', 'harian', '081234567803', 140000],
  ['Ali Mansur', '3275010311440099', 'Operator Excavator', 'Unit Alat Berat', 'off_duty', 'kontrak', '081234567804', 0],
].map(([fullName, nik, role, groupName, status, employmentType, phone, dailyWage], index) => ({
  id: index + 1, fullName, nik, role, groupName, status, employmentType, phone, dailyWage,
}));

function readStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(key, store) {
  localStorage.setItem(key, JSON.stringify(store));
}

/** Data per tahapan; diisi contoh saat tahapan pertama kali dibuka. */
function readBucket(key, subProjectId, seed) {
  const store = readStore(key);
  if (!store[subProjectId]) {
    store[subProjectId] = seed();
    writeStore(key, store);
  }
  return { store, rows: store[subProjectId] };
}

const nextId = (rows) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
const clone = (value) => JSON.parse(JSON.stringify(value));

class MockValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

// ---------------- Inventory ----------------

export async function listInventory(subProjectId) {
  return clone(readBucket(INVENTORY_KEY, subProjectId, seedInventory).rows);
}

export async function getInventoryItem(subProjectId, itemId) {
  const item = readBucket(INVENTORY_KEY, subProjectId, seedInventory).rows.find((row) => row.id === Number(itemId));
  if (!item) throw new Error('Barang tidak ditemukan.');
  return clone(item);
}

export async function createInventoryItem(subProjectId, form) {
  const { store, rows } = readBucket(INVENTORY_KEY, subProjectId, seedInventory);
  const name = form.itemName.trim();
  if (rows.some((row) => row.itemName.toLowerCase() === name.toLowerCase())) {
    throw new MockValidationError('Barang dengan nama ini sudah ada di inventory tahapan.', [{ field: 'itemName', message: 'Nama barang sudah dipakai.' }]);
  }
  const now = new Date().toISOString();
  const stock = Number(form.initialStock || 0);
  const item = {
    id: nextId(rows),
    itemName: name,
    category: form.category,
    unit: form.unit,
    minStock: Number(form.minStock || 0),
    stock,
    updatedAt: now,
    movements: stock > 0 ? [{ id: 1, type: 'in', quantity: stock, note: 'Saldo awal', date: now.slice(0, 10), createdAt: now }] : [],
  };
  rows.unshift(item);
  writeStore(INVENTORY_KEY, store);
  return clone(item);
}

/** Mutasi stok: `in` menambah, `out` mengurangi (tidak boleh minus). */
export async function recordInventoryMovement(subProjectId, itemId, form) {
  const { store, rows } = readBucket(INVENTORY_KEY, subProjectId, seedInventory);
  const item = rows.find((row) => row.id === Number(itemId));
  if (!item) throw new Error('Barang tidak ditemukan.');
  const quantity = Number(form.quantity);
  const delta = form.type === 'out' ? -quantity : quantity;
  if (item.stock + delta < 0) {
    throw new MockValidationError(`Stok tidak cukup. Sisa ${item.stock} ${item.unit}.`, [{ field: 'quantity', message: 'Melebihi stok tersedia.' }]);
  }
  const now = new Date().toISOString();
  item.stock = Math.round((item.stock + delta) * 100) / 100;
  item.updatedAt = now;
  item.movements.unshift({ id: nextId(item.movements), type: form.type, quantity, note: form.note.trim(), date: form.date, createdAt: now });
  writeStore(INVENTORY_KEY, store);
  return clone(item);
}

// ---------------- Pekerja ----------------

export async function listWorkers(subProjectId) {
  return clone(readBucket(WORKER_KEY, subProjectId, seedWorkers).rows);
}

export async function getWorker(subProjectId, workerId) {
  const worker = readBucket(WORKER_KEY, subProjectId, seedWorkers).rows.find((row) => row.id === Number(workerId));
  if (!worker) throw new Error('Pekerja tidak ditemukan.');
  return clone(worker);
}

const workerFromForm = (form) => ({
  fullName: form.fullName.trim(),
  nik: form.nik.trim(),
  role: form.role,
  groupName: form.groupName.trim(),
  status: form.status,
  employmentType: form.employmentType,
  phone: form.phone.trim(),
  // Pekerja kontrak dibayar bulanan lewat payroll, bukan upah harian.
  dailyWage: form.employmentType === 'harian' ? Number(form.dailyWage || 0) : 0,
});

function assertUniqueNik(rows, nik, exceptId) {
  if (rows.some((row) => row.nik === nik && row.id !== exceptId)) {
    throw new MockValidationError('NIK sudah terdaftar di tahapan ini.', [{ field: 'nik', message: 'NIK sudah dipakai pekerja lain.' }]);
  }
}

export async function createWorker(subProjectId, form) {
  const { store, rows } = readBucket(WORKER_KEY, subProjectId, seedWorkers);
  const data = workerFromForm(form);
  assertUniqueNik(rows, data.nik);
  const worker = { id: nextId(rows), ...data };
  rows.push(worker);
  writeStore(WORKER_KEY, store);
  return clone(worker);
}

export async function updateWorker(subProjectId, workerId, form) {
  const { store, rows } = readBucket(WORKER_KEY, subProjectId, seedWorkers);
  const index = rows.findIndex((row) => row.id === Number(workerId));
  if (index < 0) throw new Error('Pekerja tidak ditemukan.');
  const data = workerFromForm(form);
  assertUniqueNik(rows, data.nik, rows[index].id);
  rows[index] = { ...rows[index], ...data };
  writeStore(WORKER_KEY, store);
  return clone(rows[index]);
}

export async function removeWorker(subProjectId, workerId) {
  const { store, rows } = readBucket(WORKER_KEY, subProjectId, seedWorkers);
  store[subProjectId] = rows.filter((row) => row.id !== Number(workerId));
  writeStore(WORKER_KEY, store);
}
