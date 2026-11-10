import { subProjectTypeLabel } from '../../admin/project/utils/projectFormat.js';

// Label & status modul Divisi Lapangan. Nilai enum mengikuti backend.

const tone = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  leaf: 'bg-leaf-50 text-leaf-700 border-leaf-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** Pengajuan dengan dua meja: Admin lalu Finance (dana, klaim upah, request material). */
export const REQUEST_STATUS = {
  submitted: { label: 'Menunggu Admin', className: tone.amber },
  waiting_finance_approval: { label: 'Menunggu Finance', className: tone.sky },
  approved: { label: 'Disetujui', className: tone.leaf },
  rejected: { label: 'Ditolak', className: tone.red },
  cancelled: { label: 'Dibatalkan', className: tone.slate },
};

export const EQUIPMENT_STATUS = {
  submitted: { label: 'Menunggu Admin', className: tone.amber },
  equipment_review: { label: 'Di Divisi Alat', className: tone.sky },
  approved: { label: 'Disetujui', className: tone.leaf },
  rejected: { label: 'Ditolak', className: tone.red },
  cancelled: { label: 'Dibatalkan', className: tone.slate },
};

/** Dokumen yang diperiksa Finance saja (laporan realisasi, bukti bayar). */
export const PROOF_STATUS = {
  submitted: { label: 'Menunggu Finance', className: tone.amber },
  validated: { label: 'Tervalidasi', className: tone.leaf },
  rejected: { label: 'Ditolak', className: tone.red },
  cancelled: { label: 'Dibatalkan', className: tone.slate },
};

export const CANCELLABLE_REQUEST = ['submitted', 'waiting_finance_approval'];

export const stageLabel = (subProject) => (subProject
  ? [subProject.constructionProject?.projectName, subProjectTypeLabel(subProject.subProjectType)].filter(Boolean).join(' · ')
  : '-');

/** Status enum → opsi FilterChips. */
export const statusOptions = (map) => [{ value: '', label: 'Semua' }, ...Object.entries(map).map(([value, style]) => ({ value, label: style.label }))];

export function currentUserId() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}').id;
  } catch {
    return undefined;
  }
}
