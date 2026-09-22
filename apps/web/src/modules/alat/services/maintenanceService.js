import { apiRequest } from '../../../services/api.js';

const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

export const maintenanceMetricNames = [
  'Oli Mesin',
  'Filter Udara',
  'Filter Solar',
  'Oli Transmisi',
  'Filter Oli Mesin',
  'Filter Hidrolik',
  'Oli Hidrolik',
  'Oli Gardan',
];

const statusOrder = { overdue: 4, due: 3, warning: 2, normal: 1, inactive: 0 };

function normalizeMetric(setting) {
  const name = setting.maintenanceAspect?.aspectName || 'Maintenance';
  return {
    name,
    current: Number(setting.currentValueSinceReset || 0),
    threshold: Number(setting.thresholdValue || 0),
    status: setting.status,
  };
}

function groupSettings(settings) {
  const grouped = new Map();
  settings.forEach((setting) => {
    const itemCode = setting.equipmentItem?.assetCode || `Item ${setting.equipmentItemId}`;
    const current = grouped.get(itemCode) || {
      id: String(setting.equipmentItemId),
      itemCode,
      itemName: 'Equipment unit',
      status: 'normal',
      metrics: {},
    };
    const metric = normalizeMetric(setting);
    current.metrics[metric.name] = metric;
    if ((statusOrder[metric.status] || 0) > (statusOrder[current.status] || 0)) current.status = metric.status;
    grouped.set(itemCode, current);
  });
  return [...grouped.values()];
}

export async function getMaintenanceOverview() {
  const result = await apiRequest(`${API_PREFIX}/maintenance-settings?page=1&limit=100&isActive=true`);
  const rows = groupSettings(result.data || []);
  return { data: rows };
}

export async function getItemMaintenanceSettings(itemId) {
  const result = await apiRequest(`${API_PREFIX}/items/${itemId}/maintenance-settings?limit=100`);
  return result.data || [];
}

export function createMaintenanceRecord(payload) {
  return apiRequest(`${API_PREFIX}/maintenance-records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
