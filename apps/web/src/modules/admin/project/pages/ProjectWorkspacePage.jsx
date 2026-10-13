import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import ProjectTree from '../components/ProjectTree.jsx';
import { EmptyPanel, LoadingPanel } from '../components/ProjectUi.jsx';
import ProjectListView from './ProjectListView.jsx';
import ProjectOverview from './ProjectOverview.jsx';
import ProjectFormPage from './ProjectFormPage.jsx';
import SubProjectFormPage from './SubProjectFormPage.jsx';
import SubProjectVolumePage from './SubProjectVolumePage.jsx';
import SubProjectEquipmentPage from './SubProjectEquipmentPage.jsx';
import ProgressFormPage from './ProgressFormPage.jsx';
import AllocationFormPage from './AllocationFormPage.jsx';
import TimesheetPage from './TimesheetPage.jsx';
import WorkhourFormPage from './WorkhourFormPage.jsx';
import EquipmentPoolPage from './EquipmentPoolPage.jsx';
import PoolItemFormPage from './PoolItemFormPage.jsx';
import InventoryPage from './InventoryPage.jsx';
import InventoryFormPage from './InventoryFormPage.jsx';
import InventoryMovementPage from './InventoryMovementPage.jsx';
import WorkersPage from './WorkersPage.jsx';
import WorkerFormPage from './WorkerFormPage.jsx';
import { getProject, listProjects, listSubProjects } from '../services/projectService.js';
import { hasPermission } from '../../../../services/permissions.js';
import { parseProjectRoute } from '../utils/projectRoute.js';
import { formatDate, subProjectTypeLabel } from '../utils/projectFormat.js';

const FINAL_STATUSES = ['completed', 'cancelled'];

function NoAccess({ children, backHref, backLabel }) {
  return (
    <EmptyPanel icon="🔒" title="Tidak bisa dibuka" action={<a href={backHref} className="btn btn-secondary text-xs">{backLabel}</a>}>
      {children}
    </EmptyPanel>
  );
}

/**
 * Satu instance untuk seluruh rute admin/projects/*. Dashboard tidak punya
 * panel samping — project dipilih dulu di sana, baru panelnya menampilkan
 * isi project tersebut.
 */
