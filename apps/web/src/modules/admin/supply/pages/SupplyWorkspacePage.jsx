import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { EmptyPanel, LoadingPanel } from '../../project/components/ProjectUi.jsx';
import SupplyProjectPickerPage from './SupplyProjectPickerPage.jsx';
import SupplyProjectFormPage from './SupplyProjectFormPage.jsx';
import SupplyDetailPage from './SupplyDetailPage.jsx';
import DeliveryFormPage from './DeliveryFormPage.jsx';
import { createSupplyProject, getSupplyProject, listSupplyProjects, updateSupplyProject } from '../services/supplyService.js';
import { isDemoId, listDemoSupplyProjects, updateDemoSupplyProject } from '../services/demoSupplyService.js';
import { hasPermission } from '../../../../services/permissions.js';
import { parseSupplyRoute } from '../utils/supplyRoute.js';

function BackPanel({ icon = '🔒', title, children, href = '#/admin/supply' }) {
  return <EmptyPanel icon={icon} title={title} action={<a href={href} className="btn btn-secondary text-xs">← Kembali</a>}>{children}</EmptyPanel>;
}

/**
 * Menu Supply Divisi Admin. Tanpa panel samping: kontrak dipilih di halaman
 * awal, lalu bisa diganti dari pemilih di atas halaman detail.
 */
export default function SupplyWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseSupplyRoute(route) || { projectId: null, form: null, deliveryId: null };
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [extra, setExtra] = useState({ id: null, project: null, missing: false });
  const [flash, setFlash] = useState({ route: '', text: '' });

  const permissions = {
    createProject: hasPermission('project:create'),
    updateProject: hasPermission('project:update'),
  };

  useEffect(() => {
    let cancelled = false;
    // Kontrak asli dari API, ditambah kontrak contoh di belakangnya. Kalau API
    // gagal, kontrak contoh tetap tampil supaya halaman tetap bisa dicoba.
    Promise.allSettled([listSupplyProjects({ limit: 100 }), listDemoSupplyProjects()])
      .then(([apiResult, demoResult]) => {
        if (cancelled) return;
        if (apiResult.status === 'rejected') setLoadError(apiResult.reason?.message || 'Kontrak supply gagal dimuat.');
        setProjects([
          ...(apiResult.status === 'fulfilled' ? apiResult.value.data || [] : []),
          ...(demoResult.status === 'fulfilled' ? demoResult.value : []),
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const listed = projects.find((row) => row.id === selection.projectId);

  // Fallback untuk kontrak di luar 100 teratas atau tautan langsung.
  useEffect(() => {
    if (!selection.projectId || isDemoId(selection.projectId) || loading || listed || extra.id === selection.projectId) return;
    // Selama extra.id belum sama dengan projectId, halaman tampil "memuat".
    let cancelled = false;
    getSupplyProject(selection.projectId)
      .then((project) => { if (!cancelled) setExtra({ id: selection.projectId, project, missing: false }); })
      .catch(() => { if (!cancelled) setExtra({ id: selection.projectId, project: null, missing: true }); });
    return () => { cancelled = true; };
  }, [extra.id, listed, loading, selection.projectId]);

  const project = listed || (extra.id === selection.projectId ? extra.project : null);
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const goWithNotice = (target, text) => { setFlash({ route: target, text }); onNavigate(target); };

  const upsertProject = (saved) => {
    setProjects((current) => (current.some((row) => row.id === saved.id)
      ? current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row))
      : [saved, ...current]));
    if (extra.id === saved.id) setExtra((current) => ({ ...current, project: saved }));
  };

  const renderContent = () => {
    if (selection.form === 'project-new') {
      if (!permissions.createProject) return <BackPanel title="Tidak bisa dibuka">Anda tidak memiliki izin membuat kontrak supply.</BackPanel>;
      return (
        <SupplyProjectFormPage
          key={route}
          onSubmitForm={createSupplyProject}
          onCancel={() => onNavigate('admin/supply')}
          onSaved={(saved) => { upsertProject(saved); goWithNotice(`admin/supply/${saved.id}`, `Kontrak ${saved.projectCode} dibuat.`); }}
        />
      );
    }
    if (!selection.projectId) {
      return <SupplyProjectPickerPage projects={projects} loading={loading} error={loadError} canCreate={permissions.createProject} />;
    }
    if (!project) {
      if (loading || (!isDemoId(selection.projectId) && !(extra.id === selection.projectId && extra.missing))) return <LoadingPanel>Memuat kontrak supply...</LoadingPanel>;
      return <BackPanel icon="🔎" title="Kontrak tidak ditemukan">Kontrak ini mungkin tidak ada atau Anda tidak punya akses.</BackPanel>;
    }

    const detail = `admin/supply/${project.id}`;
    const isFinal = ['completed', 'cancelled'].includes(project.status);

    if (selection.form === 'project-edit') {
      if (!permissions.updateProject || isFinal) {
        return <BackPanel title="Tidak bisa diubah" href={`#/${detail}`}>{isFinal ? `Kontrak berstatus "${project.status}" tidak bisa diubah lagi.` : 'Anda tidak memiliki izin mengubah kontrak.'}</BackPanel>;
      }
      return (
        <SupplyProjectFormPage
          key={route}
          project={project}
          onSubmitForm={(form) => (project.isDemo ? updateDemoSupplyProject(project.id, form) : updateSupplyProject(project.id, form))}
          onCancel={() => onNavigate(detail)}
          onSaved={(saved) => { upsertProject(saved); goWithNotice(detail, 'Data kontrak diperbarui.'); }}
        />
      );
    }
    if (selection.form === 'delivery-new' || selection.form === 'delivery-edit') {
      if (isFinal) return <BackPanel title="Kontrak sudah ditutup" href={`#/${detail}`}>Ritase tidak bisa dicatat atau diubah pada kontrak berstatus "{project.status}".</BackPanel>;
      return (
        <DeliveryFormPage
          key={route}
          project={project}
          deliveryId={selection.deliveryId}
          onCancel={() => onNavigate(detail)}
          onSaved={(saved) => goWithNotice(detail, `Ritase ${saved.deliveryNoteNo} (${saved.volume} m³) tersimpan.`)}
        />
      );
    }
    return (
      <SupplyDetailPage
        key={route}
        project={project}
        projects={projects}
        permissions={permissions}
        initialNotice={flashFor(route)}
        onNavigate={onNavigate}
        onProjectChanged={upsertProject}
      />
    );
  };

  return (
    <AdminLayout active="supply" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {renderContent()}
    </AdminLayout>
  );
}
