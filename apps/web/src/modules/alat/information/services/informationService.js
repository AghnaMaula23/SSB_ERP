import { apiRequest } from '../../../../services/api.js';
import { dummyDamageLogs } from '../data/dummyInformation.js';

const API_PREFIX = import.meta.env.VITE_ALAT_API_PREFIX || '/api/equipment';

export async function getDamageLogs({ page = 1, limit = 10, search, status, sparePartSource, mechanicTeam } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) query.set('search', search);
  if (status && status !== 'all') query.set('status', status);
  if (sparePartSource && sparePartSource !== 'all') query.set('sparePartSource', sparePartSource);
  if (mechanicTeam && mechanicTeam !== 'all') query.set('mechanicTeam', mechanicTeam);
  const result = await apiRequest(`${API_PREFIX}/damage-logs?${query}`);
  return result.data?.length ? result : { ...result, data: dummyDamageLogs, total: dummyDamageLogs.length, isDummy: true };
}

export async function getInformationItems() {
  const result = await apiRequest(`${API_PREFIX}/items?page=1&limit=100&isActive=true`);
  return result.data || [];
}

export function createDamageLog(payload) {
  return apiRequest(`${API_PREFIX}/damage-logs`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateDamageLog(logId, payload) {
  return apiRequest(`${API_PREFIX}/damage-logs/${logId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function resolveDamageLog(logId, payload) {
  return apiRequest(`${API_PREFIX}/damage-logs/${logId}/resolve`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function cancelDamageLog(logId, notes) {
  return apiRequest(`${API_PREFIX}/damage-logs/${logId}/cancel`, { method: 'PUT', body: JSON.stringify({ notes }) });
}
