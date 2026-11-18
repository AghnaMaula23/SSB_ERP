import { apiRequest } from '../../../../services/api.js';
import { query } from '../../../finance/services/financeService.js';

// Tagihan klien — Admin membuat, Finance memverifikasi (plan Finance 5b).
// Angka tagihan (volume, jam, penerimaan, tarif usulan) dibaca dari
// GET /income-records/billable — FE tidak menebak tarif atau volume.

/** `ctx` = { contextType, id } → nama field FK konteks di backend. */
export const CONTEXT_FIELD = { construction: 'subProjectId', rental: 'externalRentalProjectId', supply: 'externalSupplyProjectId' };

export const listIncomeRecords = (params = {}) => apiRequest(`/api/income-records${query(params)}`);
export const getIncomeRecord = (id) => apiRequest(`/api/income-records/${id}`);
export const getBillable = (contextType, contextId, periodStart, periodEnd) =>
  apiRequest(`/api/income-records/billable${query({ [CONTEXT_FIELD[contextType]]: contextId, periodStart, periodEnd })}`);
export const createIncomeRecord = (payload) => apiRequest('/api/income-records', { method: 'POST', body: JSON.stringify(payload) });
export const cancelIncomeRecord = (id, reason) => apiRequest(`/api/income-records/${id}/cancel`, { method: 'PUT', body: JSON.stringify({ reason: reason.trim() }) });
