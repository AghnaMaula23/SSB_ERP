import { apiRequest } from '../../../../services/api.js';

// Modul Project Admin hanya memakai construction project. Rental dan Supply
// adalah tipe project terpisah di backend dan akan punya menu sendiri.
const PROJECT_API = '/api/projects/construction';

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

// Kosongkan string opsional jadi null supaya backend tidak menyimpan ''.
const nullIfBlank = (value) => {
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

// ============================================================
// PROJECT HEADER
// ============================================================

export async function listProjects({ page = 1, limit = 100, status, search } = {}) {
  return apiRequest(`${PROJECT_API}${query({ page, limit, status, search })}`);
}

export async function getProject(projectId) {
  return apiRequest(`${PROJECT_API}/${projectId}`);
}

export async function createProject(form) {
  return apiRequest(PROJECT_API, {
    method: 'POST',
    body: JSON.stringify({
      projectName: form.projectName.trim(),
      clientName: nullIfBlank(form.clientName),
      location: nullIfBlank(form.location),
      startDate: nullIfBlank(form.startDate),
      endDate: nullIfBlank(form.endDate),
    }),
  });
}

export async function updateProject(projectId, form) {
  return apiRequest(`${PROJECT_API}/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify({
      projectName: form.projectName.trim(),
      clientName: nullIfBlank(form.clientName),
      location: nullIfBlank(form.location),
      startDate: nullIfBlank(form.startDate),
      endDate: nullIfBlank(form.endDate),
    }),
  });
}

export async function changeProjectStatus(projectId, status) {
  return apiRequest(`${PROJECT_API}/${projectId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// SUB-PROJECT (tahapan)
// ============================================================

/** Balikan: `{ data: SubProject[], summary }` — progress tiap tahapan sudah ikut. */
export async function listSubProjects(projectId) {
  return apiRequest(`${PROJECT_API}/${projectId}/sub-projects`);
}

/** Detail tahapan beserta project induknya (untuk breadcrumb). */
export async function getSubProject(subProjectId) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}`);
}

const subProjectPayload = (form) => ({
  targetVolume: Number(form.targetVolume),
  volumeUnit: form.volumeUnit.trim(),
  dailyTargetVolume: form.dailyTargetVolume === '' ? null : Number(form.dailyTargetVolume),
  ...(form.contractValue !== '' && { contractValue: Number(form.contractValue) }),
  ...(form.sequenceOrder !== '' && form.sequenceOrder !== undefined && { sequenceOrder: Number(form.sequenceOrder) }),
  contractNo: nullIfBlank(form.contractNo),
  contractDate: nullIfBlank(form.contractDate),
  contractStartDate: nullIfBlank(form.contractStartDate),
  contractEndDate: nullIfBlank(form.contractEndDate),
});

export async function createSubProject(projectId, form) {
  return apiRequest(`${PROJECT_API}/${projectId}/sub-projects`, {
    method: 'POST',
    body: JSON.stringify({ subProjectType: form.subProjectType, ...subProjectPayload(form) }),
  });
}

export async function updateSubProject(projectId, subProjectId, form) {
  return apiRequest(`${PROJECT_API}/${projectId}/sub-projects/${subProjectId}`, {
    method: 'PUT',
    body: JSON.stringify(subProjectPayload(form)),
  });
}

/** Balikan menyertakan `sequenceWarning` saat tahapan diaktifkan di luar urutan. */
export async function changeSubProjectStatus(projectId, subProjectId, status) {
  return apiRequest(`${PROJECT_API}/${projectId}/sub-projects/${subProjectId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// PROGRESS HARIAN — Admin hanya membaca dan memvalidasi
// ============================================================

/**
 * Balikan: `{ data, total, page, limit, totalPages }`. Ringkasan volume yang
 * dihitung service tidak ikut terkirim (helper `paginated` hanya meneruskan
 * meta), jadi angka total diambil dari progress sub-project.
 */
export async function listProgressLogs(subProjectId, { page = 1, limit = 10, status, startDate, endDate } = {}) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/progress-logs${query({ page, limit, status, startDate, endDate })}`);
}

export async function getProgressLog(subProjectId, logId) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/progress-logs/${logId}`);
}

const fieldConditionPayload = (form) => {
  const condition = {
    weatherMorning: nullIfBlank(form.weatherMorning),
    weatherAfternoon: nullIfBlank(form.weatherAfternoon),
    fieldConditionNotes: nullIfBlank(form.fieldConditionNotes),
    incidentNotes: nullIfBlank(form.incidentNotes),
  };
  // Kondisi lapangan opsional — jangan buat baris kosong kalau tidak diisi.
  return Object.values(condition).some((value) => value !== null) ? condition : undefined;
};

/** Lapangan mencatat realisasi harian (permission progress:create). */
export async function createProgressLog(subProjectId, form) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/progress-logs`, {
    method: 'POST',
    body: JSON.stringify({
      progressDate: form.progressDate,
      realizedVolume: Number(form.realizedVolume),
      notes: nullIfBlank(form.notes),
      fieldCondition: fieldConditionPayload(form),
    }),
  });
}

/** Tanggal tidak bisa diubah; baris tervalidasi ditolak backend (409). */
export async function updateProgressLog(subProjectId, logId, form, { hadCondition = false } = {}) {
  const condition = fieldConditionPayload(form);
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/progress-logs/${logId}`, {
    method: 'PUT',
    body: JSON.stringify({
      realizedVolume: Number(form.realizedVolume),
      notes: nullIfBlank(form.notes),
      // Kalau sebelumnya ada kondisi lalu dikosongkan, kirim null-nya supaya ikut terhapus.
      fieldCondition: condition || (hadCondition ? {
        weatherMorning: null, weatherAfternoon: null, fieldConditionNotes: null, incidentNotes: null,
      } : undefined),
    }),
  });
}

