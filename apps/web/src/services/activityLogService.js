/**
 * Log aktivitas akun — dipakai pada ikon notifikasi di topbar.
 * Backend belum menyediakan endpoint activity feed, jadi disimpan di browser
 * dan diberi data awal (dummy) supaya panel tidak pernah kosong.
 */
const STORAGE_KEY = 'activity_log';
const MAX_ENTRIES = 40;

const SEED_ENTRIES = [
  { module: 'Information', action: 'Damage log dibuat', description: 'SSB-BLD-002 · CRITICAL · Track kendor, alat tidak stabil dijalankan', at: '2026-09-28T02:15:00.000Z', read: false },
  { module: 'Purchase Order', action: 'Purchase request diajukan', description: 'PO-2026-0007 · 2 item · Rp 2.350.000', at: '2026-09-27T08:40:00.000Z', read: false },
  { module: 'Maintenance', action: 'Reset maintenance berhasil', description: 'SSB-EXC-002 · 2 parameter di-reset', at: '2026-09-26T03:05:00.000Z', read: true },
  { module: 'Kas', action: 'Claim pendapatan diajukan', description: 'Proyek Jalan Tol Cikarang · menunggu rincian modul Admin', at: '2026-09-25T09:20:00.000Z', read: true },
];

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ENTRIES));
      return SEED_ENTRIES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_ENTRIES;
  } catch {
    return SEED_ENTRIES;
  }
}

function writeAll(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_ENTRIES)));
}

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

export function recordActivity({ module = 'Divisi Alat', action, description = '', ref = '' }) {
  if (!action) return null;
  const user = currentUser();
  const entry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    module,
    action,
    description,
    ref,
    actor: user.fullName || user.username || 'Akun ini',
    at: new Date().toISOString(),
    read: false,
  };
  writeAll([entry, ...readAll()]);
  return entry;
}

export function getActivities() {
  return readAll();
}

export function getUnreadCount() {
  return readAll().filter((entry) => !entry.read).length;
}

export function markAllRead() {
  writeAll(readAll().map((entry) => ({ ...entry, read: true })));
}

export const ACTIVITY_STORAGE_KEY = STORAGE_KEY;
