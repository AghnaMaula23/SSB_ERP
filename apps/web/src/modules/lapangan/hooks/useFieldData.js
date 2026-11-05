import { useCallback, useEffect, useState } from 'react';
import { listProjects, listSubProjects } from '../../admin/project/services/projectService.js';
import { subProjectTypeLabel } from '../../admin/project/utils/projectFormat.js';

/** Muat satu sumber data: `{ data, error, reload }`. `key` berubah = muat ulang. */
export function useRecord(load, key) {
  const [state, setState] = useState({ data: null, error: '' });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => { if (!cancelled) setState({ data, error: '' }); })
      .catch((error) => { if (!cancelled) setState((current) => ({ data: current.data, error: error.message })); });
    return () => { cancelled = true; };
    // `load` selalu closure baru; yang menentukan muat ulang hanya `key` & reloadKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey]);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  return { ...state, reload };
}

/**
 * Tahapan aktif seluruh project untuk pilihan form. Pengajuan, log, dan laporan
 * hanya diterima untuk tahapan yang sedang berjalan, jadi yang lain tidak ditawarkan.
 */
export function useActiveStages() {
  const { data, error } = useRecord(async () => {
    const projects = await listProjects({ limit: 100 });
    const open = (projects.data || []).filter((project) => !['completed', 'cancelled'].includes(project.status));
    const lists = await Promise.all(open.map((project) => listSubProjects(project.id).then((result) => (result.data || []).map((stage) => ({
      id: stage.id,
      label: `${project.projectName} · ${subProjectTypeLabel(stage.subProjectType)}`,
      status: stage.status,
    })))));
    return lists.flat().filter((stage) => stage.status === 'active');
  }, 'stages');
  return { stages: data, error };
}
