import { apiRequest } from '../../../../services/api.js';

// ============================================================
// Berkas project — /api/project-files (keputusan lampiran L8, Swagger tag
// Project Files). Menggantikan fileStore.js (localStorage + IndexedDB).
//   - Folder tahapan & folder sistem tidak disimpan; dibaca dari direktori.
//   - Hapus berkas = sampah 30 hari, bisa dipulihkan ke folder asal.
//   - Folder hanya bisa dihapus kalau kosong, termasuk sampahnya.
//   - Unduh lewat GET /api/files/:id/url (URL bertanda tangan, singkat).
// ============================================================

const BASE = '/api/project-files';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.dwg,.xlsx,.docx';
export const TRASH_DAYS = 30;

/** Semua project yang bisa dibuka user → baris ringkas + statistik berkas. */
export async function listFileProjects() {
  return (await apiRequest(`${BASE}/projects`)) || [];
}

/** `{ project, folders, stages: [{ subProjectId, subProjectType, status, folders }] }` */
export const getDirectory = (type, projectId) => apiRequest(`${BASE}/projects/${type}/${projectId}`);

/** Semua folder (project + tahapan) dalam satu daftar datar, masing-masing tahu tahapannya. */
export function flattenFolders(directory) {
  if (!directory) return [];
  return [
    ...(directory.folders || []).map((folder) => ({ ...folder, stage: null })),
    ...(directory.stages || []).flatMap((stage) => (stage.folders || []).map((folder) => ({ ...folder, stage }))),
  ];
}

async function fetchAllPages(path, params = {}) {
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const query = new URLSearchParams({ ...params, page: String(page), limit: '100' });
    const result = await apiRequest(`${path}?${query}`);
    rows.push(...(result.data || []));
    if (rows.length >= Number(result.total || 0) || !(result.data || []).length) break;
  }
  return rows;
}

export const listFolderFiles = (folderId) => fetchAllPages(`${BASE}/folders/${folderId}/files`);

export const listTrash = (type, projectId) => fetchAllPages(`${BASE}/projects/${type}/${projectId}/trash`);

export const listSystemFolder = (type, projectId, key, subProjectId) =>
  fetchAllPages(`${BASE}/projects/${type}/${projectId}/system-folders/${key}`, subProjectId ? { subProjectId: String(subProjectId) } : {});

export const createFolder = (type, projectId, { name, subProjectId }) => apiRequest(`${BASE}/projects/${type}/${projectId}/folders`, {
  method: 'POST',
  body: JSON.stringify({ name: name.trim(), ...(subProjectId ? { subProjectId: Number(subProjectId) } : {}) }),
});

export const renameFolder = (folderId, name) => apiRequest(`${BASE}/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });

export const deleteFolder = (folderId) => apiRequest(`${BASE}/folders/${folderId}`, { method: 'DELETE' });

/** Form + berkas dalam SATU multipart (L4). */
export function uploadFile(folderId, { name, description }, blob) {
  const body = new FormData();
  body.append('file', blob);
  body.append('name', name.trim());
  if (description?.trim()) body.append('description', description.trim());
  return apiRequest(`${BASE}/folders/${folderId}/files`, { method: 'POST', body });
}

export const getProjectFile = (projectFileId) => apiRequest(`${BASE}/files/${projectFileId}`);

/** Ubah nama/deskripsi, atau pindah folder dalam project yang sama. */
export const updateProjectFile = (projectFileId, changes) => apiRequest(`${BASE}/files/${projectFileId}`, { method: 'PATCH', body: JSON.stringify(changes) });

export const trashFile = (projectFileId) => apiRequest(`${BASE}/files/${projectFileId}`, { method: 'DELETE' });

export const restoreFile = (projectFileId) => apiRequest(`${BASE}/files/${projectFileId}/restore`, { method: 'POST' });

/** URL bertanda tangan untuk membuka/mengunduh — `files.id`, bukan id berkas project. */
export async function getDownloadUrl(fileId) {
  return (await apiRequest(`/api/files/${fileId}/url`)).url;
}

/**
 * Buka berkas di tab baru. Tab dibuka dulu (masih di dalam klik) agar tidak
 * diblokir popup, baru diarahkan setelah URL-nya didapat.
 */
export async function openFileInNewTab(fileId) {
  const tab = window.open('', '_blank');
  try {
    const url = await getDownloadUrl(fileId);
    if (tab) { tab.opener = null; tab.location.href = url; } else { window.location.assign(url); }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
