export const PROJECT_KINDS = {
  construction: { label: 'Konstruksi', icon: '🏗️' },
  rental: { label: 'Rental', icon: '🛠️' },
  supply: { label: 'Supply', icon: '🚚' },
};

export const FILE_CATEGORIES = ['Surat Jalan', 'Laporan Harian', 'Foto Lapangan', 'Gambar Teknik', 'Sertifikat', 'Kontrak', 'Logistik', 'Invoice', 'Lainnya'];

// Status folder mengikuti status proyeknya; folder bisa diarsipkan manual.
export const FOLDER_STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', accent: 'border-l-emerald-500' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 border-amber-200', accent: 'border-l-amber-400' },
  archived: { label: 'Archived', className: 'bg-slate-100 text-slate-600 border-slate-200', accent: 'border-l-slate-400' },
};

export function folderStatus(folder) {
  if (folder.archived || ['completed', 'cancelled'].includes(folder.projectStatus)) return 'archived';
  if (folder.projectStatus === 'planned') return 'pending';
  return 'active';
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function fileKind(file) {
  const name = (file.fileName || '').toLowerCase();
  const type = file.mimeType || '';
  if (type.startsWith('image/')) return { kind: 'image', icon: '🖼️', tone: 'bg-sky-50 text-sky-700' };
  if (type === 'application/pdf' || name.endsWith('.pdf')) return { kind: 'pdf', icon: '📕', tone: 'bg-red-50 text-red-700' };
  if (/\.(xlsx?|csv)$/.test(name)) return { kind: 'sheet', icon: '📗', tone: 'bg-emerald-50 text-emerald-700' };
  if (/\.(docx?)$/.test(name)) return { kind: 'doc', icon: '📘', tone: 'bg-blue-50 text-blue-700' };
  if (name.endsWith('.dwg')) return { kind: 'cad', icon: '📐', tone: 'bg-violet-50 text-violet-700' };
  return { kind: 'other', icon: '📄', tone: 'bg-slate-100 text-slate-600' };
}

export function timeAgo(iso) {
  if (!iso) return '-';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} jam lalu`;
  if (minutes < 43200) return `${Math.round(minutes / 1440)} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}
