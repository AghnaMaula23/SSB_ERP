import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ComboboxSelect from '../../../components/ComboboxSelect.jsx';
import { getAllItems } from '../services/alatService.js';
import { getDamageLogs } from '../information/services/informationService.js';
import { getMaintenanceOverview } from '../services/maintenanceService.js';
import { categoryLabel, createPurchaseOrderRequest, ITEM_TYPE_OPTIONS } from '../services/purchaseOrderService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';

function todayDate() { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10); }

const PO_CATEGORIES = [
  { value: 'perbaikan_alat', icon: '🔧', label: 'Perbaikan Alat', description: 'Tiap barang terhubung ke damage log. Dipakai untuk menyelesaikan damage log di halaman Information.' },
  { value: 'servis_rutin', icon: '🗓️', label: 'Servis Rutin', description: 'Tiap barang memilih unit & aspek maintenance (oli, filter, dll). Dipakai untuk reset di halaman Maintenance.' },
  { value: 'stok_gudang', icon: '📦', label: 'Stok Gudang', description: 'Pengadaan stok biasa, tidak terhubung ke halaman lain.' },
];
const metricStatusStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};
const metricStatusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due Soon', overdue: 'Alert', inactive: 'Inactive' };
const DEMO_MAINTENANCE_ROW = {
  id: 'demo-unit-1',
  itemCode: 'SSB-EXC-002',
  itemName: '[DEMO] Excavator',
  status: 'due',
  metrics: {
    'Oli Mesin': { id: 'demo-oli-mesin', name: 'Oli Mesin', current: 240, threshold: 250, status: 'due' },
    'Filter Oli': { id: 'demo-filter-oli', name: 'Filter Oli', current: 240, threshold: 500, status: 'normal' },
  },
};
// Referensi disimpan per item: damage log (perbaikan alat) atau unit + aspek maintenance (servis rutin).
const newLine = (id) => ({ id, itemType: 'sparepart', itemName: '', damageLogId: '', equipmentItemId: '', equipmentAssetCode: '', maintenanceSettingIds: [], quantity: 1, unit: 'unit', estimatedUnitPrice: '' });

