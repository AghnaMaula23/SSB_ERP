import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../../components/AlatHeader.jsx';
import AlatSidebar from '../../components/AlatSidebar.jsx';
import ComboboxSelect from '../../../../components/ComboboxSelect.jsx';
import { createDamageLog, getDamageLogById, getInformationItems, updateDamageLog } from '../services/informationService.js';
import { recordActivity } from '../../../../services/activityLogService.js';
import { hasPermission } from '../../../../services/permissions.js';

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

const emptyForm = { equipmentItemId: '', damageDate: todayDate(), description: '', level: 'minor', sparePartSource: 'warehouse', mechanicTeam: 'internal' };

export default function DamageLogFormPage({ logId, onBack, onBackToModules, onSignOut }) {
  const isEdit = Boolean(logId);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = hasPermission(isEdit ? 'damage:update' : 'damage:create');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [itemRows, log] = await Promise.all([
          getInformationItems(),
          isEdit ? getDamageLogById(logId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const rows = [...itemRows];
        if (log?.equipmentItem && !rows.some((item) => String(item.id) === String(log.equipmentItemId))) rows.push(log.equipmentItem);
        setItems(rows);
        if (log) {
          setForm({
            equipmentItemId: String(log.equipmentItemId || ''),
            damageDate: log.damageDate || todayDate(),
            description: log.description || '',
            sparePartSource: log.sparePartSource || 'warehouse',
            mechanicTeam: log.mechanicTeam || 'internal',
            level: log.level || (log.stopsOperation ? 'critical' : 'minor'),
          });
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isEdit, logId]);

  const equipmentOptions = useMemo(() => items.map((item) => ({
    value: String(item.id),
    label: item.assetCode || item.itemCode || `Item ${item.id}`,
    meta: [item.equipmentType?.typeName || item.jenis, item.brand, item.model].filter(Boolean).join(' · '),
    keywords: [item.brand, item.model, item.equipmentType?.typeName, item.jenis, item.assetCode].filter(Boolean),
  })), [items]);

  const selectedEquipment = equipmentOptions.find((option) => option.value === String(form.equipmentItemId));

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value, ...(name === 'level' ? { level: value } : {}) }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.equipmentItemId || !form.description.trim()) { setError('Equipment unit dan deskripsi wajib diisi.'); return; }
    if (!canSubmit) { setError('Anda tidak memiliki izin untuk menyimpan damage log.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      description: form.description.trim(),
      damageDate: form.damageDate,
      sparePartSource: form.sparePartSource,
      mechanicTeam: form.mechanicTeam,
      level: form.level,
      stopsOperation: form.level === 'critical',
    };
    try {
      if (isEdit) await updateDamageLog(logId, payload);
      else await createDamageLog({ ...payload, equipmentItemId: Number(form.equipmentItemId) });
      recordActivity({
        module: 'Information',
        action: isEdit ? 'Damage log diperbarui' : 'Damage log dibuat',
        description: `${selectedEquipment?.label || 'Equipment'} · ${form.level.toUpperCase()} · ${form.description.trim()}`,
        ref: `alat/information/${logId || ''}`,
      });
      sessionStorage.setItem('information-notice', isEdit ? 'Damage log berhasil diperbarui.' : 'Damage log berhasil dibuat.');
      onBack();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/information" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <nav className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
            <button type="button" onClick={onBack} className="hover:text-slate-800">Damage Logs</button><span>/</span><span className="font-semibold text-slate-900">{isEdit ? 'Edit Damage Log' : 'Create Damage Log'}</span>
          </nav>
          <div className="card-panel p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit Damage Log' : 'Create Damage Log'}</h1>
              <p className="mt-1 text-xs text-slate-500">Catat kerusakan equipment dengan detail yang dapat ditelusuri.</p>
            </div>
            {loading ? <div className="py-10 text-center text-sm text-slate-500">Memuat data equipment...</div> : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
                <ComboboxSelect
                  id="damage-equipment"
                  label="Equipment Unit"
                  required
                  value={form.equipmentItemId}
                  onChange={(nextValue) => { setForm((current) => ({ ...current, equipmentItemId: nextValue })); setError(''); }}
                  options={equipmentOptions}
                  placeholder="Cari asset code, brand, model, atau jenis equipment..."
                  hint={selectedEquipment ? `Dipilih: ${selectedEquipment.label}` : 'Cari equipment unit, lalu pilih dari daftar yang muncul.'}
                />
                <div>
                  <label htmlFor="damage-level" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Level Kerusakan</label>
                  <select id="damage-level" name="level" value={form.level} onChange={update} className="input-control mt-1 text-sm">
                    <option value="minor">Minor</option>
                    <option value="critical">Critical</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">Critical menandai equipment berhenti beroperasi,Minor berarti equipment masih bisa beroperasi.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="damage-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal Kerusakan</label><input id="damage-date" type="date" name="damageDate" value={form.damageDate} onChange={update} required disabled={saving} className="input-control mt-1" /></div>
                  <div><label htmlFor="damage-description" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Deskripsi</label><input id="damage-description" name="description" value={form.description} onChange={update} required disabled={saving} maxLength="1000" className="input-control mt-1" placeholder="Contoh: Hydraulic oil leakage..." /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Spare Part Source</span><div className="grid grid-cols-2 gap-2">{[['warehouse', 'Warehouse'], ['supplier', 'Supplier']].map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.sparePartSource === value ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="sparePartSource" value={value} checked={form.sparePartSource === value} onChange={update} className="sr-only" />{label}</label>)}</div></div>
                  <div><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Mechanic Team</span><div className="grid grid-cols-2 gap-2">{[['internal', 'Internal'], ['external', 'External']].map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center justify-center rounded-lg border p-2 text-xs font-semibold transition ${form.mechanicTeam === value ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="mechanicTeam" value={value} checked={form.mechanicTeam === value} onChange={update} className="sr-only" />{label}</label>)}</div></div>
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" onClick={onBack} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving || !canSubmit} className="btn btn-primary">{saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Create Damage Log'}</button></div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
