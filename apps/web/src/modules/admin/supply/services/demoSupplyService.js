// ============================================================
// DATA CONTOH — kontrak supply tambahan untuk demo halaman Supply.
//
// Kontrak asli tetap dari API (/api/projects/external-supply). Kontrak contoh
// ber-id "demo-N" supaya tidak pernah bertabrakan dengan id database, dan
// perubahan pada kontrak contoh (ubah data, ganti status) hanya disimpan di
// localStorage browser ini — dibersihkan saat sign out (services/auth.js).
// ============================================================

const STORE_KEY = 'admin_mock_supply_projects';

export const isDemoId = (id) => typeof id === 'string' && id.startsWith('demo-');

const year = new Date().getFullYear();

const SEED = [
  {
    id: 'demo-1', projectCode: 'SPL-DEMO-01', projectName: 'Tol Subang - Section 2', clientName: 'PT Wika',
    location: 'STA 12+000 – 15+000 Tol Subang, Jawa Barat', contractNo: 'SPK/WIKA/2026/031',
    contractStartDate: `${year}-08-01`, contractEndDate: `${year}-12-31`, status: 'active',
  },
  {
    id: 'demo-2', projectCode: 'SPL-DEMO-02', projectName: 'Jalan Akses Cileunyi', clientName: 'PT Adhi Karya',
    location: 'Cileunyi, Kabupaten Bandung', contractNo: 'ADHI/SUP/2026/118',
    contractStartDate: `${year}-09-15`, contractEndDate: `${year + 1}-03-15`, status: 'active',
  },
  {
    id: 'demo-3', projectCode: 'SPL-DEMO-03', projectName: 'Rest Area KM 102 Cipali', clientName: 'PT Hutama Karya',
    location: 'Rest Area KM 102 Tol Cipali', contractNo: 'HK/PO/2026/0447',
    contractStartDate: `${year}-11-01`, contractEndDate: `${year + 1}-02-28`, status: 'planned',
  },
  {
    id: 'demo-4', projectCode: 'SPL-DEMO-04', projectName: 'Batching Plant Karawang', clientName: 'PT Waskita Beton',
    location: 'Karawang Timur, Jawa Barat', contractNo: 'WSBP/2025/772',
    contractStartDate: `${year - 1}-03-01`, contractEndDate: `${year - 1}-10-31`, status: 'completed',
  },
].map((project) => ({ ...project, projectKind: 'external-supply', isDemo: true, createdBy: { username: 'demo', fullName: 'Data Contoh' } }));

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

export async function listDemoSupplyProjects() {
  return read();
}

export async function updateDemoSupplyProject(id, form) {
  const rows = read();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error('Kontrak contoh tidak ditemukan.');
  rows[index] = {
    ...rows[index],
    projectName: form.projectName.trim(),
    clientName: form.clientName.trim() || null,
    location: form.location.trim() || null,
    contractNo: form.contractNo.trim() || null,
    contractStartDate: form.contractStartDate || null,
    contractEndDate: form.contractEndDate || null,
  };
  write(rows);
  return rows[index];
}

// Transisi sama dengan backend (STATUS_TRANSITIONS project).
const TRANSITIONS = { planned: ['active', 'cancelled'], active: ['planned', 'completed', 'cancelled'], completed: [], cancelled: [] };

export async function changeDemoSupplyStatus(id, status) {
  const rows = read();
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error('Kontrak contoh tidak ditemukan.');
  if (!TRANSITIONS[row.status].includes(status)) throw new Error(`Status tidak bisa langsung dari "${row.status}" ke "${status}".`);
  row.status = status;
  write(rows);
  return row;
}
