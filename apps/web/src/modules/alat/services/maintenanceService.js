import { apiRequest } from '../../../services/api.js';
import { dummyMaintenanceRows, maintenanceMetricNames } from '../data/dummyMaintenance.js';

const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

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
  try {
    const result = await apiRequest(`${API_PREFIX}/maintenance-settings?page=1&limit=100&isActive=true`);
    const rows = groupSettings(result.data || []);
    return rows.length ? { data: rows, isDummy: false } : { data: dummyMaintenanceRows, isDummy: true };
  } catch {
    return { data: dummyMaintenanceRows, isDummy: true };
  }
}

export function resetDummyMaintenance(rowId) {
  return dummyMaintenanceRows.find((row) => row.id === rowId);
}

export { maintenanceMetricNames };
