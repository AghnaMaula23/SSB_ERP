import { apiRequest } from '../../../../services/api.js';

// ============================================================
// STOK MATERIAL PER TAHAPAN (RM-5, backlog E16)
//
// Saldo dihitung backend dari penerimaan + mutasi manual; tidak ada "barang"
// yang dibuat sendiri. Material selalu dari master jenis material dan satuannya
// milik jenis itu — FE tidak pernah mengirim `unit`.
// ============================================================

const MAX_PAGES = 10;

/** Ambil semua halaman sebuah daftar berhalaman (limit 100 per halaman). */
async function fetchAll(path) {
  const rows = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await apiRequest(`${path}${separator}page=${page}&limit=100`);
    rows.push(...(result.data || []));
    if (page >= (result.totalPages || 1)) break;
  }
  return rows;
}

/** Saldo per material: received, adjustmentIn, used, adjustmentOut, balance, unit. */
export async function getStageStock(subProjectId) {
  return apiRequest(`/api/material-stock?subProjectId=${subProjectId}`);
}

/** Mutasi manual (pemakaian & koreksi), termasuk yang dibatalkan. */
export async function listStageMovements(subProjectId) {
  return fetchAll(`/api/material-stock/movements?subProjectId=${subProjectId}`);
}

/** Stok masuk = penerimaan material di tahapan ini. */
export async function listStageReceipts(subProjectId) {
  return fetchAll(`/api/material-receipts?subProjectId=${subProjectId}`);
}

/** Master jenis material aktif untuk pilihan form mutasi. */
export async function listActiveMaterialTypes() {
  return fetchAll('/api/materials/types?isActive=true');
}

/**
 * movementType: 'used' | 'adjustment_in' | 'adjustment_out'. Koreksi wajib
 * `notes`; stok yang jadi minus dibalas 409 dengan pesan siap tampil.
 */
export async function createStockMovement(subProjectId, form) {
  const notes = form.notes.trim();
  return apiRequest('/api/material-stock/movements', {
    method: 'POST',
    body: JSON.stringify({
      subProjectId: Number(subProjectId),
      materialTypeId: Number(form.materialTypeId),
      movementType: form.movementType,
      quantity: Number(form.quantity),
      movementDate: form.movementDate,
      ...(notes && { notes }),
    }),
  });
}

/** Salah input dibatalkan (alasan wajib), bukan dilawan dengan mutasi kebalikan. Hanya pencatatnya. */
export async function cancelStockMovement(movementId, reason) {
  return apiRequest(`/api/material-stock/movements/${movementId}/cancel`, {
    method: 'PUT',
    body: JSON.stringify({ reason: reason.trim() }),
  });
}
