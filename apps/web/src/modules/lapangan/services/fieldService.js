import { apiRequest } from '../../../services/api.js';

// ============================================================
// API Divisi Lapangan — request material & alat, surat jalan, penerimaan,
// kas lapangan, klaim upah, bukti bayar (Swagger tag masing-masing,
// docs/backlog-fe.md E14–E16, E27). Admin memakai fungsi baca & keputusannya.
// Form + berkas dikirim SATU multipart: Content-Type dibiarkan diisi browser.
// ============================================================

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

const put = (path, body = {}) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
const post = (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });

const notesBody = (notes) => (notes?.trim() ? { notes: notes.trim() } : {});

/** Field teks kosong tidak dikirim; `files` ditempel ke satu nama field. */
function toFormData(fields, fileField, files) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  files.forEach((file) => form.append(fileField, file));
  return form;
}

// ---------------- Master pilihan form ----------------

export const listSuppliers = () => apiRequest('/api/materials/suppliers?isActive=true&limit=100');
export const listEquipmentTypes = () => apiRequest('/api/equipment/types');
export const listExpenseCategories = () => apiRequest('/api/field-expense-categories');

// ---------------- Request material ----------------

export const listMaterialRequests = (params = {}) => apiRequest(`/api/request-material${query({ limit: 15, ...params })}`);
export const getMaterialRequest = (id) => apiRequest(`/api/request-material/${id}`);
export const createMaterialRequest = (payload) => post('/api/request-material', payload);
export const cancelMaterialRequest = (id) => put(`/api/request-material/${id}/cancel`);

// ---------------- Surat jalan & penerimaan ----------------

export const listDeliveries = (materialRequestId) => apiRequest(`/api/material-deliveries${query({ materialRequestId, limit: 100 })}`);
export const getDelivery = (id) => apiRequest(`/api/material-deliveries/${id}`);
export const createDelivery = (fields, file) => apiRequest('/api/material-deliveries', { method: 'POST', body: toFormData(fields, 'deliveryNote', [file]) });
export const cancelDelivery = (id, reason) => put(`/api/material-deliveries/${id}/cancel`, { reason: reason.trim() });
export const createReceipt = (fields, files) => apiRequest('/api/material-receipts', { method: 'POST', body: toFormData(fields, 'proofs', files) });

// ---------------- Request alat internal ----------------

export const listEquipmentRequests = (params = {}) => apiRequest(`/api/request-alat${query({ requestType: 'internal_project', limit: 15, ...params })}`);
export const getEquipmentRequest = (id) => apiRequest(`/api/request-alat/${id}`);
export const createEquipmentRequest = (payload) => post('/api/request-alat', { requestType: 'internal_project', ...payload });
export const cancelEquipmentRequest = (id) => put(`/api/request-alat/${id}/cancel`);

// ---------------- Kas lapangan: pengajuan dana ----------------

export const listCashRequests = (params = {}) => apiRequest(`/api/field-operational-requests${query({ limit: 15, ...params })}`);
export const getCashRequest = (id) => apiRequest(`/api/field-operational-requests/${id}`);
export const createCashRequest = (payload) => post('/api/field-operational-requests', payload);
export const cancelCashRequest = (id, reason) => put(`/api/field-operational-requests/${id}/cancel`, { reason: reason.trim() });
/** Admin: teruskan ke Finance. */
export const validateCashRequest = (id, notes) => put(`/api/field-operational-requests/${id}/validate`, notesBody(notes));
export const rejectCashRequest = (id, notes) => put(`/api/field-operational-requests/${id}/reject`, { notes: notes.trim() });

// ---------------- Kas lapangan: laporan realisasi + nota ----------------

export const listExpenseReports = (params = {}) => apiRequest(`/api/field-expense-reports${query({ limit: 15, ...params })}`);
export const getExpenseReport = (id) => apiRequest(`/api/field-expense-reports/${id}`);
/** `items` dikirim sebagai string JSON: multipart tidak punya array objek. */
export const createExpenseReport = ({ items, ...fields }, files) => apiRequest('/api/field-expense-reports', {
  method: 'POST',
  body: toFormData({ ...fields, items: JSON.stringify(items) }, 'receipts', files),
});
export const cancelExpenseReport = (id, reason) => put(`/api/field-expense-reports/${id}/cancel`, { reason: reason.trim() });

// ---------------- Klaim upah & bukti bayar ----------------

export const listWageClaims = (params = {}) => apiRequest(`/api/labor-wage-claims${query({ limit: 15, ...params })}`);
export const getWageClaim = (id) => apiRequest(`/api/labor-wage-claims/${id}`);
export const createWageClaim = (payload) => post('/api/labor-wage-claims', payload);
export const cancelWageClaim = (id, reason) => put(`/api/labor-wage-claims/${id}/cancel`, { reason: reason.trim() });
/** Admin: teruskan ke Finance setelah memeriksa kehadiran & upah. */
export const validateWageClaim = (id, notes) => put(`/api/labor-wage-claims/${id}/validate`, notesBody(notes));
export const rejectWageClaim = (id, notes) => put(`/api/labor-wage-claims/${id}/reject`, { notes: notes.trim() });

/** Log tahapan dalam rentang yang belum masuk klaim aktif — pratinjau form klaim. */
export const listUnclaimedLogs = (subProjectId, startDate, endDate) => apiRequest(`/api/labor-logs${query({ subProjectId, startDate, endDate, claimed: 'false', limit: 100 })}`);

export const listPaymentProofs = (laborWageClaimId) => apiRequest(`/api/labor-payment-proofs${query({ laborWageClaimId, limit: 100 })}`);
export const getPaymentProof = (id) => apiRequest(`/api/labor-payment-proofs/${id}`);
export const createPaymentProof = (fields, files) => apiRequest('/api/labor-payment-proofs', { method: 'POST', body: toFormData(fields, 'proofs', files) });
export const cancelPaymentProof = (id, reason) => put(`/api/labor-payment-proofs/${id}/cancel`, { reason: reason.trim() });
