// Label dan format tampilan modul Project. Nilai enum mengikuti backend
// (project.routes.js) — jangan menambah nilai yang tidak dikenal API.

export const SUB_PROJECT_TYPES = [
  { value: 'galian', label: 'Galian', hint: 'Excavation' },
  { value: 'timbunan', label: 'Timbunan', hint: 'Embankment' },
  { value: 'line_clearing', label: 'Line Clearing', hint: 'Land clearing' },
  { value: 'aspal', label: 'Aspal', hint: 'Paving' },
];

export const VOLUME_UNITS = [
  { value: 'm3', label: 'm³ (Meter Kubik)' },
  { value: 'm2', label: 'm² (Meter Persegi)' },
  { value: 'm', label: 'm (Meter)' },
  { value: 'km', label: 'km (Kilometer)' },
  { value: 'ton', label: 'ton' },
];

const UNIT_DISPLAY = { m3: 'm³', m2: 'm²' };

export const subProjectTypeLabel = (type) =>
  SUB_PROJECT_TYPES.find((option) => option.value === type)?.label || type || '-';

export const unitLabel = (unit) => UNIT_DISPLAY[unit] || unit || '';

export const PROJECT_STATUS = {
  planned: { label: 'Planned', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  active: { label: 'Active', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  completed: { label: 'Completed', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
};

export const PROGRESS_STATUS = {
  submitted: { label: 'Menunggu Validasi', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  validated: { label: 'Tervalidasi', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
};

export const ALLOCATION_STATUS = {
  assigned: { label: 'Assigned', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  completed: { label: 'Completed', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  returned: { label: 'Returned', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Transisi status yang sah — cermin STATUS_TRANSITIONS di backend, dipakai
// hanya untuk menyembunyikan tombol yang pasti ditolak. Backend tetap penentu.
export const STATUS_TRANSITIONS = {
  planned: ['active', 'cancelled'],
  active: ['planned', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const currencyFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export const formatNumber = (value) => (value === null || value === undefined || Number.isNaN(Number(value)) ? '-' : numberFormat.format(Number(value)));
export const formatCurrency = (value) => (value === null || value === undefined ? '-' : currencyFormat.format(Number(value)));
export const formatVolume = (value, unit) => (value === null || value === undefined ? '-' : `${formatNumber(value)} ${unitLabel(unit)}`.trim());

export function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', options);
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DAY_MS = 86400000;
const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Jadwal project dari startDate/endDate. Null kalau tanggalnya belum lengkap —
 * kartu jadwal lalu meminta Admin melengkapinya, bukan mengarang angka.
 */
export function projectSchedule(project, today = new Date()) {
  if (!project?.startDate || !project?.endDate) return null;
  const start = startOfDay(project.startDate);
  const end = startOfDay(project.endDate);
  const now = startOfDay(today);
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const elapsedDays = Math.round((now - start) / DAY_MS);
  const currentWeek = elapsedDays < 0 ? 0 : Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);
  const remainingDays = Math.max(0, Math.round((end - now) / DAY_MS));
  const timeElapsedPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  return {
    totalWeeks,
    currentWeek,
    remainingDays,
    timeElapsedPct,
    notStarted: elapsedDays < 0,
    overdue: now > end,
  };
}

/**
 * Progress keseluruhan project = nilai tagihan tervalidasi ÷ nilai kontrak
 * tahapan yang hidup — rumus yang sama dengan backend, jadi persentase ini
 * selalu sejalan dengan uang yang boleh ditagih. Kalau belum ada nilai kontrak,
 * jatuh ke rata-rata progress tahapan.
 */
export function overallProgress(subProjects, summary) {
  if (summary?.totalContractValue > 0) {
    return Math.min(100, (summary.totalBillableAmount / summary.totalContractValue) * 100);
  }
  const live = (subProjects || []).filter((stage) => stage.status !== 'cancelled');
  if (live.length === 0) return 0;
  return live.reduce((total, stage) => total + (stage.progress?.billableProgress || 0), 0) / live.length;
}

export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

/** Petakan `errors` dari ApiError (validasi 400) ke objek { field: pesan }. */
export function fieldErrorsFrom(error) {
  return (error?.errors || []).reduce((result, item) => {
    if (item?.field && !result[item.field]) result[item.field] = item.message;
    return result;
  }, {});
}

/** Breadcrumb standar halaman di dalam satu tahapan. */
export function stageCrumbs(project, stage, ...tail) {
  return [
    { label: 'Project', href: '#/admin/projects' },
    { label: project.projectName, href: `#/admin/projects/${project.id}` },
    { label: subProjectTypeLabel(stage.subProjectType), href: `#/admin/projects/${project.id}/sub/${stage.id}/volume` },
    ...tail,
  ];
}

/** Tanggal hari ini (zona lokal) dalam format YYYY-MM-DD untuk input date. */
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export const actorName = (actor) => actor?.fullName || actor?.username || '-';

export const POOL_STATUS = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  active: { label: 'Active', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  closed: { label: 'Closed', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
};

export const POOL_ITEM_STATUS = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  available: { label: 'Available', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  assigned: { label: 'Assigned', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed: { label: 'Completed', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};
