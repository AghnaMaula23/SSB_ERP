/**
 * Log aktivitas akun — dipakai pada ikon notifikasi di topbar.
 * Disimpan di browser karena belum ada activity feed di API.
 */
const STORAGE_KEY = 'activity_log';
const MAX_ENTRIES = 40;

// Entri contoh lama tidak punya id; hanya entri dari recordActivity yang disimpan.
const isRecordedEntry = (entry) => Boolean(entry?.id);

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecordedEntry) : [];
  } catch {
    return [];
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
