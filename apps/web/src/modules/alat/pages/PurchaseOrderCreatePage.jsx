import { useEffect, useMemo, useRef, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ComboboxSelect from '../../../components/ComboboxSelect.jsx';
import { getDamageLogs } from '../information/services/informationService.js';
import { getMaintenanceOverview } from '../services/maintenanceService.js';
import { categoryLabel, createPurchaseOrderRequest } from '../services/purchaseOrderService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';

function todayDate() { const date = new Date(); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10); }

/**
 * Kategori order mengikuti endpoint purchase request. Backend menyimpan item
 * per kategori dengan bentuk berbeda, jadi satu order hanya boleh satu
 * kategori: repair (damage log + jasa/sparepart), maintenance (setting + harga),
 * atau stock (barang + qty + harga).
 */
const PO_CATEGORIES = [
  { value: 'repair', icon: '🔧', label: 'Repair / Service', description: 'Satu item = satu damage log. Biaya jasa hanya untuk mekanik external, sparepart hanya untuk sumber supplier.' },
  { value: 'maintenance', icon: '🗓️', label: 'Maintenance', description: 'Satu item = satu aspek maintenance yang sudah mendekati atau lewat jatuh tempo.' },
  { value: 'stock', icon: '📦', label: 'Stock Gudang', description: 'Pengadaan stok gudang: nama barang, jumlah, dan estimasi harga.' },
];

// Backend menolak order maintenance untuk setting yang belum mendekati jatuh tempo.
const SERVICEABLE_STATUSES = ['warning', 'due', 'overdue'];

const metricStatusStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};
const metricStatusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due Soon', overdue: 'Alert', inactive: 'Inactive' };

const newLine = (id) => ({ id, damageLogId: '', equipmentItemId: '', equipmentAssetCode: '', serviceFee: '', spareparts: [], maintenanceSettingIds: [], aspectPrices: {}, estimatedUnitPrice: '', itemName: '', quantity: 1 });
const newSparepart = (id) => ({ id, itemName: '', quantity: 1, estimatedUnitPrice: '' });

