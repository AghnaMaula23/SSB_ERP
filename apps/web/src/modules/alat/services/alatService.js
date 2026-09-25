import { apiRequest } from '../../../services/api.js';

const ALAT_API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

export const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'operational', label: 'Available' },
  { value: 'maintenance', label: 'Maintenance Due' },
  { value: 'retired', label: 'Retired' },
];

const statusAliases = {
  available: 'operational',
  'available for dispatch': 'operational',
  assigned_to_location: 'operational',
  'assigned to location': 'operational',
  'not available': 'operational',
  'delivery to palembang': 'operational',
  'delivery to subang': 'operational',
  'maintenance due': 'maintenance',
  in_repair: 'maintenance',
  retired: 'retired',
};

export function normalizeEquipmentStatus(value) {
  const normalized = String(value || 'operational').trim().toLowerCase();
  return statusAliases[normalized] || normalized;
}

export function equipmentStatusLabel(value) {
  const status = normalizeEquipmentStatus(value);
  return EQUIPMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export function normalizeItem(item) {
  const status = normalizeEquipmentStatus(item.currentStatus || item.status);
  return {
    ...item,
    id: item.id,
    itemCode: item.itemCode || item.assetCode || '',
    jenis: item.jenis || item.equipmentType?.typeName || '',
    merk: item.merk || item.brand || '-',
    typeModel: item.typeModel || item.model || '-',
    status,
    statusLabel: equipmentStatusLabel(status),
  };
}

export async function getItems({ page = 1, limit = 100, search, typeId, status, isActive = true } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (isActive !== undefined) query.set('isActive', String(isActive));
  if (search) query.set('search', search);
  if (typeId && typeId !== 'All') query.set('typeId', typeId);
  if (status && status !== 'All') query.set('status', normalizeEquipmentStatus(status));
  const result = await apiRequest(`${ALAT_API_PREFIX}/items?${query}`);
  return { ...result, data: (result.data || []).map(normalizeItem) };
}

export async function getAllItems(filters = {}) {
  const rows = [];
  let page = 1;
  let total;
  do {
    const result = await getItems({ ...filters, page, limit: 100 });
    rows.push(...(result.data || []));
    total = Number(result.total || 0);
    page += 1;
  } while (rows.length < total && page <= 1000);
  if (rows.length < total) throw new Error('Data equipment melebihi batas pagination.');
  return { data: rows, total: rows.length };
}

export async function getEquipmentTypes() {
  return getAllPaginated(`${ALAT_API_PREFIX}/types?isActive=true`);
}

export function registerItem(payload) {
  return apiRequest(`${ALAT_API_PREFIX}/items`, { method: 'POST', body: JSON.stringify(payload) });
}

export function getItemById(itemId) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`);
}

async function getAllPaginated(path) {
  const rows = [];
  let page = 1;
  let total;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const result = await apiRequest(`${path}${separator}page=${page}&limit=100`);
    rows.push(...(result.data || []));
    total = Number(result.total || 0);
    page += 1;
  } while (rows.length < total && page <= 1000);
  if (rows.length < total) throw new Error('Data equipment melebihi batas pagination.');
  return rows;
}

export async function getItemDetail(itemId) {
  const [itemResult, maintenanceResult, workhoursResult, damageResult] = await Promise.allSettled([
    getItemById(itemId),
    getAllPaginated(`${ALAT_API_PREFIX}/items/${itemId}/maintenance-settings`),
    getAllPaginated(`${ALAT_API_PREFIX}/items/${itemId}/workhour-logs`),
    getAllPaginated(`${ALAT_API_PREFIX}/items/${itemId}/damage-logs?status=reported`),
  ]);

  if (itemResult.status === 'rejected') throw itemResult.reason;
  const subresourceErrors = [
    ['maintenance settings', maintenanceResult],
    ['workhour logs', workhoursResult],
    ['damage logs', damageResult],
  ].filter(([, result]) => result.status === 'rejected').map(([label, result]) => `${label}: ${result.reason?.message || 'Gagal dimuat'}`);

  return {
    ...itemResult.value,
    maintenanceMetrics: maintenanceResult.status === 'fulfilled' ? maintenanceResult.value : [],
    workhourLogs: workhoursResult.status === 'fulfilled' ? workhoursResult.value : [],
    activeIssues: damageResult.status === 'fulfilled' ? damageResult.value : [],
    subresourceErrors,
  };
}

export function updateItem(itemId, payload) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function updateItemStatus(itemId, status, notes, metadata = {}) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: normalizeEquipmentStatus(status), notes, ...metadata }),
  });
}

// The backend archives the item by setting isActive=false; it does not hard-delete it.
export function archiveItem(itemId) {
  return apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`, { method: 'DELETE' });
}

export function resolveDamageIssue(issueId, payload) {
  if (!payload?.actionDescription?.trim()) {
    return Promise.reject(new Error('Deskripsi tindakan wajib diisi.'));
  }
  return apiRequest(`${ALAT_API_PREFIX}/damage-logs/${issueId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify({
      maintenanceType: payload.maintenanceType,
      actionDescription: payload.actionDescription.trim(),
      performedBy: payload.performedBy?.trim() || undefined,
      maintenanceDate: payload.maintenanceDate,
      maintenanceSettingId: payload.maintenanceSettingId,
    }),
  });
}
