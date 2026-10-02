import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActionButton from '../../../components/ActionButton.jsx';
import { createIncomeClaim } from '../services/incomeClaimService.js';
import { getClaimableProjects } from '../services/projectService.js';
import { recordActivity } from '../../../services/activityLogService.js';

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

export default function KasClaimPendapatanPage({ onBackToModules, onBackToKas, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [subProjectId, setSubProjectId] = useState('');
  const [date, setDate] = useState(todayDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getClaimableProjects().then((rows) => {
      setProjects(rows);
      if (rows[0]) {
        setProjectId(rows[0].id);
        setSubProjectId(rows[0].subProjects?.[0]?.id || '');
      }
    }).catch((requestError) => setError(requestError.message));
  }, []);

  const selectedProject = projects.find((item) => String(item.id) === String(projectId));
  const selectedSubProject = selectedProject?.subProjects?.find((item) => String(item.id) === String(subProjectId));

  const handleProjectChange = (event) => {
    const nextProject = projects.find((item) => String(item.id) === event.target.value);
    setProjectId(event.target.value);
    setSubProjectId(nextProject?.subProjects?.[0]?.id || '');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedProject || !selectedSubProject) { setError('Pilih project dan activity yang sudah diterima Admin.'); return; }
    setSaving(true);
    setError('');
    try {
      const claim = createIncomeClaim({
        date,
        project: selectedProject.name,
        projectId: selectedProject.id,
        subProject: selectedSubProject.name,
        subProjectId: selectedSubProject.id,
        clientName: selectedProject.clientName,
        equipment: [],
        materials: [],
        totalAmount: 0,
      });
      sessionStorage.setItem('kas-notice', `${claim.claimCode} tersimpan. Rincian pendapatan akan diisi oleh Admin.`);
      recordActivity({ module: 'Kas', action: 'Claim pendapatan diajukan', description: `${selectedProject.name} · ${selectedSubProject.name} · menunggu rincian dari Admin`, ref: 'alat/kas' });
      onBackToKas();
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/kas" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-start justify-between gap-3"><div><nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBackToKas} className="hover:text-slate-800">Kas</button><span>/</span><span className="text-slate-900 font-semibold">Claim Pendapatan</span></nav><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Claim Pendapatan</h1><p className="mt-1 text-xs text-slate-500">Pilih project yang sudah diverifikasi Admin untuk mengajukan claim.</p></div><ActionButton kind="back" label="Kembali ke Kas" onClick={onBackToKas} /></header>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-xs text-teal-800"><p className="font-semibold">Rincian pendapatan diisi oleh Admin</p><p className="mt-1">Divisi Alat hanya menentukan project claim. Equipment, material, jam kerja, rate, dan nominal akan diisi setelah claim dibuat.</p></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} className="card-panel space-y-5 p-6 sm:p-8"><div><label htmlFor="claim-project" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Project / Site *</label><select id="claim-project" value={projectId} onChange={handleProjectChange} required className="input-control mt-1 text-sm"><option value="">Pilih project...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{projects.length === 0 && <p className="mt-2 text-xs text-amber-700">Belum ada project yang diterima Admin.</p>}</div><div><label htmlFor="claim-subproject" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Sub-Project / Activity *</label><select id="claim-subproject" value={subProjectId} onChange={(event) => setSubProjectId(event.target.value)} required className="input-control mt-1 text-sm"><option value="">Pilih activity...</option>{selectedProject?.subProjects?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label htmlFor="claim-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal Claim</label><input id="claim-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-control mt-1 max-w-xs text-sm" /></div><div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600"><p>Project: <strong className="text-slate-900">{selectedProject?.name || '-'}</strong></p><p className="mt-1">Client: <strong className="text-slate-900">{selectedProject?.clientName || '-'}</strong></p><p className="mt-1">Activity: <strong className="text-slate-900">{selectedSubProject?.name || '-'}</strong></p></div><div className="flex justify-end gap-3 border-t border-slate-200 pt-5"><ActionButton kind="cancel" label="Batal" tone="danger" onClick={onBackToKas} /><button type="submit" disabled={saving || !projects.length} className="btn btn-primary">💰 {saving ? 'Mengirim...' : 'Buat Claim Pendapatan'}</button></div></form>
        </div>
      </main>
    </div>
  );
}
