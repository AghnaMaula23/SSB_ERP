import { apiRequest } from '../../../services/api.js';

// Klaim pendapatan alat (plan Finance F19–F23): Divisi Alat mengajukan rentang tanggal,
// SEMUA jam kerja yang tagihan kliennya sudah lunas ikut utuh; Finance menyetujui
// (cash-in Kas Alat + jurnal) atau menolak. Nominal dihitung backend.

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const getEligibleClaim = (periodStart, periodEnd) => apiRequest(`/api/equipment-income-claims/eligible${query({ periodStart, periodEnd })}`);
export const listIncomeClaims = (params = {}) => apiRequest(`/api/equipment-income-claims${query({ limit: 20, ...params })}`);
export const createIncomeClaim = (payload) => apiRequest('/api/equipment-income-claims', { method: 'POST', body: JSON.stringify(payload) });
export const cancelIncomeClaim = (id, reason) => apiRequest(`/api/equipment-income-claims/${id}/cancel`, { method: 'PUT', body: JSON.stringify({ reason: reason.trim() }) });
