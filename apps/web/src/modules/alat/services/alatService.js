import { apiRequest } from '../../../services/api.js';
import { alatItems } from '../data/dummyAlat.js';

const ALAT_API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

const statusLabels = {
  operational: 'Available',
  available: 'Available',
  assigned_to_location: 'Assigned to Location',
  maintenance: 'Maintenance Due',
  retired: 'Retired',
};

const dummyStatusValues = {
  Available: 'available',
  'Not Available': 'assigned_to_location',
  'Delivery to Palembang': 'assigned_to_location',
  'Delivery to Subang': 'assigned_to_location',
  'Maintenance Due': 'maintenance',
};

const dummyMaintenanceMetrics = [
  ['Oli Mesin', '120 Jam', 'Next service in 30 hrs'],
  ['Filter Udara', '200 Jam', 'Condition: Optimal'],
  ['Filter Solar', '150 Jam', 'Last check: 2023-11-01'],
  ['Oli Transmisi', '450 Jam', 'Critical threshold at 500'],
  ['Filter Oli Mesin', '250 Jam', 'Replacement scheduled'],
  ['Filter Hidrolik', '300 Jam', 'Stable performance'],
  ['Oli Hidrolik', '450 Jam', 'Critical threshold at 500'],
  ['Oli Gardan', '450 Jam', 'Critical threshold at 500'],
];

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
  try {
    const [item, maintenance, workhours] = await Promise.all([
      apiRequest(`${ALAT_API_PREFIX}/items/${itemId}`),
      apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/maintenance-settings?limit=100`),
      apiRequest(`${ALAT_API_PREFIX}/items/${itemId}/workhour-logs?limit=100`),
    ]);
    return { ...item, maintenanceMetrics: maintenance.data || [], workhourLogs: workhours.data || [] };
  } catch (error) {
    const dummyItem = alatItems.find((item) => item.id === itemId);
    if (!dummyItem) throw error;
    return {
      ...dummyItem,
      assetCode: dummyItem.itemCode,
      brand: dummyItem.merk,
      model: dummyItem.typeModel,
      currentStatus: dummyStatusValues[dummyItem.status] || 'operational',
      maintenanceMetrics: dummyMaintenanceMetrics,
      workhourLogs: [],
      activeIssues: [{
        id: `dummy-damage-${itemId}`,
        title: 'Hydraulic Leakage (Arm Boom)',
        description: 'Hydraulic Leakage (Arm Boom)',
        reportedAt: '2023-10-24 09:15',
        sparePartSource: 'Warehouse',
        assignedTeam: 'Internal',
      }],
      isDummy: true,
    };
  }
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

export function fixIssue(issueId) {
  return apiRequest(`${ALAT_API_PREFIX}/damage-logs/${issueId}/resolve`, { method: 'PUT', body: JSON.stringify({}) });
}