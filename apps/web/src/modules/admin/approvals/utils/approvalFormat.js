// Label & aturan tampilan Pusat Approval.

export const PR_STATUS = {
  submitted: { label: 'Menunggu Admin', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  waiting_finance_approval: { label: 'Menunggu Finance', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  approved: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected_by_admin: { label: 'Ditolak Admin', className: 'bg-red-50 text-red-700 border-red-200' },
  rejected_by_finance: { label: 'Ditolak Finance', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const PR_CATEGORY = {
  repair: 'Suku Cadang',
  maintenance: 'Service Rutin',
  stock: 'Stok Gudang',
};

export const PRIORITY = {
  kritis: { label: 'Kritis', className: 'bg-red-50 text-red-700 border-red-200' },
  mendesak: { label: 'Mendesak', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  rutin: { label: 'Rutin', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

/**
 * Prioritas turunan untuk membantu urutan review — bukan kolom backend.
 * Perbaikan kerusakan = mendesak; servis rutin mengikuti status jadwal
 * maintenance-nya (overdue = kritis, due = mendesak).
 */
export function prPriority(pr) {
  if (pr.orderCategory === 'repair') return 'mendesak';
  if (pr.orderCategory === 'maintenance') {
    const statuses = (pr.maintenanceItems || []).map((item) => item.maintenanceSetting?.status);
    if (statuses.includes('overdue')) return 'kritis';
    if (statuses.includes('due')) return 'mendesak';
  }
  return 'rutin';
}

/** Unit alat & uraian ringkas dari item order, apa pun kategorinya. */
export function prSummary(pr) {
  if (pr.orderCategory === 'repair') {
    const items = pr.repairItems || [];
    return {
      units: [...new Set(items.map((item) => item.damageLog?.equipmentItem?.assetCode).filter(Boolean))],
      lines: items.flatMap((item) => (item.spareparts?.length ? item.spareparts.map((sp) => sp.itemName) : [item.damageLog?.description || 'Jasa perbaikan'])),
    };
  }
  if (pr.orderCategory === 'maintenance') {
    const items = pr.maintenanceItems || [];
    return {
      units: [...new Set(items.map((item) => item.maintenanceSetting?.equipmentItem?.assetCode).filter(Boolean))],
      lines: items.map((item) => item.maintenanceSetting?.maintenanceAspect?.aspectName || 'Servis'),
    };
  }
  return { units: [], lines: (pr.stockItems || []).map((item) => item.itemName) };
}

export const KAS_STATUS = {
  submitted: { label: 'Menunggu Verifikasi', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
};

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

/**
 * Validasi & penolakan order `submitted` sama-sama butuh
 * `purchase-request:validate`; backend tidak lagi melihat nama role. Cek
 * permission-nya langsung (super_admin hanya memantau — backlog-fe E3).
 */
export function prPermissions() {
  const user = readUser();
  const permissions = user.permissions || [];
  const canValidate = permissions.includes('purchase-request:validate');
  return { userId: user.id, canValidate, canReject: canValidate };
}

// Sumber antrean Approval Center (sourceType dari /api/approval-queue).
export const QUEUE_SOURCES = {
  purchase_request: { label: 'PO Divisi Alat', icon: '🔧', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  material_request: { label: 'Request Material', icon: '🧱', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  equipment_request: { label: 'Request Alat', icon: '🚜', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  progress_log: { label: 'Progress Harian', icon: '📈', className: 'bg-teal-50 text-teal-700 border-teal-200' },
};

/** Rute layar review di FE untuk satu baris antrean; null = diputuskan langsung di antrean. */
export function queueDetailRoute(row) {
  if (row.sourceType === 'purchase_request') return `#/admin/approvals/po/${row.sourceId}`;
  if (row.sourceType === 'equipment_request') return `#/admin/approvals/alat/${row.sourceId}`;
  if (row.sourceType === 'material_request') return `#/admin/approvals/material/${row.sourceId}`;
  return null;
}

// Jenis biaya paket request material (enum backend material_request_costs.cost_type).
export const COST_TYPES = {
  material_cost: 'Harga material',
  driver_fee: 'Upah sopir',
  delivery_fee: 'Ongkos kirim',
  loading_unloading_fee: 'Bongkar muat',
  fuel_cost: 'BBM',
  other: 'Lainnya',
};

export const MATERIAL_REQUEST_STATUS = {
  submitted: { label: 'Menunggu Admin', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  waiting_finance_approval: { label: 'Menunggu Finance', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  approved: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const EQUIPMENT_REQUEST_STATUS = {
  submitted: { label: 'Menunggu Admin', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  equipment_review: { label: 'Di Divisi Alat', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  approved: { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** Id user login — dipakai menyembunyikan aksi atas dokumen yang diajukan sendiri. */
export function currentUserId() {
  return readUser().id;
}
