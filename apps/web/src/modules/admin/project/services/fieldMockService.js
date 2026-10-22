// ============================================================
// DATA CONTOH — Pekerja per tahapan.
//
// Backend-nya BELUM ADA: pekerja menunggu Finance Field & Labor Payroll
// (Build Order 7). Bentuk data mengikuti docs/skema-tenaga-kerja-harian.md:
//   - `project_workers`                identitas, ditulis sekali, lintas tahapan
//   - `sub_project_worker_assignments` kesepakatan kerja per tahapan
//     (jenis, peran, upah harian, periode, status)
// Upah milik penugasan, bukan orangnya — dan pekerja KONTRAK juga dibayar
// harian, jadi upahnya ikut dihitung (keputusan 1 Okt 2026).
// Disimpan di localStorage dan dibersihkan saat sign out (services/auth.js).
// ============================================================

const STORE_KEY = 'admin_mock_workers_v2';

export const WORKER_TYPES = {
  contract: { label: 'Kontrak', hint: 'Disewa selama tahapan berlangsung, dibayar harian' },
  daily: { label: 'Harian', hint: 'Hadir ketika dipanggil, dibayar harian' },
};

export const WORKER_ROLES = ['Pelaksana Lapangan', 'Mandor', 'Operator Excavator', 'Operator Dozer', 'Sopir DT', 'Checker', 'Tukang Cor', 'Tukang Besi', 'Harian K3', 'Helper'];

export const WORKER_STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  standby: { label: 'Standby', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  off_duty: { label: 'Off-Duty', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  inactive: { label: 'Selesai', className: 'bg-slate-50 text-slate-500 border-slate-200' },
};

const yearsAgo = (years) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

// Identitas contoh. id_number boleh kosong — pekerja harian sering tidak menyerahkan NIK.
const SEED_WORKERS = [
  ['Slamet Riyadi', '3321010294880001', '081234567801', 'Mandor', 6],
  ['Dedi Kurniawan', '3321010298110002', '081234567802', 'Operator Excavator', 4],
  ['Budi Herlambang', '3321010311440003', '081234567803', 'Tukang Cor', 2],
  ['Joko Susilo', null, '081234567804', 'Helper', 0],
  ['Ahmad Fauzi', '3321010311440099', '081234567805', 'Sopir DT', 3],
].map(([fullName, idNumber, phone, defaultRole, years], index) => ({
  id: index + 1,
  workerCode: `PWK-${String(index + 1).padStart(6, '0')}`,
  fullName, idNumber, phone, defaultRole, joinedAt: yearsAgo(years), notes: '',
}));

// Penugasan contoh per tahapan: [workerId, jenis, peran, upah harian, status].
const SEED_ASSIGNMENTS = [
  [1, 'contract', 'Mandor', 250000, 'active'],
  [2, 'contract', 'Operator Excavator', 220000, 'active'],
  [3, 'daily', 'Tukang Cor', 150000, 'active'],
  [4, 'daily', 'Helper', 120000, 'standby'],
];

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (stored?.workers) return stored;
  } catch {
    // jatuh ke data awal
  }
  return { workers: SEED_WORKERS, assignments: {} };
}

const write = (store) => localStorage.setItem(STORE_KEY, JSON.stringify(store));
const clone = (value) => JSON.parse(JSON.stringify(value));
const nextId = (rows) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

/**
 * Penugasan satu tahapan; diisi contoh saat tahapan pertama kali dibuka.
 * Periode contoh dimulai bersama kontrak tahapan (`startDate`).
 */
function stageRows(store, subProjectId, startDate = null) {
  if (!store.assignments[subProjectId]) {
    store.assignments[subProjectId] = SEED_ASSIGNMENTS.map(([projectWorkerId, workerType, assignedRole, dailyWage, status], index) => ({
      id: index + 1, projectWorkerId, workerType, assignedRole, dailyWage, status, startDate, endDate: null, notes: '',
    }));
    write(store);
  }
  return store.assignments[subProjectId];
}

