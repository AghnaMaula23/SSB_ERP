/**
 * Threshold default per (equipment type × maintenance aspect).
 *
 * Endpoint untuk threshold per TIPE belum ada di backend — yang tersedia baru
 * `POST /items/:itemId/maintenance-settings` (threshold per unit). Karena itu
 * konfigurasi per tipe ini masih disimpan di browser, sementara enactment per
 * unit tetap lewat endpoint maintenance settings.
 */
const STORAGE_KEY = 'maintenance_type_thresholds';

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

export function getTypeThresholds() {
  return Object.values(readAll());
}

export function getTypeThreshold(equipmentTypeId, maintenanceAspectId) {
  return readAll()[`${equipmentTypeId}:${maintenanceAspectId}`] || null;
}

export function saveTypeThreshold({ equipmentTypeId, maintenanceAspectId, thresholdValue }) {
  const data = readAll();
  const key = `${equipmentTypeId}:${maintenanceAspectId}`;
  const record = { id: key, equipmentTypeId: Number(equipmentTypeId), maintenanceAspectId: Number(maintenanceAspectId), thresholdValue: Number(thresholdValue), updatedAt: new Date().toISOString() };
  data[key] = record;
  writeAll(data);
  return record;
}

export function deleteTypeThreshold(equipmentTypeId, maintenanceAspectId) {
  const data = readAll();
  delete data[`${equipmentTypeId}:${maintenanceAspectId}`];
  writeAll(data);
}

export const MAINTENANCE_THRESHOLD_STORAGE_KEY = STORAGE_KEY;
