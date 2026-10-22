// Kode proyek untuk folder diambil dari ketiga jenis project di API
// (ditambah kontrak contoh Supply & Rental), dinormalisasi ke satu bentuk.

import { listProjects } from '../../project/services/projectService.js';
import { listRentalProjects } from '../../rental/services/rentalService.js';
import { listDemoRentalProjects } from '../../rental/services/rentalDemoService.js';
import { listSupplyProjects } from '../../supply/services/supplyService.js';
import { listDemoSupplyProjects } from '../../supply/services/demoSupplyService.js';

const normalize = (kind) => (row) => ({
  key: `${kind}:${row.id}`,
  kind,
  id: row.id,
  projectCode: row.projectCode,
  projectName: row.projectName,
  clientName: row.clientName,
  status: row.status,
  year: Number(String(row.startDate || row.contractStartDate || row.createdAt || '').slice(0, 4)) || new Date().getFullYear(),
  isDemo: Boolean(row.isDemo),
});

/** Balikan { projects, errors } — sumber yang gagal tidak menggagalkan yang lain. */
export async function listProjectSources() {
  const sources = [
    ['construction', () => listProjects({ limit: 100 }).then((result) => result.data || [])],
    ['rental', () => listRentalProjects({ limit: 100 }).then((result) => result.data || [])],
    ['rental', listDemoRentalProjects],
    ['supply', () => listSupplyProjects({ limit: 100 }).then((result) => result.data || [])],
    ['supply', listDemoSupplyProjects],
  ];
  const results = await Promise.allSettled(sources.map(([, load]) => load()));
  const projects = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') projects.push(...result.value.map(normalize(sources[index][0])));
    else errors.push(result.reason?.message);
  });
  return { projects: projects.filter((row) => row.status !== 'cancelled'), errors: [...new Set(errors.filter(Boolean))] };
}
