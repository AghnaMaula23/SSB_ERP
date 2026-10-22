import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { EmptyPanel, LoadingPanel } from '../../project/components/ProjectUi.jsx';
import RentalPickerPage from './RentalPickerPage.jsx';
import RentalProjectFormPage from './RentalProjectFormPage.jsx';
import RentalUnitFormPage from './RentalUnitFormPage.jsx';
import RentalDetailPage from './RentalDetailPage.jsx';
import SheetFormPage from './SheetFormPage.jsx';
import {
  createRentalProject, createRentalUnitRequest, getRentalProject, listRentalProjects, loadRentalUnits, updateRentalProject,
} from '../services/rentalService.js';
import { addDemoUnit, isDemoId, listDemoRentalProjects, listDemoUnits, updateDemoRentalProject } from '../services/rentalDemoService.js';
import { buildUnits } from '../utils/rentalFormat.js';
import { formatDate, formatNumber } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { parseRentalRoute } from '../utils/rentalRoute.js';

function BackPanel({ icon = '🔒', title, children, href = '#/admin/rental' }) {
  return <EmptyPanel icon={icon} title={title} action={<a href={href} className="btn btn-secondary text-xs">← Kembali</a>}>{children}</EmptyPanel>;
}

/**
 * Menu Rental Divisi Admin. Tanpa panel samping: kontrak dipilih di halaman
 * awal, unit dipilih lewat kartu di halaman kontrak.
 */
