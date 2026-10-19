// ============================================================
// DATA CONTOH — kontrak rental, unit, dan timesheet untuk demo halaman Rental.
//
// Kontrak asli tetap dari API. Data contoh ber-id "demo-N", disimpan di
// localStorage browser ini dan dibersihkan saat sign out (services/auth.js).
// Unit & log memakai bentuk yang SAMA dengan hasil buildUnits() dan workhour
// log API, supaya halaman tidak perlu membedakan cara menampilkannya.
// ============================================================

import { DEMO_DATA_ENABLED } from '../../utils/demoMode.js';

const STORE_KEY = 'admin_mock_rental';

export const isDemoId = (id) => typeof id === 'string' && id.startsWith('demo-');

const year = new Date().getFullYear();
const isoDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const at = (dateText, time) => new Date(`${dateText}T${time}:00`).toISOString();

const PROJECTS = [
  { id: 'demo-1', projectCode: 'RNT-DEMO-01', projectName: 'Jalan Tol Subang', clientName: 'PT Wika', location: 'Tol Subang, Jawa Barat', contractNo: 'SPK/WIKA/RNT/2026/07', contractStartDate: `${year}-08-01`, contractEndDate: `${year}-12-31`, billingMethod: 'hourly', status: 'active' },
  { id: 'demo-2', projectCode: 'RNT-DEMO-02', projectName: 'Jalan Akses Cileunyi', clientName: 'PT Adhi Karya', location: 'Cileunyi, Kab. Bandung', contractNo: 'ADHI/RNT/2026/221', contractStartDate: `${year}-09-01`, contractEndDate: `${year + 1}-02-28`, billingMethod: 'daily', status: 'active' },
  { id: 'demo-3', projectCode: 'RNT-DEMO-03', projectName: 'Pelabuhan Patimban Tahap 2', clientName: 'PT Sinar Utara Banten', location: 'Patimban, Subang', contractNo: 'SUB/RNT/2026/015', contractStartDate: `${year}-11-01`, contractEndDate: `${year + 1}-04-30`, billingMethod: 'monthly', status: 'planned' },
].map((row) => ({ ...row, projectKind: 'external-rental', isDemo: true, createdBy: { username: 'demo', fullName: 'Data Contoh' } }));

const UNITS = {
  'demo-1': [
    ['EXC', 'Excavator', 'SSB-EXC-DEMO1', 'Ahmad Suganda', 'include_solar'],
    ['BLD', 'Buldoser', 'SSB-BLD-DEMO1', 'Hendrik W.', 'include_solar'],
    ['DT', 'Dump Truck', 'SSB-DT-DEMO1', 'Siti Aminah', 'supir_only'],
  ],
  'demo-2': [
    ['EXC', 'Excavator', 'SSB-EXC-DEMO2', 'Bambang S.', 'supir_only'],
    ['VBR', 'Vibro Roller', 'SSB-VBR-DEMO2', 'Dedi Kurniawan', 'include_solar'],
  ],
  'demo-3': [],
};

// Pseudo-acak deterministik supaya data contoh stabil antar-muat.
const random = (seedValue) => {
  let state = seedValue;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
};

function seedLogs(unitKey, unitIndex) {
  const next = random(unitKey.length * 131 + unitIndex * 17);
  const logs = [];
  const today = new Date();
  for (let back = 40; back >= 1; back -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    if (day.getDay() === 0) continue; // libur Minggu
    if (next() < 0.08) continue; // standby / maintenance
    const date = isoDate(day);
    const push = (start, end, hours, description) => logs.push({
      id: logs.length + 1, workDate: date, startedAt: at(date, start), stoppedAt: at(date, end), totalWorkhour: hours, description, sourceType: 'external_rental',
    });
    const task = ['Langsir material sirtu', 'Backfill area A1', 'Galian saluran utama', 'Perataan tanah', 'Loading ke dump truck'][Math.floor(next() * 5)];
    push('08:00', '12:00', 4, task);
    if (next() > 0.1) push('13:00', '17:00', 4, null);
    if (next() > 0.65) push('17:30', '19:30', 2, 'Lembur');
  }
  return logs;
}

