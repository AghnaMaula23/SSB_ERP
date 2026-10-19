import { apiRequest } from '../../../../services/api.js';
import { listSubProjects } from '../../project/services/projectService.js';
import { listDeliveriesBy } from '../../supply/services/deliveryService.js';

// ============================================================
// FOLDER SISTEM BACA-SAJA (keputusan lampiran L7)
//
// Lampiran modul — surat jalan delivery & bukti penerimaan material — tampil
// per project langsung dari API sumbernya, TIDAK disalin ke folder user
// (satu fakta di satu tempat). Membukanya lewat GET /api/files/:id/url.
// ============================================================

export const SYSTEM_FOLDERS = {
  deliveryNotes: { label: 'Surat Jalan', icon: '🧾', hint: 'Dari pencatatan pengiriman material (Divisi Lapangan)' },
  receiptProofs: { label: 'Bukti Penerimaan', icon: '📦', hint: 'Foto/dokumen saat material diterima di lokasi' },
};

async function fetchAllReceipts(filter) {
  const params = new URLSearchParams(Object.entries(filter).map(([key, value]) => [key, String(value)]));
  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    params.set('page', String(page));
    params.set('limit', '100');
    const result = await apiRequest(`/api/material-receipts?${params}`);
    rows.push(...(result.data || []));
    if (page >= (result.totalPages || 1)) break;
  }
  return rows;
}

const noteRow = (delivery, stageLabel) => ({
  key: `d${delivery.id}`,
  fileId: delivery.fileId,
  title: `SJ ${delivery.deliveryNoteNo}`,
  subtitle: [delivery.material, `${delivery.volume} ${delivery.unit}`, delivery.supplier, stageLabel].filter(Boolean).join(' · '),
  date: delivery.deliveryDate,
  isCancelled: delivery.isCancelled,
});

const proofRows = (receipt, stageLabel) => (receipt.attachments || []).map((file) => ({
  key: `r${receipt.id}-${file.id}`,
  fileId: file.id,
  title: file.originalName,
  subtitle: [receipt.receiptCode, receipt.materialType?.materialName, stageLabel].filter(Boolean).join(' · '),
  date: String(receipt.receivedAt || '').slice(0, 10),
  size: file.sizeBytes,
  mimeType: file.mimeType,
  isCancelled: receipt.isCancelled,
}));

/**
 * Isi folder sistem untuk satu folder project.
 * Balikan `{ available, reason?, deliveryNotes, receiptProofs }`.
 */
export async function loadSystemFiles(folder) {
  const empty = { deliveryNotes: [], receiptProofs: [] };
  if (folder.isDemo || !folder.projectId) {
    return { ...empty, available: false, reason: 'Folder contoh tidak terhubung ke project di database, jadi tidak punya lampiran modul.' };
  }
  if (folder.projectKind === 'rental') {
    return { ...empty, available: false, reason: 'Kontrak rental belum punya lampiran modul — jam kerja alat tidak menyertakan berkas.' };
  }

  if (folder.projectKind === 'supply') {
    const [deliveries, receipts] = await Promise.all([
      listDeliveriesBy({ externalSupplyProjectId: folder.projectId }),
      fetchAllReceipts({ externalSupplyProjectId: folder.projectId }),
    ]);
    return {
      available: true,
      deliveryNotes: deliveries.filter((row) => row.fileId).map((row) => noteRow(row)),
      receiptProofs: receipts.flatMap((row) => proofRows(row)),
    };
  }

  // Konstruksi: lampiran tercatat per tahapan — kumpulkan dari semua tahapan.
  const stages = (await listSubProjects(folder.projectId)).data || [];
  const perStage = await Promise.all(stages.map(async (stage) => {
    const label = stage.subProjectType?.replace(/_/g, ' ');
    const [deliveries, receipts] = await Promise.all([
      listDeliveriesBy({ subProjectId: stage.id }),
      fetchAllReceipts({ subProjectId: stage.id }),
    ]);
    return {
      deliveryNotes: deliveries.filter((row) => row.fileId).map((row) => noteRow(row, label)),
      receiptProofs: receipts.flatMap((row) => proofRows(row, label)),
    };
  }));
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
  return {
    available: true,
    deliveryNotes: perStage.flatMap((row) => row.deliveryNotes).sort(byDateDesc),
    receiptProofs: perStage.flatMap((row) => row.receiptProofs).sort(byDateDesc),
  };
}

/** URL berkas berlaku 5 menit — minta setiap kali dibuka, jangan disimpan. */
export async function getSystemFileUrl(fileId) {
  return (await apiRequest(`/api/files/${fileId}/url`)).url;
}