/**
 * status: 'validated' | 'rejected' | 'submitted' (mencabut validasi).
 * Alasan penolakan belum bisa dikirim — backend menolak `notes` sampai
 * Approval Center tersedia.
 */
export async function setProgressValidation(subProjectId, logId, status) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/progress-logs/${logId}/validate`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// ALOKASI ALAT — Admin hanya membaca (allocation:read)
// ============================================================

export async function listAllocations(subProjectId, { status } = {}) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/allocations${query({ status })}`);
}

/** Divisi Alat mengalokasikan pool item `available` ke tahapan aktif. */
export async function createAllocation(subProjectId, equipmentPoolItemId) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/allocations`, {
    method: 'POST',
    body: JSON.stringify({ equipmentPoolItemId: Number(equipmentPoolItemId) }),
  });
}

/** Lapangan mengonfirmasi unit sudah sampai di lokasi (allocation:receive). */
export async function receiveAllocation(subProjectId, allocationId) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/allocations/${allocationId}/receive`, { method: 'PUT' });
}

/** status: 'completed' | 'returned' | 'cancelled' — pool item kembali `available`. */
export async function changeAllocationStatus(subProjectId, allocationId, status) {
  return apiRequest(`/api/projects/sub-projects/${subProjectId}/allocations/${allocationId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// EQUIPMENT POOL — wadah alat di level project
// ============================================================

export async function listProjectPools(projectId) {
  return apiRequest(`/api/projects/equipment-pools${query({ ownerType: 'construction_project', constructionProjectId: projectId, limit: 100 })}`);
}

/** Detail pool beserta `items`. */
export async function getPool(poolId) {
  return apiRequest(`/api/projects/equipment-pools/${poolId}`);
}

/** Semua pool project beserta item-nya — pool per project selalu sedikit. */
export async function listProjectPoolsWithItems(projectId) {
  const result = await listProjectPools(projectId);
  return Promise.all((result.data || []).map((pool) => getPool(pool.id)));
}

export async function createPool(projectId) {
  return apiRequest('/api/projects/equipment-pools', {
    method: 'POST',
    body: JSON.stringify({ ownerType: 'construction_project', constructionProjectId: Number(projectId) }),
  });
}

/** status: 'active' | 'closed' | 'cancelled'. */
export async function changePoolStatus(poolId, status) {
  return apiRequest(`/api/projects/equipment-pools/${poolId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function addPoolItem(poolId, form) {
  return apiRequest(`/api/projects/equipment-pools/${poolId}/items`, {
    method: 'POST',
    body: JSON.stringify({
      equipmentTypeId: Number(form.equipmentTypeId),
      equipmentItemId: form.equipmentItemId ? Number(form.equipmentItemId) : null,
      requestedQuantity: Number(form.requestedQuantity || 1),
    }),
  });
}

export async function bindPoolItemUnit(poolId, poolItemId, equipmentItemId) {
  return apiRequest(`/api/projects/equipment-pools/${poolId}/items/${poolItemId}/bind-unit`, {
    method: 'PUT',
    body: JSON.stringify({ equipmentItemId: Number(equipmentItemId) }),
  });
}

/** status: 'completed' | 'cancelled' — hanya untuk item `available`. */
export async function closePoolItem(poolId, poolItemId, status) {
  return apiRequest(`/api/projects/equipment-pools/${poolId}/items/${poolItemId}/close`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

// ============================================================
// TIMESHEET — jam kerja alat (API Divisi Alat)
// ============================================================

/** Jam kerja satu unit; balikan berhalaman `{ data, total, ... }`. */
export async function listItemWorkhours(equipmentItemId, { startDate, endDate, limit = 100 } = {}) {
  return apiRequest(`/api/equipment/items/${equipmentItemId}/workhour-logs${query({ sourceType: 'internal_project', startDate, endDate, limit })}`);
}

/**
 * Catat jam kerja lewat alokasi. Unit alat diturunkan backend dari alokasinya,
 * jadi equipmentItemId sengaja tidak dikirim.
 */
export async function createWorkhourLog(form) {
  const toIso = (time) => (time ? new Date(`${form.workDate}T${time}:00`).toISOString() : null);
  return apiRequest('/api/equipment/workhour-logs', {
    method: 'POST',
    body: JSON.stringify({
      sourceType: 'internal_project',
      subProjectEquipmentAllocationId: Number(form.allocationId),
      workDate: form.workDate,
      startedAt: toIso(form.startTime),
      stoppedAt: toIso(form.stopTime),
      pausedDurationMinutes: Number(form.pausedDurationMinutes || 0),
      totalWorkhour: Number(form.totalWorkhour),
      description: nullIfBlank(form.description),
    }),
  });
}
