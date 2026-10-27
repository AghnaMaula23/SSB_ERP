import { apiRequest } from '../../../services/api.js';

/**
 * Ambang servis per (jenis alat × aspek maintenance). Backend menerapkan nilai
 * ini ke semua unit jenis itu sekaligus, jadi setting per unit tidak diubah
 * manual lagi (E4d).
 */
const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

export async function getTypeThresholds() {
  return (await apiRequest(`${API_PREFIX}/maintenance-thresholds`)) || [];
}

/** Tambah atau ubah (upsert). */
export function saveTypeThreshold({ equipmentTypeId, maintenanceAspectId, thresholdValue }) {
  return apiRequest(`${API_PREFIX}/types/${equipmentTypeId}/maintenance-thresholds/${maintenanceAspectId}`, {
    method: 'PUT',
    body: JSON.stringify({ thresholdValue: Number(thresholdValue) }),
  });
}

export function deleteTypeThreshold(equipmentTypeId, maintenanceAspectId) {
  return apiRequest(`${API_PREFIX}/types/${equipmentTypeId}/maintenance-thresholds/${maintenanceAspectId}`, { method: 'DELETE' });
}