export default function RentalWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseRentalRoute(route) || { projectId: null, form: null, unitKey: null };
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [extra, setExtra] = useState({ id: null, project: null, missing: false });
  const [unitsByProject, setUnitsByProject] = useState({});
  const [flash, setFlash] = useState({ route: '', text: '' });

  const permissions = {
    createProject: hasPermission('project:create'),
    updateProject: hasPermission('project:update'),
    // Request external rental hanya boleh dibuat pemegang equipment-request:review.
    requestUnit: hasPermission('equipment-request:review'),
    createWorkhour: hasPermission('workhour:create'),
  };

  useEffect(() => {
    let cancelled = false;
    // Kontrak dari API + kontrak contoh. Kalau API gagal, contoh tetap tampil.
    Promise.allSettled([listRentalProjects({ limit: 100 }), listDemoRentalProjects()])
      .then(([apiResult, demoResult]) => {
        if (cancelled) return;
        if (apiResult.status === 'rejected') setLoadError(apiResult.reason?.message || 'Kontrak rental gagal dimuat.');
        setProjects([
          ...(apiResult.status === 'fulfilled' ? apiResult.value.data || [] : []),
          ...(demoResult.status === 'fulfilled' ? demoResult.value : []),
        ]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadUnits = useCallback(async (projectId) => {
    setUnitsByProject((current) => ({ ...current, [projectId]: { ...(current[projectId] || { units: [] }), loading: true, error: '' } }));
    try {
      const units = isDemoId(projectId) ? await listDemoUnits(projectId) : buildUnits(await loadRentalUnits(projectId));
      setUnitsByProject((current) => ({ ...current, [projectId]: { units, loading: false, error: '' } }));
    } catch (error) {
      setUnitsByProject((current) => ({ ...current, [projectId]: { units: current[projectId]?.units || [], loading: false, error: error.message } }));
    }
  }, []);

  useEffect(() => {
    if (selection.projectId) loadUnits(selection.projectId);
  }, [loadUnits, selection.projectId]);

  const listed = projects.find((row) => row.id === selection.projectId);

  useEffect(() => {
    if (!selection.projectId || isDemoId(selection.projectId) || loading || listed || extra.id === selection.projectId) return;
    let cancelled = false;
    getRentalProject(selection.projectId)
      .then((project) => { if (!cancelled) setExtra({ id: selection.projectId, project, missing: false }); })
      .catch(() => { if (!cancelled) setExtra({ id: selection.projectId, project: null, missing: true }); });
    return () => { cancelled = true; };
  }, [extra.id, listed, loading, selection.projectId]);

  const project = listed || (extra.id === selection.projectId ? extra.project : null);
  const unitsEntry = selection.projectId ? unitsByProject[selection.projectId] : null;
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const goWithNotice = (target, text) => { setFlash({ route: target, text }); onNavigate(target); };

  const upsertProject = (saved) => {
    setProjects((current) => (current.some((row) => row.id === saved.id)
      ? current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row))
      : [saved, ...current]));
    if (extra.id === saved.id) setExtra((current) => ({ ...current, project: saved }));
  };

  /** Kontrak baru, lalu (opsional) unit pertamanya sebagai Request Alat. */
  const createWithFirstUnit = async (form, unitForm) => {
    const saved = await createRentalProject(form);
    upsertProject(saved);
    if (!unitForm) return { saved, text: `Kontrak ${saved.projectCode} dibuat.` };
    try {
      const request = await createRentalUnitRequest(saved.id, unitForm);
      return { saved, text: `Kontrak ${saved.projectCode} dibuat dan request ${request.requestCode} dikirim ke Divisi Alat.` };
    } catch (error) {
      // Kontraknya sudah tersimpan — jangan sembunyikan, beri tahu unitnya yang gagal.
      return { saved, text: `Kontrak ${saved.projectCode} dibuat, tetapi request unit gagal: ${error.message} Ajukan ulang lewat “Unit Baru”.` };
    }
  };

  const renderContent = () => {
    if (selection.form === 'project-new') {
      if (!permissions.createProject) return <BackPanel title="Tidak bisa dibuka">Anda tidak memiliki izin membuat kontrak rental.</BackPanel>;
      return (
        <RentalProjectFormPage
          key={route}
          onSubmitForm={createWithFirstUnit}
          onCancel={() => onNavigate('admin/rental')}
          onSaved={({ saved, text }) => goWithNotice(`admin/rental/${saved.id}`, text)}
        />
      );
    }
    if (!selection.projectId) {
      return <RentalPickerPage projects={projects} loading={loading} error={loadError} canCreate={permissions.createProject} />;
    }
    if (!project) {
      if (loading || (!isDemoId(selection.projectId) && !(extra.id === selection.projectId && extra.missing))) return <LoadingPanel>Memuat kontrak rental...</LoadingPanel>;
      return <BackPanel icon="🔎" title="Kontrak tidak ditemukan">Kontrak ini mungkin tidak ada atau Anda tidak punya akses.</BackPanel>;
    }

    const detail = `admin/rental/${project.id}`;
    const isFinal = ['completed', 'cancelled'].includes(project.status);

    if (selection.form === 'project-edit') {
      if (!permissions.updateProject || isFinal) {
        return <BackPanel title="Tidak bisa diubah" href={`#/${detail}`}>{isFinal ? `Kontrak berstatus "${project.status}" tidak bisa diubah lagi.` : 'Anda tidak memiliki izin mengubah kontrak.'}</BackPanel>;
      }
      return (
        <RentalProjectFormPage
          key={route}
          project={project}
          onSubmitForm={(form) => (project.isDemo ? updateDemoRentalProject(project.id, form) : updateRentalProject(project.id, form))}
          onCancel={() => onNavigate(detail)}
          onSaved={(saved) => { upsertProject(saved); goWithNotice(detail, 'Data kontrak diperbarui.'); }}
        />
      );
    }

    if (selection.form === 'unit-new') {
      if (isFinal) return <BackPanel title="Kontrak sudah ditutup" href={`#/${detail}`}>Unit tidak bisa ditambah pada kontrak berstatus "{project.status}".</BackPanel>;
      if (!project.isDemo && !permissions.requestUnit) return <BackPanel title="Tidak bisa dibuka" href={`#/${detail}`}>Request unit rental hanya bisa dibuat Admin (equipment-request:review).</BackPanel>;
      return (
        <RentalUnitFormPage
          key={route}
          project={project}
          onSubmitForm={(form) => (project.isDemo ? addDemoUnit(project.id, form, form.typeName || 'Unit') : createRentalUnitRequest(project.id, form))}
          onCancel={() => onNavigate(detail)}
          onSaved={async (result) => {
            await loadUnits(project.id);
            goWithNotice(detail, project.isDemo
              ? `${result.length} unit contoh ditambahkan.`
              : `Request ${result.requestCode} dikirim ke Divisi Alat.`);
          }}
        />
      );
    }

    if (selection.form === 'sheet-new') {
      if (!unitsEntry || (unitsEntry.loading && !unitsEntry.units.length)) return <LoadingPanel>Memuat unit...</LoadingPanel>;
      const unit = unitsEntry.units.find((row) => row.key === selection.unitKey);
      const unitRoute = `${detail}/unit/${selection.unitKey}`;
      if (!unit) return <BackPanel icon="🔎" title="Unit tidak ditemukan" href={`#/${detail}`}>Unit ini bukan milik kontrak yang dipilih.</BackPanel>;
      if (unit.status !== 'active' || isFinal) return <BackPanel title="Sheet belum bisa diisi" href={`#/${unitRoute}`}>Jam kerja hanya bisa dicatat pada unit yang sedang beroperasi.</BackPanel>;
      if (unit.kind !== 'demo' && !permissions.createWorkhour) return <BackPanel title="Tidak bisa dibuka" href={`#/${unitRoute}`}>Pencatatan jam kerja milik Lapangan / Divisi Alat (workhour:create).</BackPanel>;
      return (
        <SheetFormPage
          key={route}
          project={project}
          unit={unit}
          onCancel={() => onNavigate(unitRoute)}
          onSaved={({ workDate, total }) => goWithNotice(unitRoute, `Sheet ${formatDate(workDate)} tersimpan: ${formatNumber(total)} jam.`)}
        />
      );
    }

    return (
      <RentalDetailPage
        key={route}
        project={project}
        projects={projects}
        unitsEntry={unitsEntry}
        selectedKey={selection.unitKey}
        permissions={permissions}
        initialNotice={flashFor(route)}
        onNavigate={onNavigate}
        onProjectChanged={upsertProject}
        onUnitsChanged={() => loadUnits(project.id)}
      />
    );
  };

  return (
    <AdminLayout active="rental" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {renderContent()}
    </AdminLayout>
  );
}