const withWorker = (store, row) => ({ ...row, worker: store.workers.find((worker) => worker.id === row.projectWorkerId) || null });

class MockValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

/** Semua identitas pekerja (lintas tahapan) — untuk memilih orang yang sudah terdaftar. */
export async function listProjectWorkers() {
  return clone(read().workers);
}

export async function listWorkers(subProjectId, { startDate } = {}) {
  const store = read();
  return clone(stageRows(store, subProjectId, startDate || null).map((row) => withWorker(store, row)));
}

export async function getWorker(subProjectId, assignmentId) {
  const store = read();
  const row = stageRows(store, subProjectId).find((item) => item.id === Number(assignmentId));
  if (!row) throw new Error('Penugasan pekerja tidak ditemukan.');
  return clone(withWorker(store, row));
}

/**
 * Simpan identitas (baru atau ubah). `form.projectWorkerId` kosong = orang
 * baru. NIK unik hanya bila diisi.
 */
function saveIdentity(store, form) {
  const idNumber = form.idNumber.trim() || null;
  const existingId = form.projectWorkerId ? Number(form.projectWorkerId) : null;
  if (idNumber && store.workers.some((worker) => worker.idNumber === idNumber && worker.id !== existingId)) {
    throw new MockValidationError('NIK sudah terdaftar atas nama pekerja lain.', [{ field: 'idNumber', message: 'NIK sudah dipakai — pilih orangnya dari daftar pekerja terdaftar.' }]);
  }
  const identity = {
    fullName: form.fullName.trim(),
    idNumber,
    phone: form.phone.trim() || null,
    defaultRole: form.defaultRole || form.assignedRole,
    joinedAt: form.joinedAt || null,
  };
  if (existingId) {
    const index = store.workers.findIndex((worker) => worker.id === existingId);
    store.workers[index] = { ...store.workers[index], ...identity };
    return existingId;
  }
  const id = nextId(store.workers);
  store.workers.push({ id, workerCode: `PWK-${String(id).padStart(6, '0')}`, notes: '', ...identity });
  return id;
}

const assignmentFromForm = (form) => ({
  workerType: form.workerType,
  assignedRole: form.assignedRole,
  dailyWage: Number(form.dailyWage),
  startDate: form.startDate || null,
  endDate: form.endDate || null,
  status: form.status,
  notes: form.notes.trim(),
});

export async function createWorker(subProjectId, form) {
  const store = read();
  const rows = stageRows(store, subProjectId);
  if (form.projectWorkerId && rows.some((row) => row.projectWorkerId === Number(form.projectWorkerId))) {
    throw new MockValidationError('Pekerja ini sudah ditugaskan di tahapan ini.', [{ field: 'projectWorkerId', message: 'Sudah ada di tahapan ini — ubah penugasannya saja.' }]);
  }
  const projectWorkerId = saveIdentity(store, form);
  const row = { id: nextId(rows), projectWorkerId, ...assignmentFromForm(form) };
  rows.push(row);
  write(store);
  return clone(withWorker(store, row));
}

export async function updateWorker(subProjectId, assignmentId, form) {
  const store = read();
  const rows = stageRows(store, subProjectId);
  const index = rows.findIndex((row) => row.id === Number(assignmentId));
  if (index < 0) throw new Error('Penugasan pekerja tidak ditemukan.');
  saveIdentity(store, { ...form, projectWorkerId: rows[index].projectWorkerId });
  rows[index] = { ...rows[index], ...assignmentFromForm(form) };
  write(store);
  return clone(withWorker(store, rows[index]));
}

/** Melepas penugasan dari tahapan; identitas orangnya tetap ada. */
export async function removeWorker(subProjectId, assignmentId) {
  const store = read();
  store.assignments[subProjectId] = stageRows(store, subProjectId).filter((row) => row.id !== Number(assignmentId));
  write(store);
}
