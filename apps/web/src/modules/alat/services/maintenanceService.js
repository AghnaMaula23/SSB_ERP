import { apiRequest } from '../../../services/api.js';

const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';
const CUSTOM_ASPECTS_KEY = 'maintenance_custom_aspects';

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

function getCustomAspects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_ASPECTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Aspek maintenance dibuat lewat endpoint yang sudah disiapkan
 * (POST /maintenance/aspects). Store lokal hanya dipakai sebagai fallback saat
 * request ditolak karena izin/koneksi, supaya halaman tetap bisa dipakai.
 */
export async function createMaintenanceAspect({ aspectCode, aspectName, defaultThresholdValue, warningLeadValue, description }) {
  const code = String(aspectCode || '').trim().toUpperCase();
  const name = String(aspectName || '').trim();
  if (!code || !name) throw new Error('Kode dan nama aspek wajib diisi.');

  try {
    const created = await apiRequest(`${API_PREFIX}/maintenance/aspects`, {
      method: 'POST',
      body: JSON.stringify({
        aspectCode: code,
        aspectName: name,
        ...(defaultThresholdValue ? { defaultThresholdValue: Number(defaultThresholdValue) } : {}),
        ...(warningLeadValue ? { warningLeadValue: Number(warningLeadValue) } : {}),
        ...(description ? { description } : {}),
      }),
    });
    if (created) return created;
  } catch (error) {
    if (error?.status === 401) throw error;
    if (error?.status === 403) {
      throw new Error('Anda tidak memiliki izin maintenance:create untuk menambah aspek baru.', { cause: error });
    }
    if (error?.status && error.status !== 0) throw error;
  }

  const rows = getCustomAspects();
  if (rows.some((row) => row.aspectCode === code)) throw new Error('Kode aspek sudah dipakai.');
  const aspect = { id: `custom-${code}`, aspectCode: code, aspectName: name, defaultThresholdValue: Number(defaultThresholdValue) || null, warningLeadValue: Number(warningLeadValue) || 50, isActive: true, isDummy: true };
  localStorage.setItem(CUSTOM_ASPECTS_KEY, JSON.stringify([...rows, aspect]));
  return aspect;
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
  if (rows.length < total) throw new Error('Data maintenance terlalu banyak untuk dimuat sekaligus.');
  return [...rows, ...getCustomAspects().filter((aspect) => !rows.some((row) => row.aspectCode === aspect.aspectCode))];
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
  if (rows.length < total) throw new Error('Data maintenance terlalu banyak untuk dimuat sekaligus.');
  return rows;
}

export async function getMaintenancePerformedByOptions() {
  try {
    const result = await apiRequest('/api/users?limit=100&isActive=true');
    const users = (result.data || []).map((user) => ({
      value: user.fullName || user.username,
      label: `${user.fullName || user.username}${user.username && user.fullName ? ` · ${user.username}` : ''}`,
    })).filter((option) => option.value);
    return users.length ? users : [
      { value: 'Tim Mekanik Internal', label: 'Tim Mekanik Internal' },
      { value: 'Admin Divisi Alat', label: 'Admin Divisi Alat' },
    ];
  } catch (error) {
    if (error?.status === 401) throw error;
    return [
      { value: 'Tim Mekanik Internal', label: 'Tim Mekanik Internal' },
      { value: 'Admin Divisi Alat', label: 'Admin Divisi Alat' },
    ];
  }
}

export function createMaintenanceRecord(payload) {
  return apiRequest(`${API_PREFIX}/maintenance-records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Log tindakan service/maintenance yang sudah pernah dilakukan. */
export async function getMaintenanceRecords({ equipmentItemId, limit = 20 } = {}) {
  const query = new URLSearchParams({ page: '1', limit: String(limit), sort: 'maintenanceDate', order: 'desc' });
  if (equipmentItemId) query.set('equipmentItemId', String(equipmentItemId));
  const result = await apiRequest(`${API_PREFIX}/maintenance-records?${query}`);
  return result.data || [];
}
