import { apiRequest } from '../../../../services/api.js';
import { listDemoDeliveries } from './deliveryMockService.js';

// ============================================================
// Ritase / surat jalan supply — BACA-SAJA dari menu Admin.
//
// Sejak RM-4 (16 Okt 2026) delivery dicatat Divisi Lapangan lewat
// POST /api/material-deliveries (multipart + file surat jalan) dan terikat ke
// item request material yang sudah approved. Admin cukup melihat rekapnya.
// Kontrak contoh (demo-N) memakai data contoh lokal.
// ============================================================

const DELIVERY_API = '/api/material-deliveries';
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

/** Bentuk baris bersama untuk tabel rekap (API & data contoh). */
const fromApi = (row) => ({
  id: row.id,
  deliveryCode: row.deliveryCode,
  deliveryDate: row.deliveryNoteDate,
  deliveryNoteNo: row.deliveryNoteNumber,
  vehicleType: row.vehicleType,
  plateNumber: row.vehicleNumber,
  driverName: row.driverName,
  material: row.materialType?.materialName || '-',
  // Satuan milik jenis material (D1) — selalu ditampilkan di samping angka
  unit: row.unit,
  supplier: row.supplier?.supplierName || null,
  requestCode: row.materialRequest?.requestCode || null,
  originLocation: row.originLocation,
  destinationLocation: row.destinationLocation,
  volume: row.deliveredQuantity,
  isCancelled: row.isCancelled,
  cancelReason: row.cancelReason,
  received: Boolean(row.receipt),
  acceptedQuantity: row.receipt?.acceptedQuantity ?? null,
  fileId: row.deliveryNoteFile?.id || null,
  createdBy: row.createdBy,
});

/**
 * Semua delivery untuk satu filter (`externalSupplyProjectId` atau
 * `subProjectId`), termasuk yang dibatalkan (ditandai `isCancelled`).
 */
export async function listDeliveriesBy(filter) {
  const params = new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, String(value)]));
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));
    const result = await apiRequest(`${DELIVERY_API}?${params}`);
    rows.push(...(result.data || []).map(fromApi));
    if (page >= (result.totalPages || 1)) break;
  }
  return rows;
}

/** Semua delivery satu kontrak supply; kontrak contoh memakai data contoh. */
export async function listProjectDeliveries(project) {
  if (project.isDemo) return listDemoDeliveries(project.id);
  return listDeliveriesBy({ externalSupplyProjectId: project.id });
}

/**
 * URL file surat jalan — berlaku 5 menit, jadi diminta ulang setiap kali
 * dibuka dan tidak disimpan.
 */
export async function getDeliveryNoteUrl(fileId) {
  const file = await apiRequest(`/api/files/${fileId}/url`);
  return file.url;
}
