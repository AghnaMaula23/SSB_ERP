import { apiRequest } from '../../../../services/api.js';
import { todayIso } from '../utils/projectFormat.js';

// ============================================================
// Pekerja per tahapan — API modul Pekerja (backlog E26,
// docs/skema-tenaga-kerja-harian.md):
//   /api/workers             master pekerja GLOBAL (identitas, ditulis sekali)
//   /api/worker-assignments  penugasan per tahapan (jenis, peran, upah, periode)
// Status active/standby/off_duty sudah tidak ada: "masih bertugas" dibaca dari
// startDate/endDate, dan "Keluarkan" = isi endDate, bukan hapus.
// ============================================================

export const WORKER_TYPES = {
  contract: { label: 'Kontrak', hint: 'Disewa selama tahapan berlangsung, dibayar harian' },
  daily: { label: 'Harian', hint: 'Hadir ketika dipanggil, dibayar harian' },
};

export const WORKER_ROLES = ['Pelaksana Lapangan', 'Mandor', 'Operator Excavator', 'Operator Dozer', 'Sopir DT', 'Checker', 'Tukang Cor', 'Tukang Besi', 'Harian K3', 'Helper'];

/** Status turunan dari periode penugasan — bukan kolom di database. */
export const ASSIGNMENT_STATUS = {
  active: { label: 'Bertugas', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  upcoming: { label: 'Belum Mulai', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ended: { label: 'Selesai', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function assignmentStatus(row, today = todayIso()) {
  if (row.isActive) return 'active';
  return row.startDate && row.startDate > today ? 'upcoming' : 'ended';
}

const nullable = (value) => (String(value ?? '').trim() ? String(value).trim() : null);

/** Daftar penugasan satu tahapan → `{ data, summary }`. */
export async function listAssignments(subProjectId) {
  const result = await apiRequest(`/api/worker-assignments?subProjectId=${subProjectId}`);
  return { data: result?.data || [], summary: result?.summary || null };
}

export const getAssignment = (assignmentId) => apiRequest(`/api/worker-assignments/${assignmentId}`);

export const getWorker = (workerId) => apiRequest(`/api/workers/${workerId}`);

/** Seluruh master pekerja (dipakai dropdown "Pekerja Terdaftar"). */
export async function listAllWorkers() {
  const rows = [];
  let page = 1;
  let total;
  do {
    const result = await apiRequest(`/api/workers?page=${page}&limit=100`);
    rows.push(...(result.data || []));
    total = Number(result.total || 0);
    page += 1;
  } while (rows.length < total && page <= 50);
  return rows;
}

const workerPayload = (form) => ({
  fullName: form.fullName.trim(),
  idNumber: nullable(form.idNumber),
  phone: nullable(form.phone),
  joinedAt: nullable(form.joinedAt),
  defaultRole: nullable(form.defaultRole) ?? nullable(form.assignedRole),
});

const assignmentPayload = (form) => ({
  workerType: form.workerType,
  dailyWage: Number(form.dailyWage),
  startDate: form.startDate,
  endDate: nullable(form.endDate),
  assignedRole: nullable(form.assignedRole),
  notes: nullable(form.notes),
});

export const createWorker = (form) => apiRequest('/api/workers', { method: 'POST', body: JSON.stringify(workerPayload(form)) });

export const updateWorker = (workerId, form) => apiRequest(`/api/workers/${workerId}`, { method: 'PUT', body: JSON.stringify(workerPayload(form)) });

export const createAssignment = (subProjectId, projectWorkerId, form) => apiRequest('/api/worker-assignments', {
  method: 'POST',
  body: JSON.stringify({ subProjectId: Number(subProjectId), projectWorkerId: Number(projectWorkerId), ...assignmentPayload(form) }),
});

export const updateAssignment = (assignmentId, form) => apiRequest(`/api/worker-assignments/${assignmentId}`, {
  method: 'PUT',
  body: JSON.stringify(assignmentPayload(form)),
});

/** "Keluarkan" dari tahapan: isi tanggal selesai = hari ini. Riwayat log tetap utuh. */
export const endAssignment = (assignmentId, endDate = todayIso()) => apiRequest(`/api/worker-assignments/${assignmentId}`, {
  method: 'PUT',
  body: JSON.stringify({ endDate }),
});

/** Hapus penugasan yang salah input. Backend menolak (409) kalau sudah ada log harian. */
export const deleteAssignment = (assignmentId) => apiRequest(`/api/worker-assignments/${assignmentId}`, { method: 'DELETE' });

// ---------------- Log tenaga kerja harian (P1–P10) ----------------

/** Daftar berhalaman + `summary` seluruh periode. `claim` terisi = log terkunci di klaim aktif (L6). */
export const listLaborLogs = (subProjectId, { page = 1, limit = 20, startDate, endDate } = {}) => {
  const params = new URLSearchParams({ subProjectId: String(subProjectId), page: String(page), limit: String(limit) });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return apiRequest(`/api/labor-logs?${params}`);
};

export const getLaborLog = (logId) => apiRequest(`/api/labor-logs/${logId}`);

/** Penugasan yang berlaku pada satu tanggal — isi awal form log. */
export async function listAssignmentsOn(subProjectId, date) {
  const result = await apiRequest(`/api/worker-assignments?subProjectId=${subProjectId}&activeOn=${date}`);
  return result?.data || [];
}

export const createLaborLog = (subProjectId, workDate, notes, items) => apiRequest('/api/labor-logs', {
  method: 'POST',
  body: JSON.stringify({ subProjectId: Number(subProjectId), workDate, notes: nullable(notes), items }),
});

/** Simpan ulang selalu mengirim daftar LENGKAP. Tanggal tidak bisa diubah. */
export const updateLaborLog = (logId, notes, items) => apiRequest(`/api/labor-logs/${logId}`, {
  method: 'PUT',
  body: JSON.stringify({ notes: nullable(notes), items }),
});

export const deleteLaborLog = (logId) => apiRequest(`/api/labor-logs/${logId}`, { method: 'DELETE' });

/** Pekerja sekali-datang (P6): cukup nama, tanpa keluar dari form log. */
export const quickCreateWorker = (fullName) => apiRequest('/api/workers', { method: 'POST', body: JSON.stringify({ fullName: fullName.trim() }) });
