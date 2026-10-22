// Nilai billingMethod mengikuti validator backend (BILLING_METHODS).
export const BILLING_METHODS = {
  hourly: 'Per Jam',
  daily: 'Per Hari',
  monthly: 'Per Bulan',
  contract: 'Borongan / Kontrak',
};

export const PACKETS = {
  include_solar: { label: 'Include Solar', hint: 'Unit + operator + BBM', icon: '⛽' },
  supir_only: { label: 'Supir Only', hint: 'Unit + operator, BBM dari penyewa', icon: '🚚' },
};

export const RENTAL_STATUS = {
  planned: { label: 'Planned', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  active: { label: 'Operational', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  completed: { label: 'Selesai', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Status "unit" di layar = gabungan status request alat & pool item.
export const UNIT_STATUS = {
  requested: { label: 'Menunggu Divisi Alat', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  unbound: { label: 'Unit Belum Ditentukan', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  active: { label: 'Beroperasi', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  closed: { label: 'Selesai', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Ditolak', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Dibatalkan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

// ------------------------------------------------------------
// Catatan unit — operator, paket, periode, dan preferensi unit belum punya
// kolom di backend, jadi disimpan sebagai baris "Label: nilai" di notes
// request alat. Format ini dibaca balik oleh parseUnitNotes.
// ------------------------------------------------------------

// Merek/model/periode dulu ikut dititipkan; sejak backlog E18 tidak lagi —
// baris lama itu diabaikan saat dibaca.
const NOTE_FIELDS = [
  ['operator', 'Operator'],
  ['packet', 'Paket'],
  ['extra', 'Catatan'],
];

export function buildUnitNotes(form) {
  return NOTE_FIELDS
    .map(([key, label]) => {
      const raw = key === 'packet' ? PACKETS[form.packet]?.label : form[key];
      const value = String(raw ?? '').trim();
      return value ? `${label}: ${value}` : null;
    })
    .filter(Boolean)
    .join('\n') || null;
}

export function parseUnitNotes(text) {
  const result = {};
  String(text || '').split('\n').forEach((line) => {
    const match = /^([^:]+):\s*(.*)$/.exec(line.trim());
    if (!match) return;
    const field = NOTE_FIELDS.find(([, label]) => label.toLowerCase() === match[1].trim().toLowerCase());
    if (!field) return;
    result[field[0]] = field[0] === 'packet'
      ? Object.keys(PACKETS).find((key) => PACKETS[key].label === match[2]) || match[2]
      : match[2];
  });
  return result;
}

// ------------------------------------------------------------
// Timesheet — backend menyimpan satu baris per sesi kerja (startedAt..
// stoppedAt). Layar rekap mengelompokkan per tanggal ke tiga kolom sesi
// berdasarkan jam mulai, persis tabel kertas yang dipakai di lapangan.
// ------------------------------------------------------------

export const SESSIONS = [
  { key: 'pagi', label: 'Pagi', defaultStart: '08:00', defaultEnd: '12:00' },
  { key: 'siang', label: 'Siang', defaultStart: '13:00', defaultEnd: '17:00' },
  { key: 'overtime', label: 'Overtime', defaultStart: '17:30', defaultEnd: '19:30' },
];

const sessionOf = (startedAt) => {
  if (!startedAt) return null;
  const hour = new Date(startedAt).getHours();
  if (hour < 12) return 'pagi';
  if (hour < 17) return 'siang';
  return 'overtime';
};

const toHm = (value) => (value ? new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') : '');

/** logs → baris per tanggal { date, sessions: {pagi,siang,overtime}, untimed, total, notes } */
export function groupTimesheet(logs) {
  const byDate = new Map();
  logs.forEach((log) => {
    const row = byDate.get(log.workDate) || { date: log.workDate, sessions: {}, untimed: 0, total: 0, notes: [], logIds: [] };
    const key = sessionOf(log.startedAt);
    const hours = Number(log.totalWorkhour) || 0;
    if (key) {
      const current = row.sessions[key];
      row.sessions[key] = current
        ? { start: current.start < toHm(log.startedAt) ? current.start : toHm(log.startedAt), end: current.end > toHm(log.stoppedAt) ? current.end : toHm(log.stoppedAt), hours: current.hours + hours }
        : { start: toHm(log.startedAt), end: toHm(log.stoppedAt), hours };
    } else {
      row.untimed += hours;
    }
    row.total += hours;
    if (log.description) row.notes.push(log.description);
    row.logIds.push(log.id);
    byDate.set(log.workDate, row);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const minutesBetween = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
};

export function monthRange(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(year, monthIndex, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Satukan request alat & pool item menjadi daftar "unit" untuk layar.
 * - Pool item (hasil approval atau ditambah manual) = unit yang tersewa.
 * - Request yang belum/tidak menghasilkan pool item tampil sebagai kartu
 *   status (menunggu, ditolak, dibatalkan).
 */
export function buildUnits({ requests, pools }) {
  const requestByItemId = new Map();
  requests.forEach((request) => request.items.forEach((item) => requestByItemId.set(item.id, { request, item })));

  const units = [];
  pools.forEach((pool) => (pool.items || []).forEach((poolItem) => {
    const link = requestByItemId.get(poolItem.equipmentRequestItemId);
    const meta = parseUnitNotes(link?.item.itemNotes || link?.request.requestNotes);
    const closed = ['completed', 'cancelled', 'rejected'].includes(poolItem.status) || ['closed', 'cancelled'].includes(pool.status);
    units.push({
      key: `p${poolItem.id}`,
      kind: 'pool',
      poolId: pool.id,
      poolItemId: poolItem.id,
      equipmentItemId: poolItem.equipmentItemId,
      assetCode: poolItem.equipmentItem?.assetCode || null,
      typeName: poolItem.equipmentType?.typeName || '-',
      requestCode: link?.request.requestCode || null,
      neededDate: link?.request.neededDate || null,
      locationDetail: link?.request.locationDetail || null,
      status: closed ? 'closed' : poolItem.equipmentItemId ? 'active' : 'unbound',
      meta,
    });
  }));

  requests.forEach((request) => {
    const hasPoolItems = request.items.some((item) => (item.poolItems || []).length > 0);
    if (hasPoolItems) return;
    const statusKey = { equipment_review: 'requested', submitted: 'requested', rejected: 'rejected', cancelled: 'cancelled', approved: 'unbound' }[request.status] || 'requested';
    request.items.forEach((item) => units.push({
      key: `r${request.id}-${item.id}`,
      kind: 'request',
      requestId: request.id,
      requestCode: request.requestCode,
      requestStatus: request.status,
      neededDate: request.neededDate || null,
      locationDetail: request.locationDetail || null,
      typeName: item.equipmentType?.typeName || '-',
      quantity: item.requestedQuantity,
      status: statusKey,
      notes: request.equipmentNotes,
      meta: parseUnitNotes(item.itemNotes || request.requestNotes),
    }));
  });

  const order = { active: 0, unbound: 1, requested: 2, closed: 3, rejected: 4, cancelled: 5 };
  return units.sort((a, b) => order[a.status] - order[b.status]);
}
