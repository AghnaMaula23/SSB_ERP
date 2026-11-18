// Enum & label mengikuti kontrak /api/income-records (plan Finance F10–F18).
// Total, terbayar, dan status bayar DIHITUNG backend — FE hanya menampilkan.

/** Jenis tagihan = konteks record (contextType di backend) = segmen URL form. */
export const SOURCES = {
  construction: { label: 'Progress Proyek', short: 'Proyek', icon: '🏗️', hint: 'Progress tervalidasi × nilai kontrak tahapan' },
  rental: { label: 'Sewa Alat', short: 'Rental', icon: '🛠️', hint: 'Jam kerja unit × tarif per jam' },
  supply: { label: 'Supply Material', short: 'Supply', icon: '🚚', hint: 'Material diterima × harga per satuan' },
};

export const INCOME_STATUS = {
  submitted: { label: 'Menunggu Finance', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Terverifikasi', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  rejected: { label: 'Ditolak Finance', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  voided: { label: 'Dibatalkan setelah sah', className: 'bg-slate-100 text-slate-600 border-slate-300' },
};

export const PAYMENT_STATUS = {
  unpaid: { label: 'Belum Dibayar', className: 'bg-red-50 text-red-700 border-red-200' },
  partially_paid: { label: 'Dibayar Sebagian', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  paid: { label: 'Lunas', className: 'bg-brand-50 text-brand-700 border-brand-200' },
};

export const PAYMENT_METHODS = { transfer: 'Transfer', cash: 'Tunai', giro: 'Giro', other: 'Lainnya' };

/** "PRJ-000001 Nama · Galian" / "RNT-000001 Nama". */
export function contextLabel(context) {
  if (!context) return '-';
  const stage = context.subProject ? ` · ${String(context.subProject.subProjectType).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}` : '';
  return `${context.code} ${context.name}${stage}`;
}
