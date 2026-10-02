const STORAGE_KEY = 'maintenance_type_thresholds';
const RESET_REFERENCE_KEY = 'maintenance_reset_purchase_refs';

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

export function getMaintenanceResetReferences() {
  try {
    const rows = JSON.parse(localStorage.getItem(RESET_REFERENCE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveMaintenanceResetReference(reference) {
  const rows = getMaintenanceResetReferences();
  rows.push({ ...reference, resetAt: new Date().toISOString() });
  localStorage.setItem(RESET_REFERENCE_KEY, JSON.stringify(rows));
}

export const MAINTENANCE_THRESHOLD_STORAGE_KEY = STORAGE_KEY;
export const MAINTENANCE_RESET_REFERENCE_KEY = RESET_REFERENCE_KEY;
