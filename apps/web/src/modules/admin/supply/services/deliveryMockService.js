// ============================================================
// DATA CONTOH — ritase kontrak supply contoh (demo-N) saja.
//
// Kontrak asli membaca /api/material-deliveries (deliveryService.js). Data
// contoh dibangkitkan deterministik, baca-saja — pencatatan ritase milik
// Divisi Lapangan (backlog E15). Disimpan di localStorage supaya stabil dan
// dibersihkan saat sign out (services/auth.js).
// ============================================================

// v3: bentuk baris mengikuti API delivery (satuan, supplier, penerimaan).
const STORE_KEY = 'admin_mock_supply_deliveries_v3';

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

const notePrefix = (projectId) => String(projectId).replace('demo-', 'D').toUpperCase();
const SUPPLIERS = ['CV Batu Alam Arjawinangun', 'PT Galunggung Pasir Jaya', 'CV Jatiluhur Agregat'];

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
        unit: 'm³',
        supplier: SUPPLIERS[ROUTES.findIndex((route) => route[0] === material) % SUPPLIERS.length],
        isCancelled: false,
        // Ritase hari ini sebagian belum dikonfirmasi penerimaannya.
        received: day > 0 || next() > 0.5,
        fileId: null,
        isDemo: true,
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

const clone = (value) => JSON.parse(JSON.stringify(value));

export async function listDemoDeliveries(projectId) {
  const store = readStore();
  if (!store[projectId]) {
    store[projectId] = seed(projectId);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* data contoh tetap tampil tanpa disimpan */ }
  }
  return clone(store[projectId]);
}
