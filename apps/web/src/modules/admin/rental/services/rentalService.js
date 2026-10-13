import { apiRequest } from '../../../../services/api.js';
import { getPool } from '../../project/services/projectService.js';
import { buildUnitNotes } from '../utils/rentalFormat.js';

const RENTAL_API = '/api/projects/external-rental';

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
};

const nullIfBlank = (value) => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

// ============================================================
// KONTRAK RENTAL — header external_rental_projects
// ============================================================

const projectPayload = (form) => ({
  rentalProjectName: form.projectName.trim(),
  clientName: nullIfBlank(form.clientName),
  location: nullIfBlank(form.location),
  contractNo: nullIfBlank(form.contractNo),
  contractStartDate: nullIfBlank(form.contractStartDate),
  contractEndDate: nullIfBlank(form.contractEndDate),
  billingMethod: nullIfBlank(form.billingMethod),
});

export async function listRentalProjects({ page = 1, limit = 100, status, search } = {}) {
  return apiRequest(`${RENTAL_API}${query({ page, limit, status, search })}`);
}

export async function getRentalProject(id) {
  return apiRequest(`${RENTAL_API}/${id}`);
}

export async function createRentalProject(form) {
  return apiRequest(RENTAL_API, { method: 'POST', body: JSON.stringify(projectPayload(form)) });
}

export async function updateRentalProject(id, form) {
  return apiRequest(`${RENTAL_API}/${id}`, { method: 'PUT', body: JSON.stringify(projectPayload(form)) });
}

export async function changeRentalProjectStatus(id, status) {
  return apiRequest(`${RENTAL_API}/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

// ============================================================
// UNIT — Request Alat external_rental + pool item hasil approval
// ============================================================

/**
 * "Unit Baru" = Request Alat external_rental. Admin pembuatnya, jadi request
 * langsung masuk antrean Divisi Alat (equipment_review). Operator, paket, dan
 * preferensi merek/model belum punya kolom di backend — dititipkan sebagai
 * teks terstruktur di requestNotes/itemNotes (lihat buildUnitNotes).
 */
export async function createRentalUnitRequest(projectId, form) {
  const notes = buildUnitNotes(form);
  return apiRequest('/api/request-alat', {
    method: 'POST',
    body: JSON.stringify({
      requestType: 'external_rental',
      externalRentalProjectId: Number(projectId),
      neededDate: nullIfBlank(form.periodStart),
      locationDetail: nullIfBlank(form.locationDetail),
      requestNotes: notes,
      items: [{
        equipmentTypeId: Number(form.equipmentTypeId),
        requestedQuantity: Number(form.quantity || 1),
        estimatedWorkhours: form.estimatedWorkhours === '' ? null : Number(form.estimatedWorkhours),
        itemNotes: notes,
      }],
    }),
  });
}

export async function cancelRentalUnitRequest(requestId) {
  return apiRequest(`/api/request-alat/${requestId}/cancel`, { method: 'PUT' });
}

/** Semua request + pool (beserta item) milik satu kontrak rental. */
export async function loadRentalUnits(projectId) {
  const [requests, pools] = await Promise.all([
    apiRequest(`/api/request-alat${query({ requestType: 'external_rental', externalRentalProjectId: projectId, limit: 100 })}`),
    apiRequest(`/api/projects/equipment-pools${query({ ownerType: 'external_rental_project', externalRentalProjectId: projectId, limit: 100 })}`),
  ]);
  // Detail request dibutuhkan untuk jenis alat & kaitan request item → pool item.
  const [requestDetails, poolDetails] = await Promise.all([
    Promise.all((requests.data || []).map((row) => apiRequest(`/api/request-alat/${row.id}`))),
    Promise.all((pools.data || []).map((pool) => getPool(pool.id))),
  ]);
  return { requests: requestDetails, pools: poolDetails };
}

// ============================================================
// TIMESHEET — jam kerja sourceType external_rental
// ============================================================

/** Jam kerja satu unit fisik, disaring ke pool item kontrak ini oleh pemanggil. */
export async function listRentalWorkhours(equipmentItemId, { startDate, endDate } = {}) {
  return apiRequest(`/api/equipment/items/${equipmentItemId}/workhour-logs${query({ sourceType: 'external_rental', startDate, endDate, limit: 100 })}`);
}

/** Satu sesi kerja (pagi/siang/overtime) = satu workhour log. */
export async function createRentalWorkhour(poolItemId, session) {
  return apiRequest('/api/equipment/workhour-logs', {
    method: 'POST',
    body: JSON.stringify({
      sourceType: 'external_rental',
      equipmentPoolItemId: Number(poolItemId),
      workDate: session.workDate,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      pausedDurationMinutes: 0,
      totalWorkhour: session.totalWorkhour,
      description: nullIfBlank(session.description),
    }),
  });
}
