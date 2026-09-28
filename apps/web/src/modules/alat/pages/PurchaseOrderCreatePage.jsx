import { useEffect, useMemo, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ComboboxSelect from '../../../components/ComboboxSelect.jsx';
import { getAllItems } from '../services/alatService.js';
import { getDamageLogs } from '../information/services/informationService.js';
import { getMaintenanceOverview } from '../services/maintenanceService.js';
import { createPurchaseOrderRequest, ITEM_TYPE_OPTIONS } from '../services/purchaseOrderService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';

function todayDate() { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10); }

const RELATED_CATEGORIES = [
  { value: 'repair_service', label: '🔧 Repair / Service' },
  { value: 'maintenance', label: '🗓️ Maintenance' },
  { value: 'stock_gudang', label: '📦 Stock Gudang' },
];
const CATEGORY_TO_REFERENCE = { repair_service: 'damage', maintenance: 'maintenance' };
const newLine = (id) => ({ id, itemType: 'sparepart', itemName: '', category: 'repair_service', relatedType: 'damage', relatedId: '', equipmentItemId: '', equipmentAssetCode: '', quantity: 1, unit: 'unit', estimatedUnitPrice: '' });

export default function PurchaseOrderCreatePage({ onBackToModules, onBackToPurchaseOrders, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [date, setDate] = useState(todayDate);
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
      setMaintenanceRows(maintenanceResult.status === 'fulfilled' ? maintenanceResult.value.data || [] : [{ id: 'demo-maintenance-1', itemCode: 'SSB-EXC-002', itemName: '[DEMO] Oli Mesin', status: 'due' }]);
      setEquipmentItems(itemResult.status === 'fulfilled' ? itemResult.value.data || [] : []);
      const preselect = sessionStorage.getItem('po-preselect-damage');
      if (preselect) {
        sessionStorage.removeItem('po-preselect-damage');
        try {
          const parsed = JSON.parse(preselect);
          if (parsed.damageLogId) {
            setLines((current) => current.map((line, index) => (index === 0 ? { ...line, relatedType: 'damage', relatedId: String(parsed.damageLogId), equipmentItemId: parsed.equipmentItemId ? String(parsed.equipmentItemId) : '', equipmentAssetCode: parsed.assetCode || '' } : line)));
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

  const maintenanceReferenceOptions = useMemo(() => maintenanceRows.flatMap((row) => Object.values(row.metrics || {}).map((setting) => ({
    value: String(setting.id),
    label: `${row.itemCode || 'Maintenance'} · ${setting.name || row.itemName || 'Jadwal'}`,
    meta: `${setting.current ?? 0} / ${setting.threshold ?? 0} hrs`,
    keywords: [row.itemCode, setting.name, row.itemName, setting.status].filter(Boolean),
    equipmentItemId: row.id,
    equipmentAssetCode: row.itemCode || '',
  }))), [maintenanceRows]);

  const equipmentOptions = useMemo(() => equipmentItems.map((item) => ({
    value: String(item.id),
    label: item.itemCode || item.assetCode || `Item ${item.id}`,
    meta: [item.jenis, item.merk, item.typeModel].filter(Boolean).join(' · '),
    keywords: [item.brand, item.model, item.jenis, item.equipmentType?.typeName, item.assetCode].filter(Boolean),
    equipmentAssetCode: item.itemCode || item.assetCode || '',
  })), [equipmentItems]);

  const referenceOptions = (line) => (line.relatedType === 'maintenance' ? maintenanceReferenceOptions : damageReferenceOptions);
  const needsReference = (line) => ['sparepart', 'service'].includes(line.itemType) && line.category !== 'stock_gudang';

  const patchLine = (id, patch) => setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  const handleReferenceChange = (line, value) => {
    const selected = referenceOptions(line).find((option) => option.value === value);
    patchLine(line.id, {
      relatedId: value,
      equipmentItemId: selected?.equipmentItemId ? String(selected.equipmentItemId) : '',
      equipmentAssetCode: selected?.equipmentAssetCode || '',
    });
  };

  const handleEquipmentChange = (line, value) => {
    const selected = equipmentOptions.find((option) => option.value === value);
    patchLine(line.id, { equipmentItemId: value, equipmentAssetCode: selected?.equipmentAssetCode || '' });
  };

  const handleCategoryChange = (line, category) => {
    patchLine(line.id, {
      category,
      relatedType: CATEGORY_TO_REFERENCE[category] || 'damage',
      relatedId: '',
      equipmentItemId: '',
      equipmentAssetCode: '',
    });
  };

  const handleEquipmentOnlyChange = (line, value) => {
    const selected = equipmentOptions.find((option) => option.value === value);
    patchLine(line.id, { equipmentItemId: value, equipmentAssetCode: selected?.equipmentAssetCode || '' });
  };

  const estimatedTotal = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.estimatedUnitPrice) || 0), 0), [lines]);
  const categorySummary = useMemo(() => [...new Set(lines.map((line) => ITEM_TYPE_OPTIONS.find((option) => option.value === line.itemType)?.label || line.itemType))].join(' & '), [lines]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) { setError('Anda tidak memiliki izin membuat purchase request.'); return; }
    const invalid = lines.find((line) => !line.itemName.trim() || Number(line.quantity) <= 0 || Number(line.estimatedUnitPrice) <= 0);
    if (invalid) { setError('Nama barang, qty, dan estimasi harga harus diisi untuk setiap item.'); return; }
    const withoutReference = lines.find((line) => needsReference(line) && !line.relatedId);
    if (withoutReference) { setError(`Item "${withoutReference.itemName}" wajib terhubung ke damage log atau jadwal maintenance sesuai kategorinya. Buat log kerusakan atau jadwal maintenance terlebih dahulu sebelum mengajukan purchase order.`); return; }
    setSaving(true);
    try {
      const created = await createPurchaseOrderRequest({ date, purpose: lines[0].itemName, items: lines, notes: '' });
      recordActivity({
        module: 'Purchase Order',
        action: 'Purchase request diajukan',
        description: `${created?.orderCode || 'Purchase request'} · ${lines.length} item · Rp ${estimatedTotal.toLocaleString('id-ID')}`,
        ref: `alat/purchase-orders/${created?.id || ''}`,
      });
      sessionStorage.setItem('purchase-order-notice', 'Purchase request berhasil diajukan.');
      navigate('alat/purchase-orders');
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/purchase-orders" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBackToPurchaseOrders} className="hover:text-slate-800">Purchase Orders</button><span>/</span><span className="font-semibold text-slate-900">Input Purchase Order Baru</span></nav>
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Input Purchase Order Baru</h1><p className="mt-1 text-xs text-slate-500">Resource Management Workflow · request multi item, kategori kas otomatis</p></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {loading && <div className="card-panel p-8 text-center text-sm text-slate-500">Memuat referensi equipment, damage, dan maintenance...</div>}
          {!loading && <form onSubmit={handleSubmit} className="space-y-5">
            <section className="card-panel p-5"><label htmlFor="po-request-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal</label><input id="po-request-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-control mt-1 max-w-xs" /></section>
            {lines.map((line, index) => <section key={line.id} className="card-panel space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3"><div className="flex items-center gap-2"><span className="rounded bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">ITEM {index + 1}</span><span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Perbatim Alat</span></div>{lines.length > 1 && <button type="button" onClick={() => removeLine(line.id)} className="text-xs text-red-600">Hapus item</button>}</div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className="block text-xs font-semibold text-slate-600">Jenis Item</label><select value={line.itemType} onChange={(event) => updateLine(line.id, 'itemType', event.target.value)} className="input-control mt-1 text-xs">{ITEM_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div><label className="block text-xs font-semibold text-slate-600">Nama Barang</label><input value={line.itemName} onChange={(event) => updateLine(line.id, 'itemName', event.target.value)} className="input-control mt-1 text-xs" placeholder="Contoh: Selang hidrolik utama" /></div></div>
              <div><p className="text-xs font-semibold text-slate-600">Terkait Dengan {needsReference(line) ? <span className="text-red-500">* wajib</span> : <span className="font-normal text-slate-400">(opsional)</span>}</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{RELATED_CATEGORIES.map((category) => <button key={category.value} type="button" onClick={() => handleCategoryChange(line, category.value)} className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${line.category === category.value ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{category.label}</button>)}</div></div>
              {line.category !== 'stock_gudang' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ComboboxSelect
                    id={`po-reference-${line.id}`}
                    label={line.relatedType === 'damage' ? 'Referensi Damage Log' : 'Referensi Maintenance'}
                    required={needsReference(line)}
                    value={line.relatedId}
                    onChange={(value) => handleReferenceChange(line, value)}
                    options={referenceOptions(line)}
                    placeholder={line.relatedType === 'damage' ? 'Cari kode log atau deskripsi kerusakan...' : 'Cari unit atau aspek maintenance...'}
                    hint={line.relatedId ? 'Equipment unit terisi otomatis dari referensi ini.' : 'Pilih referensi agar equipment unit terisi otomatis.'}
                  />
                  <ComboboxSelect
                    id={`po-equipment-${line.id}`}
                    label="Equipment Unit"
                    value={line.equipmentItemId}
                    onChange={(value) => handleEquipmentChange(line, value)}
                    options={equipmentOptions}
                    disabled={Boolean(line.relatedId)}
                    placeholder="Cari asset code, brand, atau model..."
                    lockedNote={line.relatedId ? 'Otomatis mengikuti referensi yang dipilih.' : undefined}
                    hint="Bisa dipilih manual bila tidak memakai referensi."
                  />
                </div>
              )}
              {line.category === 'stock_gudang' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">Pengadaan stok gudang tidak memerlukan referensi kerusakan atau maintenance. Isi nama barang, qty, dan estimasi harga.</div>
                  <ComboboxSelect
                    id={`po-equipment-${line.id}`}
                    label="Equipment Unit (opsional)"
                    value={line.equipmentItemId}
                    onChange={(value) => handleEquipmentOnlyChange(line, value)}
                    options={equipmentOptions}
                    placeholder="Cari asset code, brand, atau model..."
                    hint="Kosongkan bila barang dipakai untuk kebutuhan umum."
                  />
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3"><div><label className="block text-xs font-semibold text-slate-600">Qty</label><input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, 'quantity', event.target.value)} className="input-control mt-1 text-xs" /></div><div><label className="block text-xs font-semibold text-slate-600">Satuan</label><input value={line.unit} onChange={(event) => updateLine(line.id, 'unit', event.target.value)} className="input-control mt-1 text-xs" placeholder="unit / drum / liter" /></div><div><label className="block text-xs font-semibold text-slate-600">Estimasi Harga Satuan</label><input type="number" min="0" value={line.estimatedUnitPrice} onChange={(event) => updateLine(line.id, 'estimatedUnitPrice', event.target.value)} className="input-control mt-1 text-xs" placeholder="Contoh: 850000" /></div></div>
              <p className="text-right text-xs text-slate-500">Estimasi total item: <strong className="text-slate-800">Rp {(Number(line.quantity) * Number(line.estimatedUnitPrice || 0)).toLocaleString('id-ID')}</strong></p>
            </section>)}
            <button type="button" onClick={addLine} className="btn btn-secondary w-full text-xs">+ Tambah Barang</button>
            <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800"><p className="font-bold">✓ Kategori kas: Perbatim Alat</p><p className="mt-1">Semua item dalam request ini otomatis masuk ke Kas Alat setelah purchase request disetujui.</p><p className="mt-2 font-bold">Total estimasi PR: Rp {estimatedTotal.toLocaleString('id-ID')} · {categorySummary}</p></section>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={onBackToPurchaseOrders} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving || !canCreate} className="btn btn-primary">{saving ? 'Mengirim...' : '▷ Kirim Permintaan PO'}</button></div>
          </form>}
        </div>
      </main>
    </div>
  );
}
