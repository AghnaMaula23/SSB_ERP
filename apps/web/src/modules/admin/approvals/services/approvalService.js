import { apiRequest } from '../../../../services/api.js';

// Purchase request Divisi Alat — antrean validasi Admin.
const PR_API = '/api/equipment/purchase-requests';

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Balikan berhalaman: { data, total, page, limit, totalPages }. */
export async function listPurchaseRequests({ page = 1, limit = 10, status, orderCategory, search } = {}) {
  return apiRequest(`${PR_API}${query({ page, limit, status, orderCategory, search })}`);
}

export async function getPurchaseRequest(id) {
  return apiRequest(`${PR_API}/${id}`);
}

/**
 * Validasi Admin: submitted → waiting_finance_approval (antrean Finance).
 * Catatan belum bisa dikirim — backend menolak `notes` sampai Approval Center
 * punya tempat menyimpannya.
 */
export async function validatePurchaseRequest(id) {
  return apiRequest(`${PR_API}/${id}/validate`, { method: 'PUT' });
}

/** Tolak order berstatus submitted (khusus role admin). */
export async function rejectPurchaseRequest(id) {
  return apiRequest(`${PR_API}/${id}/reject`, { method: 'PUT' });
}

/** Total nominal satu status — dihitung dari seluruh halaman, bukan halaman tampil. */
export async function sumPurchaseRequests(status) {
  let total = 0;
  const first = await listPurchaseRequests({ page: 1, limit: 100, status });
  const pages = [first];
  for (let page = 2; page <= Math.min(first.totalPages || 1, 20); page += 1) {
    pages.push(await listPurchaseRequests({ page, limit: 100, status }));
  }
  pages.forEach((result) => (result.data || []).forEach((row) => { total += row.totalEstimatedAmount || 0; }));
  return { count: first.total || 0, total };
}
