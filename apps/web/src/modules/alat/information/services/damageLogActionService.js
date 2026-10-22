/**
 * Status penyelesaian action pada riwayat tindakan damage log.
 * Backend belum punya endpoint update action, jadi status ini dicatat di browser
 * (dummy) — nilainya tetap muncul konsisten di halaman detail damage log.
 */
const STORAGE_KEY = 'damage_log_action_status';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getActionStatuses() {
  return readAll();
}

export function completeAction(recordId) {
  const data = readAll();
  data[String(recordId)] = 'completed';
  writeAll(data);
  return data;
}

// PO Perbaikan Alat yang dipakai saat damage log diselesaikan (belum ada kolomnya di API).
const RESOLVE_REFERENCE_KEY = 'damage_log_resolve_purchase_refs';

export function getResolvePurchaseReferences() {
  try {
    const rows = JSON.parse(localStorage.getItem(RESOLVE_REFERENCE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveResolvePurchaseReference(reference) {
  const rows = getResolvePurchaseReferences().filter((row) => String(row.damageLogId) !== String(reference.damageLogId));
  rows.push({ ...reference, resolvedAt: new Date().toISOString() });
  localStorage.setItem(RESOLVE_REFERENCE_KEY, JSON.stringify(rows));
}

export const ACTION_STATUS_STORAGE_KEY = STORAGE_KEY;
