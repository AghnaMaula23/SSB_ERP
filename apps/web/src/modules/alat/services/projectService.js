import { apiRequest } from '../../../services/api.js';
import { subProjectTypeLabel } from '../../admin/project/utils/projectFormat.js';

/**
 * Project konstruksi aktif beserta tahapannya, untuk form klaim pendapatan.
 * Divisi Alat punya `project:read` & `sub-project:read`. Kalau API gagal,
 * errornya diteruskan ke layar — tidak ada lagi fallback ke project palsu (E9a).
 */
export async function getClaimableProjects() {
  const result = await apiRequest('/api/projects/construction?status=active&limit=100');
  const projects = result.data || [];
  return Promise.all(projects.map(async (project) => {
    const stages = await apiRequest(`/api/projects/construction/${project.id}/sub-projects`);
    return {
      id: project.id,
      name: project.projectName,
      clientName: project.clientName || '-',
      subProjects: (stages?.data || [])
        .filter((stage) => stage.status === 'active')
        .map((stage) => ({ id: stage.id, name: `${stage.sequenceOrder}. ${subProjectTypeLabel(stage.subProjectType)}${stage.contractNo ? ` · ${stage.contractNo}` : ''}` })),
    };
  }));
}
