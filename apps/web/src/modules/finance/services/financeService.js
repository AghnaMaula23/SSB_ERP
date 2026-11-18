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

export const query = (params) => {
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

// ============================================================
// Divisi Finance — Income, GL, Payroll (kontrak swagger beku 16 Nov 2026,
// docs/claude_knowledge/plan-divisi-finance.md bagian 5). Total, saldo, dan status
// bayar DIHITUNG backend — FE tidak menjumlah ulang.
// ============================================================

const post = (path, body = {}) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
const putJson = (path, body = {}) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
const voidBody = (reason) => ({ reason: reason.trim() });

/** FormData dari objek teks + file di `fileField` (multipart). Nilai kosong tidak dikirim. */
export function toFormData(fields, fileField, files = []) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  files.forEach((file) => form.append(fileField, file));
  return form;
}
const sendForm = (path, method, form) => apiRequest(path, { method, body: form });

// ---------- Tagihan klien (Income) ----------
export const listIncomeRecords = (params = {}) => apiRequest(`/api/income-records${query(params)}`);
export const getIncomeRecord = (id) => apiRequest(`/api/income-records/${id}`);
export const verifyIncomeRecord = (id, notes) => put(`/api/income-records/${id}/verify`, notesBody(notes));
export const rejectIncomeRecord = (id, notes) => put(`/api/income-records/${id}/reject`, reasonBody(notes));
export const voidIncomeRecord = (id, reason) => putJson(`/api/income-records/${id}/void`, voidBody(reason));

// ---------- Pembayaran klien ----------
export const listIncomePayments = (params = {}) => apiRequest(`/api/income-payments${query(params)}`);
export const recordIncomePayment = (fields, proofs) => sendForm('/api/income-payments', 'POST', toFormData(fields, 'proofs', proofs));
export const voidIncomePayment = (id, reason) => putJson(`/api/income-payments/${id}/void`, voidBody(reason));

// ---------- Klaim pendapatan alat ----------
export const listEquipmentClaims = (params = {}) => apiRequest(`/api/equipment-income-claims${query(params)}`);
export const getEquipmentClaim = (id) => apiRequest(`/api/equipment-income-claims/${id}`);
export const approveEquipmentClaim = (id, notes) => put(`/api/equipment-income-claims/${id}/approve`, notesBody(notes));
export const rejectEquipmentClaim = (id, notes) => put(`/api/equipment-income-claims/${id}/reject`, reasonBody(notes));

// ---------- Chart of Accounts ----------
export const listAccounts = (params = {}) => apiRequest(`/api/chart-of-accounts${query(params)}`);
export const createAccount = (payload) => post('/api/chart-of-accounts', payload);
export const updateAccount = (id, payload) => putJson(`/api/chart-of-accounts/${id}`, payload);

// ---------- Jurnal & laporan GL ----------
export const listJournals = (params = {}) => apiRequest(`/api/journal-entries${query(params)}`);
export const getJournal = (id) => apiRequest(`/api/journal-entries/${id}`);
export const addJournalAdjustment = (id, payload) => post(`/api/journal-entries/${id}/adjustments`, payload);
export const getAccountLedger = (accountId, startDate, endDate) => apiRequest(`/api/general-ledger/accounts/${accountId}${query({ startDate, endDate })}`);
export const getTrialBalance = (date) => apiRequest(`/api/general-ledger/trial-balance${query({ date })}`);

// ---------- Tutup buku ----------
export const listAccountingPeriods = () => apiRequest('/api/accounting-periods');
export const closeAccountingPeriod = (period, notes) => putJson(`/api/accounting-periods/${period}/close`, notes?.trim() ? { notes: notes.trim() } : {});
export const reopenAccountingPeriod = (period, reason) => putJson(`/api/accounting-periods/${period}/reopen`, voidBody(reason));

// ---------- Pengeluaran manual ----------
export const listManualExpenses = (params = {}) => apiRequest(`/api/manual-expenses${query(params)}`);
export const createManualExpense = (fields, attachments) => sendForm('/api/manual-expenses', 'POST', toFormData(fields, 'attachments', attachments));
export const voidManualExpense = (id, reason) => putJson(`/api/manual-expenses/${id}/void`, voidBody(reason));

// ---------- Karyawan & gaji ----------
export const listEmployees = (params = {}) => apiRequest(`/api/employees${query(params)}`);
export const getEmployee = (id) => apiRequest(`/api/employees/${id}`);
export const createEmployee = (payload) => post('/api/employees', payload);
export const updateEmployee = (id, payload) => putJson(`/api/employees/${id}`, payload);
export const listCompensations = (employeeId) => apiRequest(`/api/employee-compensations${query({ employeeId })}`);
export const createCompensation = (payload) => post('/api/employee-compensations', payload);

// ---------- Payroll bulanan ----------
export const listPayrolls = (params = {}) => apiRequest(`/api/payrolls${query(params)}`);
export const getPayroll = (id) => apiRequest(`/api/payrolls/${id}`);
/** Balikan `{ data, skipped }` — karyawan aktif tanpa gaji berlaku dilaporkan, bukan dilewati diam-diam. */
export const createPayroll = (payload) => post('/api/payrolls', payload);
export const regeneratePayroll = (id) => putJson(`/api/payrolls/${id}/regenerate`);
export const replacePayrollComponents = (id, itemId, components) => putJson(`/api/payrolls/${id}/items/${itemId}/components`, { components });
export const finalizePayroll = (id) => putJson(`/api/payrolls/${id}/finalize`);
export const cancelPayroll = (id, reason) => putJson(`/api/payrolls/${id}/cancel`, voidBody(reason));
export const payPayroll = (id, fields, proofs) => sendForm(`/api/payrolls/${id}/pay`, 'PUT', toFormData(fields, 'proofs', proofs));
export const voidPayroll = (id, reason) => putJson(`/api/payrolls/${id}/void`, voidBody(reason));
