// ============================================================
// DATA CONTOH — ritase / surat jalan pengiriman material supply.
//
// Backend baru punya header external_supply_projects; tabel pengiriman per
// ritase BELUM ADA. Disimpan di localStorage per browser dan dibersihkan saat
// sign out (services/auth.js). Fungsinya async supaya halaman tidak perlu
// diubah ketika diganti ke apiRequest.
// ============================================================

// v2: data contoh diperbanyak — kunci baru supaya isi lama ikut diganti.
const STORE_KEY = 'admin_mock_supply_deliveries_v2';

export const VEHICLE_TYPES = ['Dump Truck 10R', 'Dump Truck 6R', 'Hino FM260', 'Hino 500 FG', 'Trailer'];
export const MATERIALS = ['Base A Aggregate', 'Base B Aggregate', 'Sub-Base B', 'Split 2/3', 'Split 1/2', 'Sand - Pasir Cuci', 'Pasir Urug', 'Tanah Timbun'];

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

// Armada & rute contoh. Tiap kontrak memakai kombinasi berbeda supaya data
// antar-kontrak tidak terlihat identik.
const FLEET = [
  ['Dump Truck 10R', 'B 9021 WKA', 'Sutrisno M.'],
  ['Dump Truck 10R', 'B 9144 PWJ', 'Ahmad Fauzi'],
  ['Hino FM260', 'D 8820 TRK', 'Bambang S.'],
  ['Hino FM260', 'D 8911 JKD', 'Rudi Setiawan'],
  ['Dump Truck 6R', 'T 8456 KL', 'Dedi Kurniawan'],
  ['Hino 500 FG', 'E 9310 PA', 'Yusuf Hidayat'],
];
const ROUTES = [
  ['Base A Aggregate', 'Quarry Arjawinangun', 'STA 12+400'],
  ['Split 2/3', 'Quarry Arjawinangun', 'Batching Plant'],
  ['Sand - Pasir Cuci', 'Galunggung Depo', 'Batching Plant'],
  ['Sub-Base B', 'Quarry Arjawinangun', 'STA 14+200'],
  ['Pasir Urug', 'Galunggung Depo', 'Area Timbunan'],
  ['Split 1/2', 'Quarry Jatiluhur', 'Batching Plant'],
];

// Pseudo-acak deterministik: kontrak yang sama selalu dapat data yang sama.
const random = (seedValue) => {
  let state = seedValue;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
};

const notePrefix = (projectId) => (/^\d+$/.test(String(projectId)) ? String(projectId).padStart(3, '0') : String(projectId).replace('demo-', 'D').toUpperCase());

const seed = (projectId) => {
  const next = random([...String(projectId)].reduce((sum, char) => sum + char.charCodeAt(0), 7));
  const fleet = FLEET.slice(0, 3 + Math.floor(next() * 4));
  const routes = ROUTES.slice(0, 3 + Math.floor(next() * 3));
  const rows = [];
  // 10 hari terakhir, 2–4 ritase per hari; sesekali hari libur.
  for (let day = 9; day >= 0; day -= 1) {
    if (day !== 0 && next() < 0.15) continue;
    const trips = 2 + Math.floor(next() * 3);
    for (let trip = 0; trip < trips; trip += 1) {
      const [vehicleType, plateNumber, driverName] = fleet[Math.floor(next() * fleet.length)];
      const [material, originLocation, destination] = routes[Math.floor(next() * routes.length)];
      const capacity = vehicleType === 'Dump Truck 6R' ? 12 : 20;
      rows.push({
        id: rows.length + 1,
        deliveryDate: daysAgo(day),
        deliveryNoteNo: `SJ-${notePrefix(projectId)}-${9821 + rows.length}`,
        vehicleType,
        plateNumber,
        driverName,
        material,
        originLocation,
        destinationLocation: `${destination} ${['Toll Subang', 'Proyek', 'Lokasi Kerja'][Math.floor(next() * 3)]}`,
        volume: Math.round((capacity + next() * 4.5) * 2) / 2,
        notes: '',
        createdAt: new Date().toISOString(),
      });
    }
  }
  return rows;
};

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function bucket(projectId) {
  const store = readStore();
  if (!store[projectId]) {
    store[projectId] = seed(projectId);
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }
  return { store, rows: store[projectId] };
}

const save = (store) => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const clone = (value) => JSON.parse(JSON.stringify(value));

class MockValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

const fromForm = (form) => ({
  deliveryDate: form.deliveryDate,
  deliveryNoteNo: form.deliveryNoteNo.trim().toUpperCase(),
  vehicleType: form.vehicleType,
  plateNumber: form.plateNumber.trim().toUpperCase().replace(/\s+/g, ' '),
  driverName: form.driverName.trim(),
  material: form.material,
  originLocation: form.originLocation.trim(),
  destinationLocation: form.destinationLocation.trim(),
  volume: Number(form.volume),
  notes: form.notes.trim(),
});

// Nomor surat jalan unik per project — satu surat jalan = satu ritase.
function assertUniqueNote(rows, noteNo, exceptId) {
  if (rows.some((row) => row.deliveryNoteNo === noteNo && row.id !== exceptId)) {
    throw new MockValidationError('Nomor surat jalan sudah tercatat.', [{ field: 'deliveryNoteNo', message: 'Nomor surat jalan sudah dipakai.' }]);
  }
}

export async function listDeliveries(projectId) {
  return clone(bucket(projectId).rows);
}

export async function getDelivery(projectId, id) {
  const row = bucket(projectId).rows.find((item) => item.id === Number(id));
  if (!row) throw new Error('Ritase tidak ditemukan.');
  return clone(row);
}

export async function createDelivery(projectId, form) {
  const { store, rows } = bucket(projectId);
  const data = fromForm(form);
  assertUniqueNote(rows, data.deliveryNoteNo);
  const row = { id: rows.reduce((max, item) => Math.max(max, item.id), 0) + 1, ...data, createdAt: new Date().toISOString() };
  rows.push(row);
  save(store);
  return clone(row);
}

export async function updateDelivery(projectId, id, form) {
  const { store, rows } = bucket(projectId);
  const index = rows.findIndex((item) => item.id === Number(id));
  if (index < 0) throw new Error('Ritase tidak ditemukan.');
  const data = fromForm(form);
  assertUniqueNote(rows, data.deliveryNoteNo, rows[index].id);
  rows[index] = { ...rows[index], ...data };
  save(store);
  return clone(rows[index]);
}

export async function removeDelivery(projectId, id) {
  const { store, rows } = bucket(projectId);
  store[projectId] = rows.filter((item) => item.id !== Number(id));
  save(store);
}

/** Nomor surat jalan berikutnya sebagai saran isian form. */
export async function suggestNoteNo(projectId) {
  const { rows } = bucket(projectId);
  const numbers = rows.map((row) => Number(String(row.deliveryNoteNo).split('-').pop())).filter(Number.isFinite);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `SJ-${notePrefix(projectId)}-${next}`;
}
