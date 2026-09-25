import { apiRequest } from '../../../services/api.js';

const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

const statusOrder = { overdue: 4, due: 3, warning: 2, normal: 1, inactive: 0 };

function normalizeMetric(setting) {
  const name = setting.maintenanceAspect?.aspectName || `Aspect ${setting.maintenanceAspectId || '-'}`;
  return {
    id: setting.id,
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
      itemName: setting.equipmentItem?.equipmentType?.typeName || setting.equipmentItem?.typeName || 'Equipment',
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

export async function getMaintenanceAspects() {
  const rows = [];
  let page = 1;
  let total;
  do {
    const result = await apiRequest(`${API_PREFIX}/maintenance/aspects?page=${page}&limit=100&isActive=true`);
    rows.push(...(result.data || []));
    total = Number(result.total || 0);
    page += 1;
  } while (rows.length < total && page <= 1000);
  if (rows.length < total) throw new Error('Data maintenance melebihi batas pagination.');
  return rows;
}

export async function getMaintenanceOverview() {
  const [aspects, settings] = await Promise.all([
    getMaintenanceAspects(),
    (async () => {
      const rows = [];
      let page = 1;
      let total;
      do {
        const result = await apiRequest(`${API_PREFIX}/maintenance-settings?page=${page}&limit=100&isActive=true`);
        rows.push(...(result.data || []));
        total = Number(result.total || 0);
        page += 1;
      } while (rows.length < total && page <= 100);
      return rows;
    })(),
  ]);
  const metricNames = [...new Set(aspects.map((aspect) => aspect.aspectName).filter(Boolean))];
  return {
    data: groupSettings(settings),
    metricNames,
    total: settings.length,
  };
}

export async function getItemMaintenanceSettings(itemId) {
  const rows = [];
  let page = 1;
  let total;
  do {
    const result = await apiRequest(`${API_PREFIX}/items/${itemId}/maintenance-settings?page=${page}&limit=100&isActive=true`);
    rows.push(...(result.data || []));
    total = Number(result.total || 0);
    page += 1;
  } while (rows.length < total && page <= 1000);
  if (rows.length < total) throw new Error('Data maintenance melebihi batas pagination.');
  return rows;
}

export function createMaintenanceRecord(payload) {
  return apiRequest(`${API_PREFIX}/maintenance-records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