export default function PurchaseOrderCreatePage({ onBackToModules, onBackToPurchaseOrders, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [date, setDate] = useState(todayDate);
  const [category, setCategory] = useState('');
  const [lines, setLines] = useState([newLine(1)]);
  const [damageLogs, setDamageLogs] = useState([]);
  const [maintenanceRows, setMaintenanceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canCreate = hasPermission('purchase-request:create');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [damageResult, maintenanceResult] = await Promise.allSettled([
        getDamageLogs({ status: 'reported', limit: 100 }),
        getMaintenanceOverview(),
      ]);
      if (cancelled) return;
      setDamageLogs(damageResult.status === 'fulfilled' ? damageResult.value.data || [] : []);
      setMaintenanceRows(maintenanceResult.status === 'fulfilled' ? maintenanceResult.value.data || [] : []);
      const preselect = sessionStorage.getItem('po-preselect-damage');
      if (preselect) {
        sessionStorage.removeItem('po-preselect-damage');
        try {
          const parsed = JSON.parse(preselect);
          if (parsed.damageLogId) {
            setCategory('repair');
            setLines((current) => current.map((line, index) => (index === 0
              ? { ...line, damageLogId: String(parsed.damageLogId), equipmentItemId: parsed.equipmentItemId ? String(parsed.equipmentItemId) : '', equipmentAssetCode: parsed.assetCode || '' }
              : line)));
          }
        } catch { /* ignore malformed preselect payload */ }
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const lineCounter = useRef(1);
  const nextLineId = () => { lineCounter.current += 1; return lineCounter.current; };

  const patchLine = (id, patch) => setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const addLine = () => setLines((current) => [...current, newLine(nextLineId())]);
  const removeLine = (id) => setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));

  const damageReferenceOptions = useMemo(() => damageLogs.map((log) => ({
    value: String(log.id),
    label: `${log.damageCode || 'Damage'} · ${log.description || 'Laporan kerusakan'}`,
    meta: `${log.equipmentItem?.assetCode || '-'} · sparepart ${log.sparePartSource || '-'} · mekanik ${log.mechanicTeam || '-'}`,
    keywords: [log.description, log.damageCode, log.equipmentItem?.assetCode, log.sparePartSource, log.mechanicTeam].filter(Boolean),
    equipmentItemId: log.equipmentItemId || log.equipmentItem?.id || null,
    equipmentAssetCode: log.equipmentItem?.assetCode || '',
    sparePartSource: log.sparePartSource,
    mechanicTeam: log.mechanicTeam,
  })), [damageLogs]);

  const maintenanceUnitOptions = useMemo(() => maintenanceRows.map((row) => ({
    value: String(row.id),
    label: row.itemCode || `Item ${row.id}`,
    meta: `${row.itemName || 'Equipment'} · ${Object.keys(row.metrics || {}).length} aspek`,
    keywords: [row.itemName, ...Object.keys(row.metrics || {})].filter(Boolean),
    equipmentAssetCode: row.itemCode || '',
  })), [maintenanceRows]);

  const aspectsForUnit = (unitId) => Object.values(maintenanceRows.find((row) => String(row.id) === String(unitId))?.metrics || {});
  const serviceableAspectsForUnit = (unitId) => aspectsForUnit(unitId).filter((metric) => SERVICEABLE_STATUSES.includes(metric.status));

  const usedDamageLogIds = lines.map((line) => line.damageLogId).filter(Boolean);

  const handleCategoryChange = (value) => {
    if (value === category) return;
    setCategory(value);
    setLines([newLine(nextLineId())]);
    setError('');
  };

  const handleLineDamageChange = (line, value) => {
    const selected = damageReferenceOptions.find((option) => option.value === value);
    patchLine(line.id, {
      damageLogId: value,
      equipmentItemId: selected?.equipmentItemId ? String(selected.equipmentItemId) : '',
      equipmentAssetCode: selected?.equipmentAssetCode || '',
      serviceFee: selected?.mechanicTeam === 'external' ? line.serviceFee : '',
      spareparts: selected?.sparePartSource === 'supplier' ? line.spareparts : [],
    });
  };

  const handleLineMaintenanceUnitChange = (line, value) => {
    const selected = maintenanceUnitOptions.find((option) => option.value === value);
    patchLine(line.id, { equipmentItemId: value, equipmentAssetCode: selected?.equipmentAssetCode || '', maintenanceSettingIds: [], aspectPrices: {} });
  };

  // Setiap aspek yang dicentang punya harga sendiri — backend menyimpan satu
  // baris maintenanceItems per setting, jadi harga harus per aspek, bukan satu
  // harga yang dipakai bersama.
  const toggleLineAspect = (line, id) => {
    const isSelected = line.maintenanceSettingIds.includes(id);
    patchLine(line.id, {
      maintenanceSettingIds: isSelected ? line.maintenanceSettingIds.filter((item) => item !== id) : [...line.maintenanceSettingIds, id],
      aspectPrices: isSelected ? line.aspectPrices : { ...line.aspectPrices, [id]: line.aspectPrices[id] ?? '' },
    });
  };

  const toggleAllLineAspects = (line) => {
    const serviceable = serviceableAspectsForUnit(line.equipmentItemId);
    const isAllSelected = line.maintenanceSettingIds.length === serviceable.length;
    if (isAllSelected) {
      patchLine(line.id, { maintenanceSettingIds: [] });
      return;
    }
    const aspectPrices = { ...line.aspectPrices };
    serviceable.forEach((metric) => { if (aspectPrices[String(metric.id)] === undefined) aspectPrices[String(metric.id)] = ''; });
    patchLine(line.id, { maintenanceSettingIds: serviceable.map((metric) => String(metric.id)), aspectPrices });
  };

  const patchAspectPrice = (line, settingId, value) => patchLine(line.id, { aspectPrices: { ...line.aspectPrices, [settingId]: value } });

  const addSparepart = (line) => patchLine(line.id, { spareparts: [...line.spareparts, newSparepart(nextLineId())] });
  const removeSparepart = (line, sparepartId) => patchLine(line.id, { spareparts: line.spareparts.filter((sp) => sp.id !== sparepartId) });
  const patchSparepart = (line, sparepartId, patch) => patchLine(line.id, { spareparts: line.spareparts.map((sp) => (sp.id === sparepartId ? { ...sp, ...patch } : sp)) });

  /** Bentuk item ternormalisasi sesuai kategori — ini yang dikirim ke service. */
  const buildItems = () => {
    if (category === 'repair') {
      return lines.map((line) => ({
        relatedType: 'damage',
        relatedId: line.damageLogId,
        relatedLabel: damageReferenceOptions.find((option) => option.value === line.damageLogId)?.label || null,
        serviceFee: Number(line.serviceFee || 0),
        spareparts: line.spareparts.map((sp) => ({ itemName: sp.itemName, quantity: Number(sp.quantity || 0), estimatedUnitPrice: Number(sp.estimatedUnitPrice || 0) })),
      }));
    }

    if (category === 'maintenance') {
      return lines.flatMap((line) => line.maintenanceSettingIds.map((settingId) => {
        const metric = aspectsForUnit(line.equipmentItemId).find((aspect) => String(aspect.id) === String(settingId));
        return {
          relatedType: 'maintenance',
          relatedId: settingId,
          relatedLabel: metric ? `${metric.name} · ${line.equipmentAssetCode}` : null,
          itemName: metric?.name || 'Maintenance',
          equipmentItemId: line.equipmentItemId,
          equipmentAssetCode: line.equipmentAssetCode,
          estimatedUnitPrice: Number(line.aspectPrices[settingId] || 0),
        };
      }));
    }

    return lines.map((line) => ({ itemName: line.itemName, quantity: Number(line.quantity || 0), estimatedUnitPrice: Number(line.estimatedUnitPrice || 0) }));
  };

  const estimatedTotal = useMemo(() => {
    if (category === 'repair') {
      return lines.reduce((sum, line) => sum + Number(line.serviceFee || 0)
        + line.spareparts.reduce((s, sp) => s + Number(sp.quantity || 0) * Number(sp.estimatedUnitPrice || 0), 0), 0);
    }
    if (category === 'stock') {
      return lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.estimatedUnitPrice || 0), 0);
    }
    return lines.reduce((sum, line) => sum + line.maintenanceSettingIds.reduce((s, settingId) => s + Number(line.aspectPrices[settingId] || 0), 0), 0);
  }, [category, lines]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canCreate) { setError('Anda tidak memiliki izin purchase-request:create.'); return; }
    if (!category) { setError('Pilih kategori purchase order terlebih dahulu.'); return; }

    if (category === 'repair') {
      const missing = lines.findIndex((line) => !line.damageLogId);
      if (missing >= 0) { setError(`Item ${missing + 1} wajib terhubung ke damage log. Buat log kerusakan di halaman Information bila belum ada.`); return; }
      if (new Set(usedDamageLogIds).size !== usedDamageLogIds.length) { setError('Satu kerusakan hanya boleh muncul sekali dalam satu order.'); return; }
      const empty = lines.findIndex((line) => {
        const log = damageReferenceOptions.find((option) => option.value === line.damageLogId);
        const spareparts = log?.sparePartSource === 'supplier' ? line.spareparts : [];
        const hasSpareparts = spareparts.length > 0 && spareparts.every((sp) => sp.itemName.trim() && Number(sp.quantity) > 0 && Number(sp.estimatedUnitPrice) >= 0);
        const feeAllowed = log?.mechanicTeam === 'external';
        return !hasSpareparts && !(feeAllowed && Number(line.serviceFee || 0) > 0);
      });
      if (empty >= 0) { setError(`Item ${empty + 1} belum punya biaya jasa maupun sparepart yang diajukan.`); return; }
      const badFee = lines.findIndex((line) => {
        const log = damageReferenceOptions.find((option) => option.value === line.damageLogId);
        return log?.mechanicTeam !== 'external' && Number(line.serviceFee || 0) > 0;
      });
      if (badFee >= 0) { setError(`Item ${badFee + 1}: mekanik internal, jadi biaya jasa harus 0.`); return; }
    }

    if (category === 'maintenance') {
      const noUnit = lines.findIndex((line) => !line.equipmentItemId);
      if (noUnit >= 0) { setError(`Pilih equipment unit untuk item ${noUnit + 1}.`); return; }
      const noAspect = lines.findIndex((line) => !line.maintenanceSettingIds.length);
      if (noAspect >= 0) { setError(`Pilih minimal satu aspek maintenance untuk item ${noAspect + 1}.`); return; }
      const missingPrice = lines
        .flatMap((line, lineIndex) => line.maintenanceSettingIds
          .filter((settingId) => line.aspectPrices[settingId] === '' || line.aspectPrices[settingId] === undefined || Number.isNaN(Number(line.aspectPrices[settingId])))
          .map((settingId) => {
            const metric = aspectsForUnit(line.equipmentItemId).find((aspect) => String(aspect.id) === String(settingId));
            return { lineIndex, name: metric?.name || `aspek #${settingId}` };
          }))
        .sort((a, b) => a.lineIndex - b.lineIndex)[0];
      if (missingPrice) { setError(`Isi estimasi harga untuk "${missingPrice.name}" di item ${missingPrice.lineIndex + 1}. Tiap aspek punya harga sendiri.`); return; }
      const negative = lines
        .flatMap((line, lineIndex) => line.maintenanceSettingIds
          .filter((settingId) => Number(line.aspectPrices[settingId] || 0) < 0)
          .map((settingId) => {
            const metric = aspectsForUnit(line.equipmentItemId).find((aspect) => String(aspect.id) === String(settingId));
            return { lineIndex, name: metric?.name || `aspek #${settingId}` };
          }))[0];
      if (negative) { setError(`Estimasi harga "${negative.name}" di item ${negative.lineIndex + 1} tidak boleh negatif.`); return; }
    }

    if (category === 'stock') {
      const invalid = lines.findIndex((line) => !line.itemName.trim() || Number(line.quantity) <= 0 || Number(line.estimatedUnitPrice) < 0);
      if (invalid >= 0) { setError(`Item ${invalid + 1}: nama barang, jumlah, dan estimasi harga wajib diisi.`); return; }
    }

    setSaving(true);
    setError('');
    try {
      const created = await createPurchaseOrderRequest({ date, category, items: buildItems() });
      const warning = created?.balanceWarning?.message;
      recordActivity({
        module: 'Purchase Order',
        action: 'Purchase request diajukan',
        description: `${created?.orderCode || 'Purchase request'} · ${categoryLabel(category)} · ${buildItems().length} item · Rp ${estimatedTotal.toLocaleString('id-ID')}`,
        ref: `alat/purchase-orders/${created?.id || ''}`,
      });
      sessionStorage.setItem('purchase-order-notice', warning
        ? `${created.orderCode} diajukan. Perhatian: ${warning}`
        : `${created.orderCode} berhasil diajukan dan menunggu validasi Admin.`);
      onBackToPurchaseOrders();
    } catch (requestError) {
      setError(requestError.message);
      setSaving(false);
    }
  };

  const categoryNote = {
    repair: 'Satu item untuk satu damage log. Biaya jasa hanya diisi bila memakai mekanik external, dan sparepart hanya diisi bila sumber sparepart dari supplier.',
    maintenance: 'Satu item untuk satu aspek maintenance. Hanya aspek berstatus warning / due / overdue yang dapat diajukan, dan setiap aspek punya estimasi harganya sendiri.',
    stock: 'Pengadaan stok gudang tidak memerlukan referensi kerusakan maupun maintenance.',
  }[category];

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/purchase-orders" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBackToPurchaseOrders} className="hover:text-slate-800">Purchase Orders</button><span>/</span><span className="font-semibold text-slate-900">Input Purchase Order Baru</span></nav>
          <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Input Purchase Order Baru</h1><p className="mt-1 text-xs text-slate-500">Pilih satu kategori, lalu tambahkan item dalam kategori itu</p></div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {loading && <div className="card-panel p-8 text-center text-sm text-slate-500">Memuat referensi damage log dan maintenance...</div>}
          {!loading && <form onSubmit={handleSubmit} className="space-y-5">
            <section className="card-panel space-y-5 p-5">
              <div><label htmlFor="po-request-date" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Tanggal Pengajuan</label><input id="po-request-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-control mt-1 max-w-xs" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Kategori Purchase Order <span className="text-red-500">*</span></p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">{PO_CATEGORIES.map((option) => <button key={option.value} type="button" onClick={() => handleCategoryChange(option.value)} aria-pressed={category === option.value} className={`rounded-lg border px-3 py-3 text-left transition ${category === option.value ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500' : 'border-slate-200 hover:border-slate-300'}`}><span className={`block text-xs font-bold ${category === option.value ? 'text-teal-800' : 'text-slate-700'}`}>{option.icon} {option.label}</span><span className="mt-1 block text-[11px] leading-snug text-slate-500">{option.description}</span></button>)}</div>
              </div>
            </section>

            {!category && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">Pilih kategori purchase order terlebih dahulu untuk mulai menambahkan item.</div>}
            {category && <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-500">{categoryNote}</div>}

            {category && <>
              {lines.map((line, index) => {
                const selectedLog = damageReferenceOptions.find((option) => option.value === line.damageLogId);
                const lineAspects = category === 'maintenance' ? aspectsForUnit(line.equipmentItemId) : [];
                const lineServiceable = category === 'maintenance' ? serviceableAspectsForUnit(line.equipmentItemId) : [];
                return (
                  <section key={line.id} className="card-panel space-y-4 p-5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">ITEM {index + 1}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{categoryLabel(category)}</span>
                        {line.equipmentAssetCode && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">{line.equipmentAssetCode}</span>}
                      </div>
                      {lines.length > 1 && <button type="button" onClick={() => removeLine(line.id)} className="text-xs text-red-600">Hapus item</button>}
                    </div>

                    {category === 'repair' && (
                      <>
                        <ComboboxSelect
                          id={`po-damage-log-${line.id}`}
                          label="Referensi Damage Log"
                          required
                          value={line.damageLogId}
                          onChange={(value) => handleLineDamageChange(line, value)}
                          options={damageReferenceOptions.map((option) => ({ ...option, meta: usedDamageLogIds.includes(option.value) && option.value !== line.damageLogId ? `${option.meta} · sudah dipakai` : option.meta }))}
                          placeholder="Cari kode log atau deskripsi kerusakan..."
                          emptyText="Tidak ada damage log berstatus reported."
                          hint={selectedLog ? `Equipment terisi otomatis: ${selectedLog.equipmentAssetCode || '-'} · sparepart ${selectedLog.sparePartSource} · mekanik ${selectedLog.mechanicTeam}` : 'Pilih damage log agar equipment terisi otomatis.'}
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor={`po-service-fee-${line.id}`} className="block text-xs font-semibold text-slate-600">Biaya Jasa</label>
                            <input
                              id={`po-service-fee-${line.id}`}
                              type="number"
                              min="0"
                              value={line.serviceFee}
                              onChange={(event) => patchLine(line.id, { serviceFee: event.target.value })}
                              disabled={selectedLog?.mechanicTeam !== 'external'}
                              className="input-control mt-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                              placeholder="0"
                            />
                            <p className="mt-1 text-[11px] text-slate-400">
                              {selectedLog?.mechanicTeam === 'external'
                                ? 'Mekanik external — harga jasa boleh diisi.'
                                : selectedLog ? 'Mekanik internal — harga jasa harus 0.' : 'Pilih damage log dulu.'}
                            </p>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-slate-600">Sparepart dari Supplier</span>
                            {selectedLog?.sparePartSource !== 'supplier' ? (
                              <p className="mt-1 rounded-lg border border-dashed border-slate-200 p-3 text-[11px] text-slate-500">
                                {selectedLog ? 'Sparepart untuk kerusakan ini berasal dari gudang (warehouse), jadi tidak ada baris sparepart di order.' : 'Pilih damage log dulu.'}
                              </p>
                            ) : line.spareparts.length === 0 ? (
                              <button type="button" onClick={() => addSparepart(line)} className="btn btn-secondary mt-1 text-xs">+ Tambah Sparepart</button>
                            ) : (
                              <div className="mt-1 space-y-2">
                                {line.spareparts.map((sp) => (
                                  <div key={sp.id} className="grid grid-cols-[1fr_4rem_6rem_auto] items-center gap-2">
                                    <input value={sp.itemName} onChange={(event) => patchSparepart(line, sp.id, { itemName: event.target.value })} className="input-control text-xs" placeholder="Nama sparepart" />
                                    <input type="number" min="1" value={sp.quantity} onChange={(event) => patchSparepart(line, sp.id, { quantity: event.target.value })} className="input-control text-xs" placeholder="Qty" />
                                    <input type="number" min="0" value={sp.estimatedUnitPrice} onChange={(event) => patchSparepart(line, sp.id, { estimatedUnitPrice: event.target.value })} className="input-control text-xs" placeholder="Harga" />
                                    <button type="button" onClick={() => removeSparepart(line, sp.id)} className="text-xs text-red-600" aria-label="Hapus sparepart">✕</button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => addSparepart(line)} className="text-xs font-semibold text-teal-700 hover:text-teal-900">+ Tambah sparepart lain</button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-right text-xs text-slate-500">
                          Estimasi item: <strong className="text-slate-800">Rp {(Number(line.serviceFee || 0) + line.spareparts.reduce((sum, sp) => sum + Number(sp.quantity || 0) * Number(sp.estimatedUnitPrice || 0), 0)).toLocaleString('id-ID')}</strong>
                        </p>
                      </>
                    )}

                    {category === 'maintenance' && (
                      <>
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
                            hint="Hanya unit yang memiliki pengaturan maintenance aktif yang bisa dipilih."
                          />
                        </div>
                        {line.equipmentItemId && (
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-600">Aspek Maintenance <span className="text-red-500">*</span> <span className="font-normal text-slate-400">({line.maintenanceSettingIds.length} dipilih)</span></p>
                              {lineServiceable.length > 0 && <button type="button" onClick={() => toggleAllLineAspects(line)} className="text-xs font-semibold text-teal-700 hover:text-teal-900">{line.maintenanceSettingIds.length === lineServiceable.length ? 'Batalkan semua' : 'Pilih semua yang bisa dilayani'}</button>}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">Tiap aspek punya estimasi harganya sendiri.</p>
                            {lineAspects.length === 0 ? <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Unit ini belum memiliki aspek maintenance aktif.</div> : (
                              <div className="mt-2 space-y-2">{lineAspects.map((metric) => {
                                const settingId = String(metric.id);
                                const checked = line.maintenanceSettingIds.includes(settingId);
                                const serviceable = SERVICEABLE_STATUSES.includes(metric.status);
                                const alreadyUsed = lines.some((other) => other.id !== line.id && other.maintenanceSettingIds.includes(settingId));
                                const disabled = !serviceable || (alreadyUsed && !checked);
                                const status = metric.status || 'normal';
                                return (
                                  <div key={settingId} className={`rounded-lg border p-3 transition ${disabled ? 'border-slate-200 bg-slate-50 opacity-60' : checked ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                    <div className="flex items-center justify-between gap-3">
                                      <label className={`flex items-center gap-3 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleLineAspect(line, settingId)} className="h-4 w-4 rounded border-slate-300 text-teal-600" />
                                        <span>
                                          <span className="block text-xs font-bold text-slate-900">{metric.name}</span>
                                          <span className="block font-mono text-[11px] text-slate-500">{metric.current} / {metric.threshold} hrs</span>
                                          {alreadyUsed && <span className="block text-[10px] text-slate-400">Sudah dipakai item lain</span>}
                                        </span>
                                      </label>
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${metricStatusStyles[status] || metricStatusStyles.normal}`}>{metricStatusLabels[status] || status}</span>
                                    </div>
                                    {checked && (
                                      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-teal-200/70 pt-3">
                                        <div className="w-full max-w-[14rem]">
                                          <label htmlFor={`po-aspect-price-${line.id}-${settingId}`} className="block text-[11px] font-semibold text-slate-600">Estimasi Harga — {metric.name}</label>
                                          <div className="relative mt-1">
                                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">Rp</span>
                                            <input
                                              id={`po-aspect-price-${line.id}-${settingId}`}
                                              type="number"
                                              min="0"
                                              value={line.aspectPrices[settingId] ?? ''}
                                              onChange={(event) => patchAspectPrice(line, settingId, event.target.value)}
                                              className="input-control pl-8 text-xs"
                                              placeholder="Contoh: 850000"
                                            />
                                          </div>
                                        </div>
                                        <p className="text-[11px] text-slate-400">Nilai 0 berarti biaya Covered/di luar scope order ini.</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}</div>
                            )}
                          </div>
                        )}
                        {line.maintenanceSettingIds.length > 0 && (
                          <p className="text-right text-xs text-slate-500">
                            Estimasi item: <strong className="text-slate-800">Rp {line.maintenanceSettingIds.reduce((sum, settingId) => sum + Number(line.aspectPrices[settingId] || 0), 0).toLocaleString('id-ID')}</strong>
                          </p>
                        )}
                      </>
                    )}

                    {category === 'stock' && (
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-1"><label htmlFor={`po-stock-name-${line.id}`} className="block text-xs font-semibold text-slate-600">Nama Barang</label><input id={`po-stock-name-${line.id}`} value={line.itemName} onChange={(event) => patchLine(line.id, { itemName: event.target.value })} className="input-control mt-1 text-xs" placeholder="Contoh: Oli mesin SAE 15W-40" /></div>
                        <div><label htmlFor={`po-stock-qty-${line.id}`} className="block text-xs font-semibold text-slate-600">Jumlah</label><input id={`po-stock-qty-${line.id}`} type="number" min="1" value={line.quantity} onChange={(event) => patchLine(line.id, { quantity: event.target.value })} className="input-control mt-1 text-xs" /></div>
                        <div><label htmlFor={`po-stock-price-${line.id}`} className="block text-xs font-semibold text-slate-600">Estimasi Harga Satuan</label><input id={`po-stock-price-${line.id}`} type="number" min="0" value={line.estimatedUnitPrice} onChange={(event) => patchLine(line.id, { estimatedUnitPrice: event.target.value })} className="input-control mt-1 text-xs" placeholder="Contoh: 450000" /></div>
                        <p className="text-right text-xs text-slate-500 sm:col-span-3">Estimasi total item: <strong className="text-slate-800">Rp {(Number(line.quantity || 0) * Number(line.estimatedUnitPrice || 0)).toLocaleString('id-ID')}</strong></p>
                      </div>
                    )}
                  </section>
                );
              })}
              <button type="button" onClick={addLine} className="btn btn-secondary w-full text-xs">+ Tambah Item ({categoryLabel(category)})</button>
              <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-800">
                <p className="font-bold">✓ Kas Alat: otomatis cash-out setelah Finance approve</p>
                <p className="mt-1">Kategori kas ditentukan otomatis dari kategori order ini, jadi tidak perlu dipilih manual.</p>
                <p className="mt-2 font-bold">Total estimasi: Rp {estimatedTotal.toLocaleString('id-ID')} · {buildItems().length} item · {categoryLabel(category)}</p>
              </section>
            </>}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={onBackToPurchaseOrders} className="btn btn-secondary">Batal</button><button type="submit" disabled={saving || !canCreate || !category} className="btn btn-primary">{saving ? 'Mengirim...' : '▷ Kirim Permintaan PO'}</button></div>
          </form>}
        </div>
      </main>
    </div>
  );
}
