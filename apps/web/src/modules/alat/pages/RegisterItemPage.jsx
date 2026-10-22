import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { getEquipmentTypes, registerItem } from '../services/alatService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';

const isTruckType = (typeName) => /truck|truk/i.test(typeName || '');

export default function RegisterItemPage({ onBackToItems, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [form, setForm] = useState({ equipmentTypeId: '', brand: '', model: '', plateNumber: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canCreate = hasPermission('equipment:create');

  useEffect(() => {
    getEquipmentTypes()
      .then(setTypes)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setTypesLoading(false));
  }, []);

  const selectedType = types.find((type) => String(type.id) === String(form.equipmentTypeId));
  const showPlateNumber = selectedType ? isTruckType(selectedType.typeName) : false;
  const navigate = (route) => { window.location.hash = `/${route}`; };
  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value, ...(name === 'equipmentTypeId' && !isTruckType(types.find((type) => String(type.id) === value)?.typeName) ? { plateNumber: '' } : {}) }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.equipmentTypeId) { setError('Jenis / category wajib dipilih.'); return; }
    setSaving(true);
    try {
      await registerItem({
        equipmentTypeId: Number(form.equipmentTypeId),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        plateNumber: showPlateNumber ? form.plateNumber.trim() || null : null,
      });
      sessionStorage.setItem('alat-notice', 'Unit equipment baru berhasil didaftarkan.');
      recordActivity({ module: 'Items', action: 'Unit equipment didaftarkan', description: `${form.plateNumber || 'Tanpa plat'} · ${form.brand || form.model || '-'}`, ref: 'alat/items' });
      navigate('alat/items');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/items" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <nav className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
            <button type="button" onClick={onBackToItems} className="hover:text-slate-800">Items Inventory</button><span>/</span><span className="font-semibold text-slate-900">Register New Item</span>
          </nav>
          <div className="card-panel p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900">Register New Equipment</h1>
              <p className="mt-1 text-xs text-slate-500">Tambahkan unit baru ke inventory Divisi Alat.</p>
            </div>
            {!canCreate && <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">Anda tidak memiliki izin membuat equipment.</div>}
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
              <div>
                <label htmlFor="register-type" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Jenis / Category</label>
                <select id="register-type" name="equipmentTypeId" value={form.equipmentTypeId} onChange={update} disabled={saving || typesLoading || !canCreate} className="input-control mt-1 text-sm" required>
                  <option value="">{typesLoading ? 'Memuat jenis equipment...' : 'Pilih jenis / category'}</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.typeName}</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-brand" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Brand / Merek</label>
                  <input id="register-brand" name="brand" value={form.brand} onChange={update} disabled={saving || !canCreate} maxLength="100" className="input-control mt-1" placeholder="e.g. Komatsu" />
                </div>
                <div>
                  <label htmlFor="register-model" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Model / Type</label>
                  <input id="register-model" name="model" value={form.model} onChange={update} disabled={saving || !canCreate} maxLength="100" className="input-control mt-1" placeholder="e.g. D65PX" />
                </div>
              </div>
              {showPlateNumber && (
                <div>
                  <label htmlFor="register-plate" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Nomor Plat</label>
                  <input id="register-plate" name="plateNumber" value={form.plateNumber} onChange={update} disabled={saving || !canCreate} maxLength="30" className="input-control mt-1 uppercase" placeholder="e.g. B 1234 XYZ" />
                </div>
              )}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
                <button type="button" onClick={onBackToItems} className="btn btn-secondary">Batal</button>
                <button type="submit" disabled={saving || typesLoading || !canCreate} className="btn btn-primary">{saving ? 'Menyimpan...' : 'Simpan Equipment'}</button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