export default function ProjectWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseProjectRoute(route) || { projectId: null, projectPage: null, subProjectId: null, subPage: null, form: null, recordId: null, poolId: null };
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Project di luar halaman pertama daftar (atau baru dibuka lewat tautan).
  const [extraProject, setExtraProject] = useState({ id: null, project: null, missing: false });
  const [stagesByProject, setStagesByProject] = useState({});
  // Cermin state untuk dibaca di dalam callback tanpa menjadikannya dependensi.
  const stagesRef = useRef(stagesByProject);
  useEffect(() => { stagesRef.current = stagesByProject; }, [stagesByProject]);

  const permissions = {
    createProject: hasPermission('project:create'),
    updateProject: hasPermission('project:update'),
    createSubProject: hasPermission('sub-project:create'),
    updateSubProject: hasPermission('sub-project:update'),
    validateProgress: hasPermission('progress:validate'),
    createProgress: hasPermission('progress:create'),
    createPool: hasPermission('equipment-pool:create'),
    updatePool: hasPermission('equipment-pool:update'),
    createAllocation: hasPermission('allocation:create'),
    updateAllocation: hasPermission('allocation:update'),
    receiveAllocation: hasPermission('allocation:receive'),
    createWorkhour: hasPermission('workhour:create'),
  };

  // Pesan sukses yang dibawa ke halaman tujuan setelah form disimpan.
  const [flash, setFlash] = useState({ route: '', text: '' });
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const goWithNotice = (target, text) => {
    setFlash({ route: target, text });
    onNavigate(target);
  };

  useEffect(() => {
    let cancelled = false;
    listProjects({ limit: 100 })
      .then((result) => { if (!cancelled) setProjects(result.data || []); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadStages = useCallback(async (projectId, { force = false } = {}) => {
    const existing = stagesRef.current[projectId];
    if (existing && !force && (existing.loading || !existing.error)) return existing.data || null;
    setStagesByProject((current) => ({ ...current, [projectId]: { ...(current[projectId] || {}), loading: !current[projectId]?.data, error: '' } }));
    try {
      const result = await listSubProjects(projectId);
      const data = result.data || [];
      setStagesByProject((current) => ({ ...current, [projectId]: { data, summary: result.summary, loading: false, error: '' } }));
      return data;
    } catch (error) {
      setStagesByProject((current) => ({ ...current, [projectId]: { data: current[projectId]?.data || [], loading: false, error: error.message } }));
      return null;
    }
  }, []);

  // Tahapan project yang sedang dibuka selalu dimuat (dibutuhkan panel & overview).
  useEffect(() => {
    if (selection.projectId) loadStages(selection.projectId);
  }, [loadStages, selection.projectId]);

  const listedProject = projects.find((project) => project.id === selection.projectId);

  // Fallback: project tidak ada di daftar (lebih dari 100 project, atau tautan langsung).
  useEffect(() => {
    if (!selection.projectId || loading || listedProject || extraProject.id === selection.projectId) return;
    let cancelled = false;
    setExtraProject({ id: selection.projectId, project: null, missing: false });
    getProject(selection.projectId)
      .then((project) => { if (!cancelled) setExtraProject({ id: selection.projectId, project, missing: false }); })
      .catch(() => { if (!cancelled) setExtraProject({ id: selection.projectId, project: null, missing: true }); });
    return () => { cancelled = true; };
  }, [extraProject.id, listedProject, loading, selection.projectId]);

  const project = listedProject || (extraProject.id === selection.projectId ? extraProject.project : null);
  const stagesEntry = selection.projectId ? stagesByProject[selection.projectId] : null;
  const stage = stagesEntry?.data?.find((row) => row.id === selection.subProjectId);

  const upsertProject = (saved) => {
    setProjects((current) => {
      const exists = current.some((row) => row.id === saved.id);
      // Respons PUT tidak menyertakan subProjectCount — pertahankan nilai lama.
      return exists
        ? current.map((row) => (row.id === saved.id ? { ...row, ...saved, subProjectCount: saved.subProjectCount ?? row.subProjectCount } : row))
        : [{ ...saved, subProjectCount: 0 }, ...current];
    });
    if (extraProject.id === saved.id) setExtraProject((current) => ({ ...current, project: saved }));
  };

  const replaceStage = (updatedStage) => {
    const key = updatedStage.constructionProjectId ?? selection.projectId;
    setStagesByProject((current) => {
      const entry = current[key];
      if (!entry) return current;
      return { ...current, [key]: { ...entry, data: entry.data.map((row) => (row.id === updatedStage.id ? { ...row, ...updatedStage } : row)) } };
    });
  };

  const handleStageCreated = async (saved) => {
    const stages = await loadStages(project.id, { force: true });
    if (stages) {
      setProjects((current) => current.map((row) => (row.id === project.id ? { ...row, subProjectCount: stages.length } : row)));
    }
    onNavigate(`admin/projects/${project.id}/sub/${saved.id}/volume`);
  };

  const projectHref = project ? `#/admin/projects/${project.id}` : '#/admin/projects';

  const renderContent = () => {
    if (selection.form === 'project-new') {
      if (!permissions.createProject) return <NoAccess backHref="#/admin/projects" backLabel="← Kembali ke dashboard">Anda tidak memiliki izin membuat project.</NoAccess>;
      return (
        <ProjectFormPage
          key={route}
          onCancel={() => onNavigate('admin/projects')}
          onSaved={(saved) => { upsertProject(saved); onNavigate(`admin/projects/${saved.id}`); }}
        />
      );
    }

    if (!selection.projectId) {
      return <ProjectListView projects={projects} loading={loading} error={loadError} canCreate={permissions.createProject} onCreate={() => onNavigate('admin/projects/new')} />;
    }
    if (!project) {
      if (loading || !(extraProject.id === selection.projectId && extraProject.missing)) return <LoadingPanel>Memuat project...</LoadingPanel>;
      return (
        <EmptyPanel icon="🔎" title="Project tidak ditemukan" action={<a href="#/admin/projects" className="btn btn-secondary text-xs">← Kembali ke dashboard</a>}>
          Project ini mungkin tidak ada atau Anda tidak punya akses. Pilih project lain dari dashboard.
        </EmptyPanel>
      );
    }

    if (selection.form === 'project-edit') {
      if (!permissions.updateProject || FINAL_STATUSES.includes(project.status)) {
        return <NoAccess backHref={projectHref} backLabel="← Kembali ke project">{permissions.updateProject ? `Project berstatus "${project.status}" tidak bisa diubah lagi.` : 'Anda tidak memiliki izin mengubah project.'}</NoAccess>;
      }
      return (
        <ProjectFormPage
          key={route}
          project={project}
          contractSummary={stagesEntry?.summary}
          onCancel={() => onNavigate(`admin/projects/${project.id}`)}
          onSaved={(saved) => { upsertProject(saved); onNavigate(`admin/projects/${saved.id}`); }}
        />
      );
    }

    if (selection.projectPage === 'pool') {
      if (selection.form === 'pool-item-new') {
        if (!permissions.updatePool) return <NoAccess backHref={`#/admin/projects/${project.id}/pool`} backLabel="← Kembali">Mengubah equipment pool milik Divisi Alat (equipment-pool:update).</NoAccess>;
        return (
          <PoolItemFormPage
            key={route}
            project={project}
            poolId={selection.poolId}
            onCancel={() => onNavigate(`admin/projects/${project.id}/pool`)}
            onSaved={(saved) => goWithNotice(`admin/projects/${project.id}/pool`, `${saved.equipmentType?.typeName || 'Item'} ditambahkan ke pool.`)}
          />
        );
      }
      return <EquipmentPoolPage key={route} project={project} permissions={permissions} initialNotice={flashFor(route)} />;
    }

    if (selection.projectPage === 'overview') {
      return (
        <ProjectOverview
          key={project.id}
          project={project}
          stagesEntry={stagesEntry}
          permissions={permissions}
          onProjectChanged={upsertProject}
          onReloadStages={() => loadStages(project.id, { force: true })}
          onEditProject={() => onNavigate(`admin/projects/${project.id}/edit`)}
          onCreateSubProject={() => onNavigate(`admin/projects/${project.id}/sub/new`)}
          onEditSubProject={(row) => onNavigate(`admin/projects/${project.id}/sub/${row.id}/edit`)}
        />
      );
    }

    if (!stagesEntry || stagesEntry.loading) return <LoadingPanel>Memuat tahapan...</LoadingPanel>;

    if (selection.form === 'sub-new') {
      const usedTypes = stagesEntry.data.map((row) => row.subProjectType);
      if (!permissions.createSubProject || FINAL_STATUSES.includes(project.status) || usedTypes.length >= 4) {
        const reason = !permissions.createSubProject
          ? 'Anda tidak memiliki izin menambah sub-project.'
          : FINAL_STATUSES.includes(project.status)
            ? `Project berstatus "${project.status}" tidak bisa ditambah tahapan baru.`
            : 'Keempat jenis tahapan sudah dibuat untuk project ini.';
        return <NoAccess backHref={projectHref} backLabel="← Kembali ke project">{reason}</NoAccess>;
      }
      return (
        <SubProjectFormPage
          key={route}
          project={project}
          usedTypes={usedTypes}
          onCancel={() => onNavigate(`admin/projects/${project.id}`)}
          onSaved={handleStageCreated}
        />
      );
    }

    if (!stage) {
      return (
        <EmptyPanel icon="🔎" title="Sub-project tidak ditemukan" action={<a href={projectHref} className="btn btn-secondary text-xs">← Kembali ke project</a>}>
          {stagesEntry.error || 'Tahapan ini bukan milik project yang dipilih.'}
        </EmptyPanel>
      );
    }

    const stageBase = `admin/projects/${project.id}/sub/${stage.id}`;
    const backTo = (page) => () => onNavigate(`${stageBase}/${page}`);

    switch (selection.form) {
      case 'sub-edit':
        if (!permissions.updateSubProject || FINAL_STATUSES.includes(stage.status)) {
          return <NoAccess backHref={projectHref} backLabel="← Kembali ke project">{permissions.updateSubProject ? `Tahapan berstatus "${stage.status}" dan kontraknya tidak bisa diubah lagi.` : 'Anda tidak memiliki izin mengubah sub-project.'}</NoAccess>;
        }
        return (
          <SubProjectFormPage
            key={route}
            project={project}
            subProject={stage}
            onCancel={() => onNavigate(`admin/projects/${project.id}`)}
            onSaved={(saved) => { replaceStage(saved); onNavigate(`admin/projects/${project.id}`); }}
          />
        );
      case 'progress-new':
      case 'progress-edit':
        if (!permissions.createProgress) return <NoAccess backHref={`#/${stageBase}/volume`} backLabel="← Kembali">Pencatatan progress harian milik role Lapangan (progress:create).</NoAccess>;
        return (
          <ProgressFormPage
            key={route}
            project={project}
            stage={stage}
            logId={selection.recordId}
            onCancel={backTo('volume')}
            onSaved={(saved) => {
              if (saved.subProjectProgress) replaceStage({ ...stage, progress: saved.subProjectProgress });
              else loadStages(project.id, { force: true });
              goWithNotice(`${stageBase}/volume`, `Progress ${formatDate(saved.progressDate)} tersimpan dan menunggu validasi Admin.`);
            }}
          />
        );
      case 'allocation-new':
        if (!permissions.createAllocation) return <NoAccess backHref={`#/${stageBase}/alat`} backLabel="← Kembali">Alokasi alat milik Divisi Alat (allocation:create).</NoAccess>;
        return (
          <AllocationFormPage
            key={route}
            project={project}
            stage={stage}
            onCancel={backTo('alat')}
            onSaved={(saved) => goWithNotice(`${stageBase}/alat`, `${saved.equipmentItem?.assetCode || 'Unit'} dialokasikan ke ${subProjectTypeLabel(stage.subProjectType)}.`)}
          />
        );
      case 'workhour-new':
        if (!permissions.createWorkhour) return <NoAccess backHref={`#/${stageBase}/timesheet`} backLabel="← Kembali">Pencatatan jam kerja milik Lapangan / Divisi Alat (workhour:create).</NoAccess>;
        return (
          <WorkhourFormPage
            key={route}
            project={project}
            stage={stage}
            onCancel={backTo('timesheet')}
            onSaved={(saved) => goWithNotice(`${stageBase}/timesheet`, `${saved.totalWorkhour} jam kerja ${saved.equipmentItem?.assetCode || ''} tanggal ${formatDate(saved.workDate)} tersimpan.`)}
          />
        );
      case 'inventory-new':
        return <InventoryFormPage key={route} project={project} stage={stage} onCancel={backTo('inventory')} onSaved={(saved) => goWithNotice(`${stageBase}/inventory`, `${saved.itemName} ditambahkan ke inventory.`)} />;
      case 'inventory-movement':
        return <InventoryMovementPage key={route} project={project} stage={stage} itemId={selection.recordId} onCancel={backTo('inventory')} onSaved={(saved) => goWithNotice(`${stageBase}/inventory`, `Mutasi ${saved.itemName} tersimpan. Stok kini ${saved.stock} ${saved.unit}.`)} />;
      case 'worker-new':
      case 'worker-edit':
        return <WorkerFormPage key={route} project={project} stage={stage} workerId={selection.recordId} onCancel={backTo('pekerja')} onSaved={(saved) => goWithNotice(`${stageBase}/pekerja`, `Data ${saved.fullName} tersimpan.`)} />;
      default:
        break;
    }

    switch (selection.subPage) {
      case 'alat':
        return <SubProjectEquipmentPage key={route} project={project} stage={stage} permissions={permissions} initialNotice={flashFor(route)} />;
      case 'timesheet':
        return <TimesheetPage key={route} project={project} stage={stage} canRecord={permissions.createWorkhour} initialNotice={flashFor(route)} />;
      case 'inventory':
        return <InventoryPage key={route} project={project} stage={stage} initialNotice={flashFor(route)} />;
      case 'pekerja':
        return <WorkersPage key={route} project={project} stage={stage} initialNotice={flashFor(route)} />;
      default:
        return (
          <SubProjectVolumePage
            key={route}
            project={project}
            stage={stage}
            canValidate={permissions.validateProgress}
            canRecord={permissions.createProgress}
            initialNotice={flashFor(route)}
            onStageChanged={replaceStage}
          />
        );
    }
  };

  return (
    <AdminLayout
      active="project"
      panelTitle="Navigasi project"
      onNavigate={onNavigate}
      onBackToModules={onBackToModules}
      onSignOut={onSignOut}
      panel={project && selection.projectId ? (
        <ProjectTree
          key={project.id}
          project={project}
          stagesEntry={stagesEntry}
          selection={selection}
          canCreateSubProject={permissions.createSubProject}
        />
      ) : null}
    >
      {renderContent()}
    </AdminLayout>
  );
}
