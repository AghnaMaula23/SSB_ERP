import { apiRequest } from '../../../services/api.js';

// ============================================================
// Keputusan Divisi Finance — memakai endpoint modul sumber apa adanya
// (docs/keputusan-desain-approval-center.md). Antrean dibaca dari
// /api/approval-queue?stage=finance; daftar yang tampil hanya yang boleh
// diputuskan user ini, dokumen milik sendiri sudah disaring backend.
// ============================================================

const put = (path, body = {}) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
const notesBody = (notes) => (notes?.trim() ? { notes: notes.trim() } : {});
const reasonBody = (notes) => ({ notes: notes.trim() });

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** Ambil semua halaman sebuah daftar (limit 100 per halaman, maksimal `maxPages`). */
export async function fetchAllPages(path, params = {}, maxPages = 10) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await apiRequest(`${path}${query({ ...params, page, limit: 100 })}`);
    rows.push(...(result.data || []));
    if (page >= (result.totalPages || 1)) break;
  }
  return rows;
}

export const listFinanceQueue = (params) => apiRequest(`/api/approval-queue${query({ stage: 'finance', ...params })}`);

// ---------- PR Divisi Alat: Finance mengisi nominal AKTUAL per baris ----------
export const approvePurchaseRequest = (id, payload) => put(`/api/equipment/purchase-requests/${id}/approve`, payload);
export const rejectPurchaseRequest = (id, notes) => put(`/api/equipment/purchase-requests/${id}/reject`, reasonBody(notes));

// ---------- Request material: nominal disetujui = yang diajukan Admin ----------
export const approveMaterialRequest = (id, notes, materialPoolId) => put(`/api/request-material/${id}/approve`, {
  ...notesBody(notes),
  ...(materialPoolId && { materialPoolId: Number(materialPoolId) }),
});
export const rejectMaterialRequest = (id, notes) => put(`/api/request-material/${id}/reject`, reasonBody(notes));

/** Pool tujuan material yang masih hidup untuk pemilik request (project konstruksi / supply). */
export async function listLiveMaterialPools(request) {
  const owner = request.requestType === 'internal_project'
    ? { ownerType: 'construction_project', constructionProjectId: request.subProject?.constructionProjectId }
    : { ownerType: 'external_supply_project', externalSupplyProjectId: request.externalSupplyProjectId };
  const result = await apiRequest(`/api/projects/material-pools${query({ ...owner, limit: 100 })}`);
  return (result.data || []).filter((pool) => !['closed', 'cancelled'].includes(pool.status));
}

// ---------- Kas lapangan ----------
export const validateExpenseReport = (id, notes) => put(`/api/field-expense-reports/${id}/validate`, notesBody(notes));
export const rejectExpenseReport = (id, notes) => put(`/api/field-expense-reports/${id}/reject`, reasonBody(notes));

// ---------- Upah pekerja ----------
export const validatePaymentProof = (id, notes) => put(`/api/labor-payment-proofs/${id}/validate`, notesBody(notes));
export const rejectPaymentProof = (id, notes) => put(`/api/labor-payment-proofs/${id}/reject`, reasonBody(notes));
