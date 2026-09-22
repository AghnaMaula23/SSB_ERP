import { apiRequest } from '../../../services/api.js';

const ALAT_API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

const statusLabels = {
  operational: 'Available',
  available: 'Available',
  assigned_to_location: 'Assigned to Location',
  maintenance: 'Maintenance Due',
  retired: 'Retired',
};

export function normalizeItem(item) {
  return {
    ...item,
    id: item.id,
    itemCode: item.itemCode || item.assetCode,
    jenis: item.jenis || item.equipmentType?.typeName || '',
    merk: item.merk || item.brand || '-',
    typeModel: item.typeModel || item.model || '-',
    status: statusLabels[item.status || item.currentStatus] || item.status || item.currentStatus || 'Available',
  };
}

export async function getItems({ page = 1, limit = 100, search, typeId, status } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  query.set('isActive', 'true');
  if (search) query.set('search', search);
  if (typeId && typeId !== 'All') query.set('typeId', typeId);
  if (status && status !== 'All') query.set('status', status);
  const result = await apiRequest(`${ALAT_API_PREFIX}/items?${query}`);
  return { ...result, data: (result.data || []).map(normalizeItem) };
}

export async function getEquipmentTypes() {
  const result = await apiRequest(`${ALAT_API_PREFIX}/types?limit=100`);
  return result.data || [];
}

export function registerItem(payload) {
  return apiRequest(`${ALAT_API_PREFIX}/items`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getItemDetail(itemId) {
  const [item, maintenance, workhours, damageLogs] = await Promise.all([
    apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`),
    apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/maintenance-settings?limit=100`),
    apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/workhour-logs?limit=100`),
    apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/damage-logs?status=reported&limit=100`).catch(() => ({ data: [] })),
  ]);
  return {
    ...item,
    maintenanceMetrics: maintenance.data || [],
    workhourLogs: workhours.data || [],
    activeIssues: damageLogs.data || [],
  };
}

export function updateItem(itemId, payload) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function updateItemStatus(itemId, status, notes) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/status`, { method: 'PUT', body: JSON.stringify({ status, notes }) });
}

// The backend archives the item by setting isActive=false; it does not hard-delete it.
export function archiveItem(itemId) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`, { method: 'DELETE' });
}

export function fixIssue(issueId, payload = {}) {
  const bodyData = {
    maintenanceType: payload.maintenanceType || 'repair',
    actionDescription: payload.actionDescription || 'Damage log issue resolved',
    performedBy: payload.performedBy || 'Internal Mechanic',
  };
  return apiRequest(`${ALAT_API_PREFIX}/damage-logs/${issueId}/resolve`, { method: 'PUT', body: JSON.stringify(bodyData) });
}