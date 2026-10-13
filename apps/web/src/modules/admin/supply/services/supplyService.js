import { apiRequest } from '../../../../services/api.js';

// Header project supply eksternal. Bentuk response sama dengan construction
// project (shapeProject di backend): projectCode, projectName, clientName,
// location, contractNo, contractStartDate, contractEndDate, status.
const SUPPLY_API = '/api/projects/external-supply';

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

const payload = (form) => ({
  supplyProjectName: form.projectName.trim(),
  clientName: nullIfBlank(form.clientName),
  location: nullIfBlank(form.location),
  contractNo: nullIfBlank(form.contractNo),
  contractStartDate: nullIfBlank(form.contractStartDate),
  contractEndDate: nullIfBlank(form.contractEndDate),
});

export async function listSupplyProjects({ page = 1, limit = 100, status, search } = {}) {
  return apiRequest(`${SUPPLY_API}${query({ page, limit, status, search })}`);
}

export async function getSupplyProject(id) {
  return apiRequest(`${SUPPLY_API}/${id}`);
}

export async function createSupplyProject(form) {
  return apiRequest(SUPPLY_API, { method: 'POST', body: JSON.stringify(payload(form)) });
}

export async function updateSupplyProject(id, form) {
  return apiRequest(`${SUPPLY_API}/${id}`, { method: 'PUT', body: JSON.stringify(payload(form)) });
}

/** status: 'planned' | 'active' | 'completed' | 'cancelled'. */
export async function changeSupplyProjectStatus(id, status) {
  return apiRequest(`${SUPPLY_API}/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}
