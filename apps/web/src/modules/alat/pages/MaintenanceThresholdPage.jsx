import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { getEquipmentTypes } from '../services/alatService.js';
import { createMaintenanceAspect, getMaintenanceAspects } from '../services/maintenanceService.js';
import { deleteTypeThreshold, getTypeThreshold, getTypeThresholds, saveTypeThreshold } from '../services/maintenanceThresholdService.js';
import { hasPermission } from '../../../services/permissions.js';
import ActionButton from '../../../components/ActionButton.jsx';

export default function MaintenanceThresholdPage({ onBack, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [aspects, setAspects] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [form, setForm] = useState({ equipmentTypeId: '', maintenanceAspectId: '', thresholdValue: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aspectForm, setAspectForm] = useState({ aspectCode: '', aspectName: '', defaultThresholdValue: '' });
  const canUpdate = hasPermission('maintenance:update');

  const load = async () => {
    try {
      setLoading(true);
      const [typeRows, aspectRows] = await Promise.all([getEquipmentTypes(), getMaintenanceAspects()]);
      setTypes(typeRows);
      setAspects(aspectRows);
      setThresholds(getTypeThresholds());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleTypeChange = (event) => {
    const equipmentTypeId = event.target.value;
    const existing = equipmentTypeId && form.maintenanceAspectId ? getTypeThreshold(equipmentTypeId, form.maintenanceAspectId) : null;
    setForm((current) => ({ ...current, equipmentTypeId, thresholdValue: existing?.thresholdValue ?? '' }));
  };

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
  };

  const handleAspectChange = (event) => {
    const maintenanceAspectId = event.target.value;
    const equipmentTypeId = form.equipmentTypeId;
    const existing = equipmentTypeId && maintenanceAspectId ? getTypeThreshold(equipmentTypeId, maintenanceAspectId) : null;
    const aspect = aspects.find((item) => String(item.id) === String(maintenanceAspectId));
    setForm((current) => ({ ...current, maintenanceAspectId, thresholdValue: existing?.thresholdValue ?? aspect?.defaultThresholdValue ?? '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.equipmentTypeId || !form.maintenanceAspectId || !form.thresholdValue || Number(form.thresholdValue) <= 0) { setError('Type equipment, aspek, dan threshold wajib diisi.'); return; }
    if (!canUpdate) { setError('Anda tidak memiliki izin mengubah threshold.'); return; }
    setSaving(true);
    try {
      saveTypeThreshold(form);
      setThresholds(getTypeThresholds());
      setForm({ equipmentTypeId: '', maintenanceAspectId: '', thresholdValue: '' });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAspect = async (event) => {
    event.preventDefault();
    try {
      createMaintenanceAspect(aspectForm);
      setAspectForm({ aspectCode: '', aspectName: '', defaultThresholdValue: '' });
      setAspects(await getMaintenanceAspects());
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const updateAspect = (event) => setAspectForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const typeName = (id) => types.find((type) => String(type.id) === String(id))?.typeName || `Type ${id}`;
  const aspectName = (id) => aspects.find((aspect) => String(aspect.id) === String(id))?.aspectName || `Aspect ${id}`;

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/maintenance" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3"><div><nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBack} className="hover:text-slate-800">Maintenance Tracking</button><span>/</span><span className="text-slate-900 font-semibold">Threshold per Equipment Type</span></nav><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Threshold per Equipment Type</h1><p className="mt-1 text-xs text-slate-500">Nilai default threshold untuk setiap jenis equipment dan aspek maintenance.</p><p className="mt-1 text-xs text-slate-500">Dipakai sebagai acuan saat menambah maintenance setting per unit.</p></div><ActionButton kind="back" label="Kembali ke Maintenance Tracking" onClick={onBack} /></header>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {loading ? <div className="card-panel p-12 text-center text-sm text-slate-500">Memuat master threshold...</div> : <>
            <form onSubmit={handleSubmit} className="card-panel space-y-4 p-6"><h2 className="text-base font-bold text-slate-900">Tambah / Ubah Threshold</h2><div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="threshold-type" className="block text-xs font-semibold text-slate-600">Equipment Type</label><select id="threshold-type" name="equipmentTypeId" value={form.equipmentTypeId} onChange={handleTypeChange} className="input-control mt-1 text-xs"><option value="">Pilih type...</option>{types.map((type) => <option key={type.id} value={type.id}>{type.typeName}</option>)}</select></div><div><label htmlFor="threshold-aspect" className="block text-xs font-semibold text-slate-600">Maintenance Aspect</label><select id="threshold-aspect" name="maintenanceAspectId" value={form.maintenanceAspectId} onChange={handleAspectChange} className="input-control mt-1 text-xs"><option value="">Pilih aspek...</option>{aspects.map((aspect) => <option key={aspect.id} value={aspect.id}>{aspect.aspectName}</option>)}</select></div><div><label htmlFor="threshold-value" className="block text-xs font-semibold text-slate-600">Threshold (Jam)</label><input id="threshold-value" name="thresholdValue" type="number" min="1" value={form.thresholdValue} onChange={update} className="input-control mt-1 text-xs" placeholder="Contoh: 250" /></div></div><div className="flex justify-end"><button type="submit" disabled={saving || !canUpdate} className="btn btn-primary text-xs">{saving ? 'Menyimpan...' : 'Simpan Threshold'}</button></div></form>
            <form onSubmit={handleCreateAspect} className="card-panel space-y-4 p-6"><div><h2 className="text-base font-bold text-slate-900">Tambah Maintenance Aspect</h2><p className="mt-1 text-xs text-slate-500">Aspek baru dapat langsung dipakai pada pengaturan maintenance setiap unit.</p></div><div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="new-aspect-code" className="block text-xs font-semibold text-slate-600">Kode Aspek</label><input id="new-aspect-code" name="aspectCode" value={aspectForm.aspectCode} onChange={updateAspect} className="input-control mt-1 text-xs" placeholder="Contoh: FILTER-HYD" /></div><div><label htmlFor="new-aspect-name" className="block text-xs font-semibold text-slate-600">Nama Aspek</label><input id="new-aspect-name" name="aspectName" value={aspectForm.aspectName} onChange={updateAspect} className="input-control mt-1 text-xs" placeholder="Contoh: Filter Hidrolik" /></div><div><label htmlFor="new-aspect-threshold" className="block text-xs font-semibold text-slate-600">Default Threshold</label><input id="new-aspect-threshold" name="defaultThresholdValue" type="number" min="1" value={aspectForm.defaultThresholdValue} onChange={updateAspect} className="input-control mt-1 text-xs" placeholder="Contoh: 300" /></div></div><div className="flex justify-end"><button type="submit" disabled={!canUpdate} className="btn btn-primary text-xs">+ Tambah Aspek</button></div></form>
            <section className="card-panel overflow-hidden"><h2 className="border-b border-slate-200 px-6 py-4 text-sm font-bold text-slate-900">Threshold Tersimpan</h2><div className="table-container"><table className="table-modern"><thead><tr><th>Equipment Type</th><th>Aspect</th><th>Threshold</th><th>Updated</th><th className="text-right">Action</th></tr></thead><tbody>{thresholds.length ? thresholds.map((row) => <tr key={row.id}><td className="text-xs font-semibold">{typeName(row.equipmentTypeId)}</td><td className="text-xs">{aspectName(row.maintenanceAspectId)}</td><td className="text-xs">{row.thresholdValue} hrs</td><td className="text-xs text-slate-500">{new Date(row.updatedAt).toLocaleString('id-ID')}</td><td className="text-right"><ActionButton kind="delete" tone="danger" label={`Hapus threshold ${typeName(row.equipmentTypeId)} · ${aspectName(row.maintenanceAspectId)}`} onClick={() => { deleteTypeThreshold(row.equipmentTypeId, row.maintenanceAspectId); setThresholds(getTypeThresholds()); }} disabled={!canUpdate} /></td></tr>) : <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">Belum ada threshold per type.</td></tr>}</tbody></table></div></section>
          </>}
        </div>
      </main>
    </div>
  );
}
