// ============================================================
// DATA CONTOH — Verifikasi Kas Lapangan (klaim pengeluaran operasional).
//
// Backend Finance Field (operational requests) BELUM ADA — /api/finance-field
// masih dikomentari di app.js. Disimpan di localStorage browser ini dan
// dibersihkan saat sign out. Berbeda dengan purchase request, alasan
// penolakan di sini wajib diisi: lapangan perlu tahu nota mana yang salah.
// ============================================================

const STORE_KEY = 'admin_mock_field_cash';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

const dateAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const year = new Date().getFullYear();

const ROWS = [
  ['Peningkatan Jalan Demak-Kudus', 'Galian', 'BBM', 'Solar genset & pompa air', [['Solar B30', 200, 'liter', 6800], ['Oli mesin', 4, 'liter', 85000]], 'Staf Lapangan', 0],
  ['Peningkatan Jalan Demak-Kudus', 'Timbunan', 'Material Kecil', 'Pembelian material darurat drainase', [['Pipa PVC 4"', 12, 'batang', 145000], ['Semen 50kg', 20, 'sak', 72000]], 'Staf Lapangan', 1],
  ['MRT Fase 2 - Bundaran HI', 'Galian', 'Konsumsi', 'Konsumsi lembur tim galian 3 hari', [['Nasi kotak', 75, 'porsi', 28000], ['Air mineral', 15, 'dus', 42000]], 'Dedi Kurniawan', 1],
  ['Tol Trans-Sumatera', 'Line Clearing', 'Sewa', 'Sewa chainsaw tambahan', [['Sewa chainsaw', 3, 'hari', 350000]], 'Rudi Setiawan', 2],
  ['Apartemen Lavon', 'Aspal', 'Transport', 'Mobilisasi pekerja ke lokasi', [['Sewa elf', 2, 'trip', 650000], ['Tol & parkir', 1, 'paket', 185000]], 'Siti Aminah', 3],
  ['MRT Fase 2 - Bundaran HI', 'Timbunan', 'Perbaikan', 'Tambal ban dump truck', [['Ban dalam', 2, 'pcs', 450000], ['Jasa tambal', 1, 'paket', 150000]], 'Bambang S.', 4],
  ['Tol Trans-Sumatera', 'Galian', 'BBM', 'BBM operasional mobil lapangan', [['Pertalite', 60, 'liter', 10000]], 'Rudi Setiawan', 8],
  ['Apartemen Lavon', 'Aspal', 'K3', 'APD pekerja baru', [['Helm proyek', 10, 'pcs', 65000], ['Rompi reflektif', 10, 'pcs', 45000], ['Sepatu safety', 5, 'pasang', 285000]], 'Siti Aminah', 12],
];

const seed = () => ROWS.map(([projectName, subProjectLabel, category, description, items, requester, daysBack], index) => {
  const lines = items.map(([name, quantity, unit, unitPrice]) => ({ name, quantity, unit, unitPrice, total: quantity * unitPrice }));
  const decided = index >= 6;
  return {
    id: index + 1,
    requestCode: `KAS-${year}-${String(101 + index).padStart(4, '0')}`,
    requestDate: dateAgo(daysBack),
    projectName,
    subProjectLabel,
    category,
    description,
    requestedBy: { fullName: requester },
    items: lines,
    amount: lines.reduce((sum, line) => sum + line.total, 0),
    attachments: lines.map((line, n) => ({ id: n + 1, name: `nota-${index + 1}-${n + 1}.jpg`, label: line.name })),
    status: decided ? (index === 7 ? 'rejected' : 'approved') : 'submitted',
    decisionNotes: index === 7 ? 'Nota sepatu safety tidak terbaca. Mohon unggah ulang foto nota.' : null,
    decidedBy: decided ? { fullName: 'Admin Kantor' } : null,
    decidedAt: decided ? `${dateAgo(daysBack - 1)}T09:30:00.000Z` : null,
  };
});

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(stored)) return stored;
  } catch {
    // jatuh ke data awal
  }
  const rows = seed();
  localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  return rows;
}

const write = (rows) => localStorage.setItem(STORE_KEY, JSON.stringify(rows));

export const KAS_CATEGORIES = ['BBM', 'Material Kecil', 'Konsumsi', 'Sewa', 'Transport', 'Perbaikan', 'K3'];

export async function listFieldCash() {
  return read().sort((a, b) => b.requestDate.localeCompare(a.requestDate) || b.id - a.id);
}

export async function getFieldCash(id) {
  const row = read().find((item) => item.id === Number(id));
  if (!row) throw new Error('Klaim kas tidak ditemukan.');
  return row;
}

/** status: 'approved' | 'rejected'. Penolakan wajib beralasan. */
export async function decideFieldCash(id, status, notes) {
  const rows = read();
  const row = rows.find((item) => item.id === Number(id));
  if (!row) throw new Error('Klaim kas tidak ditemukan.');
  if (row.status !== 'submitted') throw new Error(`Klaim ini sudah berstatus "${row.status}".`);
  if (status === 'rejected' && !String(notes || '').trim()) throw new Error('Alasan penolakan wajib diisi.');
  const user = readUser();
  Object.assign(row, {
    status,
    decisionNotes: String(notes || '').trim() || null,
    decidedBy: { fullName: user.fullName || user.username || 'Admin' },
    decidedAt: new Date().toISOString(),
  });
  write(rows);
  return row;
}