function buildSeed() {
  const units = {};
  const logs = {};
  Object.entries(UNITS).forEach(([projectId, rows]) => {
    units[projectId] = rows.map(([, typeName, assetCode, operator, packet], index) => {
      const key = `d${projectId.replace('demo-', '')}-${index + 1}`;
      logs[key] = seedLogs(key, index);
      return {
        key, kind: 'demo', poolItemId: null, equipmentItemId: null, assetCode, typeName,
        requestCode: `REQ-DEMO-${projectId.replace('demo-', '')}${index + 1}`, status: 'active',
        neededDate: PROJECTS.find((p) => p.id === projectId).contractStartDate,
        meta: { operator, packet },
      };
    });
  });
  return { projects: PROJECTS, units, logs };
}

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (stored?.projects) return stored;
  } catch {
    // jatuh ke data awal
  }
  const seed = buildSeed();
  localStorage.setItem(STORE_KEY, JSON.stringify(seed));
  return seed;
}

const write = (store) => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------------- Kontrak ----------------

/** Kosong kalau sakelar data contoh mati — tautan demo-N lalu tampil "tidak ditemukan". */
export async function listDemoRentalProjects() {
  return DEMO_DATA_ENABLED ? clone(read().projects) : [];
}

export async function updateDemoRentalProject(id, form) {
  const store = read();
  const row = store.projects.find((item) => item.id === id);
  if (!row) throw new Error('Kontrak contoh tidak ditemukan.');
  Object.assign(row, {
    projectName: form.projectName.trim(),
    clientName: form.clientName.trim() || null,
    location: form.location.trim() || null,
    contractNo: form.contractNo.trim() || null,
    contractStartDate: form.contractStartDate || null,
    contractEndDate: form.contractEndDate || null,
    billingMethod: form.billingMethod || null,
  });
  write(store);
  return clone(row);
}

const TRANSITIONS = { planned: ['active', 'cancelled'], active: ['planned', 'completed', 'cancelled'], completed: [], cancelled: [] };

export async function changeDemoRentalStatus(id, status) {
  const store = read();
  const row = store.projects.find((item) => item.id === id);
  if (!row) throw new Error('Kontrak contoh tidak ditemukan.');
  if (!TRANSITIONS[row.status].includes(status)) throw new Error(`Status tidak bisa langsung dari "${row.status}" ke "${status}".`);
  row.status = status;
  write(store);
  return clone(row);
}

// ---------------- Unit ----------------

export async function listDemoUnits(projectId) {
  return clone(read().units[projectId] || []);
}

/** Di data contoh, unit baru langsung dianggap disetujui dan beroperasi. */
export async function addDemoUnit(projectId, form, typeName) {
  const store = read();
  const list = store.units[projectId] || (store.units[projectId] = []);
  const created = [];
  for (let i = 0; i < Number(form.quantity || 1); i += 1) {
    const key = `d${projectId.replace('demo-', '')}-${list.length + 1}`;
    const unit = {
      key, kind: 'demo', poolItemId: null, equipmentItemId: null,
      assetCode: `${typeName.slice(0, 3).toUpperCase()}-DEMO-${list.length + 1}`,
      typeName, requestCode: `REQ-DEMO-${Date.now().toString().slice(-4)}`, status: 'active',
      neededDate: form.neededDate || null, locationDetail: form.locationDetail || null,
      meta: { operator: form.operator, packet: form.packet, extra: form.extra },
    };
    list.push(unit);
    store.logs[key] = [];
    created.push(unit);
  }
  write(store);
  return clone(created);
}

// ---------------- Timesheet ----------------

export async function listDemoLogs(unitKey, { startDate, endDate } = {}) {
  return clone((read().logs[unitKey] || []).filter((log) => (!startDate || log.workDate >= startDate) && (!endDate || log.workDate <= endDate)));
}

export async function addDemoLogs(unitKey, sessions) {
  const store = read();
  const logs = store.logs[unitKey] || (store.logs[unitKey] = []);
  const date = sessions[0]?.workDate;
  const existing = logs.filter((log) => log.workDate === date).reduce((sum, log) => sum + log.totalWorkhour, 0);
  const adding = sessions.reduce((sum, session) => sum + session.totalWorkhour, 0);
  if (existing + adding > 24) throw new Error(`Total jam tanggal ini jadi ${existing + adding} jam, melebihi 24 jam per hari.`);
  sessions.forEach((session) => logs.push({ id: logs.reduce((max, log) => Math.max(max, log.id), 0) + 1, sourceType: 'external_rental', ...session }));
  write(store);
}

