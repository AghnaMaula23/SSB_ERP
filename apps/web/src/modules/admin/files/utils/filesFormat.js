import { subProjectTypeLabel } from '../../project/utils/projectFormat.js';
import { filesHref } from './filesRoute.js';

export const PROJECT_KINDS = {
  construction: { label: 'Konstruksi', icon: '🏗️' },
  rental: { label: 'Rental', icon: '🛠️' },
  supply: { label: 'Supply', icon: '🚚' },
};

// Status folder = status project-nya (L8: arsip manual dibuang). Unggah tidak
// dikunci status — BAST dsb. justru datang setelah project selesai.
export const PROJECT_STATUS = {
  planned: { label: 'Direncanakan', className: 'bg-amber-50 text-amber-800 border-amber-200', accent: 'border-l-amber-400' },
  active: { label: 'Aktif', className: 'bg-leaf-50 text-leaf-700 border-leaf-200', accent: 'border-l-leaf-500' },
  completed: { label: 'Selesai', className: 'bg-brand-50 text-brand-700 border-brand-200', accent: 'border-l-brand-500' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200', accent: 'border-l-slate-400' },
};

/** Folder sistem baca-saja (L7/L8) — isinya dari modul sumbernya. */
export const SYSTEM_FOLDERS = {
  'delivery-notes': { label: 'Surat Jalan', icon: '🧾', hint: 'Dari pencatatan pengiriman material (Divisi Lapangan)' },
  'receipt-proofs': { label: 'Bukti Penerimaan', icon: '📦', hint: 'Foto/dokumen saat material diterima di lokasi' },
  'closing-archive': { label: 'Arsip Penutupan', icon: '🗄️', hint: 'Rekap XLSX yang dibuat otomatis saat tahapan/project ditutup' },
};

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

const KIND_STYLE = {
  cad: { icon: '📐', tone: 'bg-violet-50 text-violet-700' },
  image: { icon: '🖼️', tone: 'bg-sky-50 text-sky-700' },
  pdf: { icon: '📕', tone: 'bg-red-50 text-red-700' },
  sheet: { icon: '📗', tone: 'bg-leaf-50 text-leaf-700' },
  doc: { icon: '📘', tone: 'bg-blue-50 text-blue-700' },
  other: { icon: '📄', tone: 'bg-slate-100 text-slate-600' },
};

/**
 * Jenis berkas untuk ikon & pratinjau. Pakai `kind` dari API kalau ada,
 * selain itu tebak dari nama + MIME (berkas lokal sebelum diunggah).
 */
export function fileKind({ kind, fileName = '', mimeType = '' }) {
  if (kind && KIND_STYLE[kind]) return { kind, ...KIND_STYLE[kind] };
  const name = fileName.toLowerCase();
  // DWG dicek dulu: MIME-nya `image/vnd.dwg`, tapi tidak bisa ditampilkan sebagai gambar.
  let guess = 'other';
  if (name.endsWith('.dwg')) guess = 'cad';
  else if (mimeType.startsWith('image/')) guess = 'image';
  else if (mimeType === 'application/pdf' || name.endsWith('.pdf')) guess = 'pdf';
  else if (/\.(xlsx|csv)$/.test(name)) guess = 'sheet';
  else if (/\.docx$/.test(name)) guess = 'doc';
  return { kind: guess, ...KIND_STYLE[guess] };
}

/**
 * Pesan penolakan jenis berkas (profil `project`, L3) — null kalau diterima.
 * Backend memeriksa isi berkas; di sini cukup ekstensi untuk umpan balik cepat.
 */
export function fileTypeError(fileName) {
  const extension = (fileName.split('.').pop() || '').toLowerCase();
  if (['heic', 'heif'].includes(extension)) return 'Foto HEIC tidak didukung. Atur kamera ke "Most Compatible" (JPG), lalu foto ulang.';
  if (['xls', 'doc', 'xlsm', 'docm'].includes(extension)) return `Format .${extension} tidak diterima — simpan ulang sebagai .xlsx / .docx (tanpa makro).`;
  if (!['pdf', 'jpg', 'jpeg', 'png', 'webp', 'dwg', 'xlsx', 'docx'].includes(extension)) return `Jenis berkas .${extension} tidak didukung.`;
  return null;
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

export const stageLabel = (stage) => (stage ? `Tahapan ${subProjectTypeLabel(stage.subProjectType)}` : 'Tingkat project');

/** Breadcrumb standar: Files › <project> › ...tail */
export function projectCrumbs(type, directory, ...tail) {
  return [
    { label: 'Files', href: filesHref.projects() },
    { label: directory.project.name, href: filesHref.project(type, directory.project.id) },
    ...tail,
  ];
}