export default function PurchaseOrderCreatePage({ onBackToModules, onBackToPurchaseOrders, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [date, setDate] = useState(todayDate);
  const [category, setCategory] = useState('');
  const [lines, setLines] = useState([newLine(1)]);
  const [damageLogs, setDamageLogs] = useState([]);
  const [maintenanceRows, setMaintenanceRows] = useState([]);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canCreate = hasPermission('equipment:create');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [damageResult, maintenanceResult, itemResult] = await Promise.allSettled([
        getDamageLogs({ status: 'reported', limit: 100 }),
        getMaintenanceOverview(),
        getAllItems(),
      ]);
      if (cancelled) return;
      setDamageLogs(damageResult.status === 'fulfilled' ? damageResult.value.data || [] : [{ id: 'demo-damage-1', damageCode: 'DMG-DEMO-001', description: '[DEMO] Contoh kerusakan hidrolik', equipmentItem: { assetCode: 'SSB-EXC-002' } }]);
      setMaintenanceRows(maintenanceResult.status === 'fulfilled' ? maintenanceResult.value.data || [] : [DEMO_MAINTENANCE_ROW]);
      setEquipmentItems(itemResult.status === 'fulfilled' ? itemResult.value.data || [] : []);
      const preselect = sessionStorage.getItem('po-preselect-damage');
      if (preselect) {
        sessionStorage.removeItem('po-preselect-damage');
        try {
          const parsed = JSON.parse(preselect);
          if (parsed.damageLogId) {
            setCategory('perbaikan_alat');
            setLines((current) => current.map((line, index) => (index === 0 ? { ...line, damageLogId: String(parsed.damageLogId), equipmentItemId: parsed.equipmentItemId ? String(parsed.equipmentItemId) : '', equipmentAssetCode: parsed.assetCode || '' } : line)));
          }
        } catch { /* ignore malformed preselect payload */ }
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const navigate = (route) => { window.location.hash = `/${route}`; };
  const updateLine = (id, field, value) => setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  const patchLine = (id, patch) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const addLine = () => setLines((current) => [...current, newLine(Date.now())]);
  const removeLine = (id) => setLines((current) => current.length === 1 ? current : current.filter((line) => line.id !== id));

  const damageReferenceOptions = useMemo(() => damageLogs.map((log) => ({
    value: String(log.id),
    label: `${log.damageCode || 'Damage'} · ${log.description || 'Laporan kerusakan'}`,
    meta: log.equipmentItem?.assetCode || '',
    keywords: [log.description, log.damageCode, log.equipmentItem?.assetCode, log.level || (log.stopsOperation ? 'critical' : 'minor')].filter(Boolean),
    equipmentItemId: log.equipmentItemId || log.equipmentItem?.id || null,
    equipmentAssetCode: log.equipmentItem?.assetCode || '',
  })), [damageLogs]);

  const equipmentOptions = useMemo(() => equipmentItems.map((item) => ({
    value: String(item.id),
    label: item.itemCode || item.assetCode || `Item ${item.id}`,
    meta: [item.jenis, item.merk, item.typeModel].filter(Boolean).join(' · '),
    keywords: [item.brand, item.model, item.jenis, item.equipmentType?.typeName, item.assetCode].filter(Boolean),
    equipmentAssetCode: item.itemCode || item.assetCode || '',
  })), [equipmentItems]);

  // Servis rutin hanya bisa memilih unit yang punya konfigurasi maintenance.
  const maintenanceUnitOptions = useMemo(() => maintenanceRows.map((row) => ({
    value: String(row.id),
    label: row.itemCode || `Item ${row.id}`,
    meta: `${row.itemName || 'Equipment'} · ${Object.keys(row.metrics || {}).length} aspek`,
    keywords: [row.itemName, ...Object.keys(row.metrics || {})].filter(Boolean),
    equipmentAssetCode: row.itemCode || '',
  })), [maintenanceRows]);

  const aspectsForUnit = (unitId) => Object.values(maintenanceRows.find((row) => String(row.id) === String(unitId))?.metrics || {});

  const handleCategoryChange = (value) => {
    if (value === category) return;
    setCategory(value);
    setLines((current) => current.map((line) => ({ ...line, damageLogId: '', equipmentItemId: '', equipmentAssetCode: '', maintenanceSettingIds: [] })));
    setError('');
  };

  const handleLineDamageChange = (line, value) => {
    const selected = damageReferenceOptions.find((option) => option.value === value);
    patchLine(line.id, { damageLogId: value, equipmentItemId: selected?.equipmentItemId ? String(selected.equipmentItemId) : '', equipmentAssetCode: selected?.equipmentAssetCode || '' });
  };

  const handleLineEquipmentChange = (line, value) => {
    const selected = equipmentOptions.find((option) => option.value === value);
    patchLine(line.id, { equipmentItemId: value, equipmentAssetCode: selected?.equipmentAssetCode || '' });
  };

  const handleLineMaintenanceUnitChange = (line, value) => {
    const selected = maintenanceUnitOptions.find((option) => option.value === value);
    // Aspek yang sudah mendekati/lewat threshold langsung dicentang.
    const dueIds = aspectsForUnit(value).filter((metric) => ['overdue', 'due'].includes(metric.status)).map((metric) => String(metric.id));
    patchLine(line.id, { equipmentItemId: value, equipmentAssetCode: selected?.equipmentAssetCode || '', maintenanceSettingIds: dueIds });
  };

  const toggleLineAspect = (line, id) => patchLine(line.id, { maintenanceSettingIds: line.maintenanceSettingIds.includes(id) ? line.maintenanceSettingIds.filter((item) => item !== id) : [...line.maintenanceSettingIds, id] });
  const toggleAllLineAspects = (line, aspects) => patchLine(line.id, { maintenanceSettingIds: line.maintenanceSettingIds.length === aspects.length ? [] : aspects.map((metric) => String(metric.id)) });

  const estimatedTotal = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.estimatedUnitPrice) || 0), 0), [lines]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) { setError('Anda tidak memiliki izin membuat purchase request.'); return; }
    if (!category) { setError('Pilih kategori purchase order terlebih dahulu.'); return; }
    const invalid = lines.find((line) => !line.itemName.trim() || Number(line.quantity) <= 0 || Number(line.estimatedUnitPrice) <= 0);
    if (invalid) { setError('Nama barang, qty, dan estimasi harga harus diisi untuk setiap item.'); return; }
    const withoutDamage = category === 'perbaikan_alat' ? lines.findIndex((line) => !line.damageLogId) : -1;
    if (withoutDamage >= 0) { setError(`Item ${withoutDamage + 1} wajib terhubung ke damage log. Buat log kerusakan di halaman Information terlebih dahulu bila belum ada.`); return; }
    const withoutUnit = category === 'servis_rutin' ? lines.findIndex((line) => !line.equipmentItemId) : -1;
    if (withoutUnit >= 0) { setError(`Pilih equipment unit untuk item ${withoutUnit + 1}.`); return; }
    const withoutAspect = category === 'servis_rutin' ? lines.findIndex((line) => !line.maintenanceSettingIds.length) : -1;
    if (withoutAspect >= 0) { setError(`Pilih minimal satu aspek maintenance untuk item ${withoutAspect + 1}.`); return; }

    const items = lines.map((line) => {
      if (category === 'perbaikan_alat') {
        const damage = damageReferenceOptions.find((option) => option.value === line.damageLogId);
        return { ...line, maintenanceSettingIds: [], relatedType: 'damage', relatedId: line.damageLogId, relatedLabel: damage?.label || null };
      }
      if (category === 'servis_rutin') {
        const aspects = aspectsForUnit(line.equipmentItemId).filter((metric) => line.maintenanceSettingIds.includes(String(metric.id))).map((metric) => ({ settingId: String(metric.id), name: metric.name }));
        return { ...line, maintenanceAspects: aspects, relatedType: 'maintenance', relatedId: null, relatedLabel: `Servis: ${aspects.map((aspect) => aspect.name).join(', ')}` };
      }
      return { ...line, maintenanceSettingIds: [], relatedType: null, relatedId: null, relatedLabel: null, equipmentItemId: '', equipmentAssetCode: '' };
    });

    setSaving(true);
    try {
      const created = await createPurchaseOrderRequest({
        date,
        category,
        purpose: lines[0].itemName,
        items,
        notes: '',
        // Unit & aspek disimpan per item; level order dibiarkan kosong.
        equipmentItemId: null,
        maintenanceSettingIds: [],
        maintenanceAspects: [],
      });
      recordActivity({
        module: 'Purchase Order',
        action: 'Purchase request diajukan',
        description: `${created?.orderCode || 'Purchase request'} · ${categoryLabel(category)} · ${lines.length} item · Rp ${estimatedTotal.toLocaleString('id-ID')}`,
        ref: `alat/purchase-orders/${created?.id || ''}`,
      });
      sessionStorage.setItem('purchase-order-notice', 'Purchase request berhasil diajukan.');
      navigate('alat/purchase-orders');
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  };

  const categoryNote = {
    perbaikan_alat: 'Setiap barang wajib terhubung ke damage log dari halaman Information dan boleh berbeda antar barang. Setelah PO approved, damage log diselesaikan dari halaman detail damage log dengan memilih PO ini.',
    servis_rutin: 'Setiap barang memilih unit dan aspek maintenance sendiri. Setelah PO approved, aspek terpilih bisa di-reset di halaman Maintenance dengan memilih PO ini.',
    stok_gudang: 'Pengadaan stok gudang tidak memerlukan referensi kerusakan, maintenance, maupun equipment unit. Cukup isi daftar barang di bawah.',
  }[category];

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/purchase-orders" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBackToPurchaseOrders} className="hover:text-slate-800">Purchase Orders</button><span>/</span><span className="font-semibold text-slate-900">Input Purchase Order Baru</span></nav>
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Input Purchase Order Baru</h1><p className="mt-1 text-xs text-slate-500">Resource Management Workflow · pilih kategori, lalu tambahkan beberapa barang dalam kategori yang sama</p></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {loading && <div className="card-panel p-8 text-center text-sm text-slate-500">Memuat referensi equipment, damage, dan maintenance...</div>}
          {!loading && <form onSubmit={handleSubmit} className="space-y-5">
            <section className="card-panel space-y-5 p-5">
              <div><label htmlFor="po-request-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal</label><input id="po-request-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-control mt-1 max-w-xs" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Kategori Purchase Order <span className="text-red-500">*</span></p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">{PO_CATEGORIES.map((option) => <button key={option.value} type="button" onClick={() => handleCategoryChange(option.value)} aria-pressed={category === option.value} className={`rounded-lg border px-3 py-3 text-left transition ${category === option.value ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500' : 'border-slate-200 hover:border-slate-300'}`}><span className={`block text-xs font-bold ${category === option.value ? 'text-teal-800' : 'text-slate-700'}`}>{option.icon} {option.label}</span><span className="mt-1 block text-[11px] leading-snug text-slate-500">{option.description}</span></button>)}</div>
              </div>
            </section>

            {!category && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">Pilih kategori purchase order terlebih dahulu untuk mulai menambahkan barang.</div>}
            {category && <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">{categoryNote}</div>}

            {category && <>
              {lines.map((line, index) => {
                const lineAspects = category === 'servis_rutin' ? aspectsForUnit(line.equipmentItemId) : [];
                return <section key={line.id} className="card-panel space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3"><div className="flex items-center gap-2"><span className="rounded bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">ITEM {index + 1}</span><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{categoryLabel(category)}</span>{category !== 'stok_gudang' && line.equipmentAssetCode && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{line.equipmentAssetCode}</span>}</div>{lines.length > 1 && <button type="button" onClick={() => removeLine(line.id)} className="text-xs text-red-600">Hapus item</button>}</div>
                  <div className="grid gap-4 sm:grid-cols-2"><div><label className="block text-xs font-semibold text-slate-600">Jenis Item</label><select value={line.itemType} onChange={(event) => updateLine(line.id, 'itemType', event.target.value)} className="input-control mt-1 text-xs">{ITEM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div><label className="block text-xs font-semibold text-slate-600">Nama Barang</label><input value={line.itemName} onChange={(event) => updateLine(line.id, 'itemName', event.target.value)} className="input-control mt-1 text-xs" placeholder={category === 'servis_rutin' ? 'Contoh: Oli mesin SAE 15W-40' : 'Contoh: Selang hidrolik utama'} /></div></div>
                  {category === 'perbaikan_alat' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ComboboxSelect
                        id={`po-damage-log-${line.id}`}
                        label="Referensi Damage Log"
                        required
                        value={line.damageLogId}
                        onChange={(value) => handleLineDamageChange(line, value)}
                        options={damageReferenceOptions}
                        placeholder="Cari kode log atau deskripsi kerusakan..."
                        emptyText="Tidak ada damage log berstatus reported."
                        hint={line.damageLogId ? 'Equipment unit terisi otomatis dari damage log ini.' : 'Pilih damage log agar equipment unit terisi otomatis.'}
                      />
                      <ComboboxSelect
                        id={`po-equipment-${line.id}`}
                        label="Equipment Unit"
                        value={line.equipmentItemId}
                        onChange={(value) => handleLineEquipmentChange(line, value)}
                        options={equipmentOptions}
                        disabled={Boolean(line.damageLogId)}
                        placeholder="Cari asset code, brand, atau model..."
                        lockedNote={line.damageLogId ? 'Otomatis mengikuti damage log yang dipilih.' : undefined}
                      />
                    </div>
                  )}
                  {category === 'servis_rutin' && (
                    <div className="space-y-3">
                      <div className="max-w-md">
                        <ComboboxSelect
                          id={`po-maintenance-unit-${line.id}`}
                          label="Equipment Unit"
                          required
                          value={line.equipmentItemId}
                          onChange={(value) => handleLineMaintenanceUnitChange(line, value)}
                          options={maintenanceUnitOptions}
                          placeholder="Cari asset code atau aspek maintenance..."
                          emptyText="Belum ada unit dengan konfigurasi maintenance."
                          hint="Hanya unit yang memiliki pengaturan maintenance yang dapat dipilih."
                        />
                      </div>
                      {line.equipmentItemId && (
                        <div>
                          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-600">Aspek Maintenance <span className="text-red-500">*</span> <span className="font-normal text-slate-400">({line.maintenanceSettingIds.length} dipilih)</span></p>{lineAspects.length > 0 && <button type="button" onClick={() => toggleAllLineAspects(line, lineAspects)} className="text-xs font-semibold text-teal-700 hover:text-teal-900">{line.maintenanceSettingIds.length === lineAspects.length ? 'Batalkan semua' : 'Pilih semua'}</button>}</div>
                          {lineAspects.length === 0 ? <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Unit ini belum memiliki aspek maintenance aktif.</div> : (
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">{lineAspects.map((metric) => {
                              const id = String(metric.id);
                              const checked = line.maintenanceSettingIds.includes(id);
                              const status = metric.status || 'normal';
                              return <label key={id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition ${checked ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><span className="flex items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggleLineAspect(line, id)} className="h-4 w-4 rounded border-slate-300 text-teal-600" /><span><span className="block text-xs font-bold text-slate-900">{metric.name}</span><span className="block font-mono text-[11px] text-slate-500">{metric.current} / {metric.threshold} hrs</span></span></span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${metricStatusStyles[status] || metricStatusStyles.normal}`}>{metricStatusLabels[status] || status}</span></label>;
                            })}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3"><div><label className="block text-xs font-semibold text-slate-600">Qty</label><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, 'quantity', event.target.value)} className="input-control mt-1 text-xs" /></div><div><label className="block text-xs font-semibold text-slate-600">Satuan</label><input value={line.unit} onChange={(event) => updateLine(line.id, 'unit', event.target.value)} className="input-control mt-1 text-xs" placeholder="unit / drum / liter" /></div><div><label className="block text-xs font-semibold text-slate-600">Estimasi Harga Satuan</label><input type="number" min="0" value={line.estimatedUnitPrice} onChange={(event) => updateLine(line.id, 'estimatedUnitPrice', event.target.value)} className="input-control mt-1 text-xs" placeholder="Contoh: 850000" /></div></div>
                  <p className="text-right text-xs text-slate-500">Estimasi total item: <strong className="text-slate-800">Rp {(Number(line.quantity) * Number(line.estimatedUnitPrice || 0)).toLocaleString('id-ID')}</strong></p>
                </section>;
              })}
              <button type="button" onClick={addLine} className="btn btn-secondary w-full text-xs">+ Tambah Barang ({categoryLabel(category)})</button>
              <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800"><p className="font-bold">✓ Kategori kas: Perbatim Alat</p><p className="mt-1">Semua item dalam request ini otomatis masuk ke Kas Alat setelah purchase request disetujui.</p><p className="mt-2 font-bold">Total estimasi PR: Rp {estimatedTotal.toLocaleString('id-ID')} · {lines.length} item · {categoryLabel(category)}</p></section>
            </>}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={onBackToPurchaseOrders} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving || !canCreate || !category} className="btn btn-primary">{saving ? 'Mengirim...' : '▷ Kirim Permintaan PO'}</button></div>
          </form>}
        </div>
      </main>
    </div>
  );
}
