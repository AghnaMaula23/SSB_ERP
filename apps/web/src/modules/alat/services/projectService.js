import { apiRequest } from '../../../services/api.js';

const DUMMY_PROJECTS = [
  {
    id: 'PRJ-001',
    name: 'Project Nickel Mining Morowali',
    clientName: 'PT Halmahera Utama',
    adminStatus: 'accepted',
    subProjects: [
      { id: 'SUB-001', name: 'Land Clearing Pit Alpha' },
      { id: 'SUB-002', name: 'Access Road South Block' },
    ],
  },
  {
    id: 'PRJ-002',
    name: 'Project Renovasi Gudang',
    clientName: 'PT Sinar Utara',
    adminStatus: 'accepted',
    subProjects: [{ id: 'SUB-003', name: 'Warehouse Maintenance' }],
  },
  {
    id: 'PRJ-003',
    name: 'Project Nickel Mining Morowali',
    clientName: 'PT Halmahera Utama',
    adminStatus: 'pending',
    subProjects: [{ id: 'SUB-004', name: 'Pending Validation Area' }],
  },
];

function normalizeProject(project) {
  return {
    ...project,
    id: project.id,
    name: project.name || project.projectName || project.project_name,
    clientName: project.clientName || project.client_name || '-',
    adminStatus: project.adminStatus || project.admin_status || project.status,
    subProjects: (project.subProjects || project.sub_projects || []).map((subProject, index) => ({ ...subProject, id: subProject.id || subProject.subProjectId || `SUB-${index + 1}`, name: subProject.name || subProject.subProjectName || `Activity ${index + 1}` })),
  };
}

export async function getClaimableProjects() {
  try {
    const result = await apiRequest('/api/projects?status=accepted&limit=100');
    const projects = (result.data || []).map(normalizeProject).filter((project) => project.adminStatus === 'accepted');
    if (projects.length) return projects;
  } catch (error) {
    if (error?.status === 401) throw error;
    // Project endpoint belum tersedia; gunakan dummy accepted projects.
  }
  return DUMMY_PROJECTS.filter((project) => project.adminStatus === 'accepted').map(normalizeProject);
}
