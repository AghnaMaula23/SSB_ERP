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

const notesBody = (notes) => JSON.stringify(notes?.trim() ? { notes: notes.trim() } : {});

/**
 * Validasi Admin: submitted → waiting_finance_approval (antrean Finance).
 * `notes` opsional, tersimpan di `adminNotes`.
 */
export async function validatePurchaseRequest(id, notes) {
  return apiRequest(`${PR_API}/${id}/validate`, { method: 'PUT', body: notesBody(notes) });
}

/** Tolak order berstatus submitted. Alasan WAJIB — tanpa itu backend membalas 400. */
export async function rejectPurchaseRequest(id, notes) {
  return apiRequest(`${PR_API}/${id}/reject`, { method: 'PUT', body: JSON.stringify({ notes: notes.trim() }) });
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

// ============================================================
// APPROVAL CENTER — antrean lintas sumber (baca-saja, E22)
// Aksi tetap memakai endpoint modul sumber; antrean hanya menunjuk ke sana.
// ============================================================

/** Balikan berhalaman: { data, total, page, limit, totalPages }. */
export async function listApprovalQueue({ stage = 'admin', sourceType, search, sort = 'oldest', page = 1, limit = 15 } = {}) {
  return apiRequest(`/api/approval-queue${query({ stage, sourceType, search, sort, page, limit })}`);
}

/** { total, items: [{ stage, sourceType, count, oldestSubmittedAt }] } — tab ditentukan dari sini, bukan nama role. */
export async function getApprovalSummary() {
  return apiRequest('/api/approval-queue/summary');
}

// ---------------- Request Alat (internal_project) — review Admin ----------------

export async function getEquipmentRequest(id) {
  return apiRequest(`/api/request-alat/${id}`);
}

/** action: 'forward' (ke Divisi Alat) | 'reject' (alasan wajib). */
export async function reviewEquipmentRequest(id, action, notes) {
  const text = notes?.trim();
  return apiRequest(`/api/request-alat/${id}/admin-review`, {
    method: 'PUT',
    body: JSON.stringify({ action, ...(text && { notes: text }) }),
  });
}

// ---------------- Request Material — validasi kuantitas & rincian biaya ----------------

export async function getMaterialRequest(id) {
  return apiRequest(`/api/request-material/${id}`);
}

/** items: [{ itemId, adminValidatedQuantity (null = kembali ke diminta), adminNotes }]. Status tetap submitted. */
export async function validateMaterialQuantities(id, items) {
  return apiRequest(`/api/request-material/${id}/admin-validation`, { method: 'PUT', body: JSON.stringify({ items }) });
}

/** MENGGANTI seluruh daftar biaya. `material_cost` wajib menunjuk tepat satu item. */
export async function replaceMaterialCosts(id, costs) {
  return apiRequest(`/api/request-material/${id}/costs`, { method: 'PUT', body: JSON.stringify({ costs }) });
}

/** Kuantitas & biaya terkunci setelah ini; 400 kalau ada item tanpa material_cost. */
export async function submitMaterialToFinance(id, notes) {
  return apiRequest(`/api/request-material/${id}/submit-to-finance`, { method: 'PUT', body: notesBody(notes) });
}

export async function rejectMaterialRequest(id, notes) {
  return apiRequest(`/api/request-material/${id}/reject`, { method: 'PUT', body: JSON.stringify({ notes: notes.trim() }) });
}
