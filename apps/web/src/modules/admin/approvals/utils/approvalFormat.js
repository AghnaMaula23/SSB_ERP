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
 * Validasi purchase request memakai authorizeStrict di backend: super_admin
 * TIDAK di-bypass. Jadi cek permission-nya langsung, jangan lewat
 * hasPermission() (yang mem-bypass super_admin) — lihat backlog-fe E3.
 * Menolak order `submitted` juga dibatasi role admin oleh service.
 */
export function prPermissions() {
  const user = readUser();
  const permissions = user.permissions || [];
  const roles = user.roles || [];
  return {
    userId: user.id,
    canValidate: permissions.includes('purchase-request:validate'),
    canReject: permissions.includes('purchase-request:validate') && roles.includes('admin'),
  };
}
