import { useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import { getItemById } from '../services/alatService.js';
import { createMaintenanceRecord, getItemMaintenanceSettings, getMaintenanceRecords } from '../services/maintenanceService.js';
import { getPurchaseOrders } from '../services/purchaseOrderService.js';
import { saveMaintenanceResetReference } from '../services/maintenanceThresholdService.js';
import { resolveDamageLog } from '../information/services/informationService.js';
import { recordActivity } from '../../../services/activityLogService.js';
import { hasPermission } from '../../../services/permissions.js';
import ActionButton from '../../../components/ActionButton.jsx';

const statusBadgeStyles = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};
const statusLabels = { normal: 'Normal', warning: 'Scheduled', due: 'Due Soon', overdue: 'Alert', inactive: 'Inactive' };

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

export default function ResetMaintenancePage({ unitId, onBack, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [unit, setUnit] = useState(null);
  const [settings, setSettings] = useState([]);
  const [selectedSettingIds, setSelectedSettingIds] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [previousRecords, setPreviousRecords] = useState([]);
  const [maintenanceType, setMaintenanceType] = useState('routine');
  const [maintenanceDate, setMaintenanceDate] = useState(todayDate);
  const [performedBy, setPerformedBy] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canCreate = hasPermission('maintenance:create');

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        const [unitData, settingsData, recordResult] = await Promise.allSettled([
          getItemById(unitId),
          getItemMaintenanceSettings(unitId),
          getMaintenanceRecords({ equipmentItemId: unitId, limit: 20 }),
        ]);
        const eligiblePurchaseOrders = getPurchaseOrders().filter((order) => order.category === 'suku_cadang' && order.status === 'approved');
        if (cancelled) return;
        if (unitData.status === 'rejected') throw unitData.reason;
        if (settingsData.status === 'rejected') throw settingsData.reason;
        setUnit(unitData.value);
        setSettings(settingsData.value || []);
        setPreviousRecords(recordResult.status === 'fulfilled' ? recordResult.value || [] : []);
        setPurchaseOrders(eligiblePurchaseOrders);
        const settingsRows = settingsData.value || [];
        const priorityIds = settingsRows.filter((setting) => ['overdue', 'due', 'warning'].includes(setting.status)).map((setting) => setting.id);
        setSelectedSettingIds(priorityIds.length ? priorityIds : settingsRows.map((setting) => setting.id));
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'Failed to load maintenance settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [unitId]);

  const toggleSelectAll = () => setSelectedSettingIds(selectedSettingIds.length === settings.length ? [] : settings.map((setting) => setting.id));
  const toggleSelect = (id) => setSelectedSettingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const selectedOrder = purchaseOrders.find((order) => String(order.id) === String(selectedPurchaseOrderId)) || null;
  const performerHistory = [...new Set(previousRecords.map((record) => record.performedBy).filter(Boolean))];

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedSettingIds.length) { setError('Please select at least one maintenance parameter to reset.'); return; }
    if (!selectedPurchaseOrderId) { setError('Pilih purchase order suku cadang yang sudah approved sebelum reset threshold.'); return; }
    if (!actionDescription.trim()) { setError('Action description is required.'); return; }

    setSubmitting(true);
    setError('');
    let completed = 0;
    try {
      for (const settingId of selectedSettingIds) {
        await createMaintenanceRecord({
          equipmentItemId: Number(unitId),
          maintenanceSettingId: Number(settingId),
          maintenanceType,
          maintenanceDate,
          actionDescription: actionDescription.trim(),
          performedBy: performedBy || undefined,
          purchaseOrderId: Number(selectedPurchaseOrderId),
          purchaseOrderCode: selectedOrder?.orderCode,
        });
        completed += 1;
      }
      const relatedDamageLogs = (selectedOrder?.items || []).filter((item) => item.relatedType === 'damage' && item.relatedId && !String(item.relatedId).startsWith('demo-'));
      let resolveWarning = '';
      for (const item of relatedDamageLogs) {
        try {
          await resolveDamageLog(item.relatedId, {
            maintenanceType,
            maintenanceDate,
            actionDescription: actionDescription.trim(),
            performedBy: performedBy || undefined,
          });
        } catch (resolveError) {
          resolveWarning = `Damage log ${item.relatedLabel || item.relatedId} belum otomatis resolved (${resolveError.message}). Selesaikan manual dari halaman Information.`;
        }
      }
      saveMaintenanceResetReference({ equipmentItemId: Number(unitId), purchaseOrderId: Number(selectedPurchaseOrderId), purchaseOrderCode: selectedOrder?.orderCode, settingIds: selectedSettingIds });
      recordActivity({
        module: 'Maintenance',
        action: 'Reset maintenance berhasil',
        description: `${unit?.itemCode || unit?.assetCode || `Unit ${unitId}`} · ${selectedSettingIds.length} parameter · ${selectedOrder?.orderCode || 'tanpa PO'}`,
        ref: `alat/maintenance/reset/${unitId}`,
      });
      onBack(resolveWarning ? `Maintenance reset berhasil. ${resolveWarning}` : 'Maintenance reset successfully executed.');
    } catch (submitError) {
      const partialMessage = completed > 0 ? `${completed} parameter sudah tersimpan sebelum request berikutnya gagal. ` : '';
      setError(`${partialMessage}${submitError.message || 'Failed to submit maintenance reset.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/maintenance" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div><nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={() => onBack()} className="hover:text-slate-800">Maintenance Tracking</button><span>/</span><span className="text-slate-900 font-semibold">Reset Maintenance Parameters</span></nav><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Reset Maintenance — {unit?.itemCode || unit?.assetCode || `Unit #${unitId}`}</h1></div>
            <ActionButton kind="back" label="Kembali ke Maintenance Overview" onClick={() => onBack()} className="self-start sm:self-center" />
          </header>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">{error}</div>}
          {!canCreate && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700" role="status">Anda hanya dapat melihat data. Reset maintenance memerlukan izin maintenance:create.</div>}

          {loading ? <div className="card-panel p-12 text-center text-sm text-slate-500">Loading equipment parameters...</div> : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="card-panel flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
                <div className="space-y-1"><div className="flex items-center gap-3"><span className="text-xl">⚙️</span><h2 className="text-lg font-bold">{unit?.itemCode || unit?.assetCode || `Unit ${unitId}`}</h2><span className="rounded-full bg-slate-700/80 px-2.5 py-0.5 text-xs font-mono text-slate-200">{unit?.jenis || unit?.equipmentType?.typeName || 'Equipment'}</span></div><p className="text-xs text-slate-400">Brand: <strong className="text-slate-200">{unit?.merk || unit?.brand || '-'}</strong> | Model: <strong className="text-slate-200">{unit?.typeModel || unit?.model || '-'}</strong></p></div>
                <div className="flex items-center gap-6"><div className="text-right"><p className="text-xs text-slate-400">Total Workhour</p><p className="text-lg font-bold font-mono text-teal-400">{Number(unit?.totalWorkhour || 0).toLocaleString('id-ID')} hrs</p></div><div className="text-right"><p className="text-xs text-slate-400">Status</p><span className="mt-0.5 inline-block rounded-full border border-teal-500/30 bg-teal-500/20 px-3 py-0.5 text-xs font-semibold text-teal-300">{unit?.currentStatus || unit?.status || 'operational'}</span></div></div>
              </div>

              <div className="card-panel space-y-4 p-6">
                <div><h3 className="text-base font-bold text-slate-900">Purchase Order Suku Cadang (Approved)</h3><p className="mt-1 text-xs text-slate-500">Reset threshold hanya dapat dilakukan jika sudah ada purchase order suku cadang berstatus approved.</p></div>
                <div><label htmlFor="maintenance-purchase-order" className="block text-xs font-semibold text-slate-600">Purchase Order terkait *</label><select id="maintenance-purchase-order" value={selectedPurchaseOrderId} onChange={(event) => setSelectedPurchaseOrderId(event.target.value)} required className="input-control mt-1 text-xs"><option value="">Pilih purchase order...</option>{purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.orderCode} · {order.description} · {order.status}</option>)}</select>{purchaseOrders.length === 0 && <p className="mt-2 text-xs text-amber-700">Belum ada purchase order suku cadang approved. Ajukan purchase order terlebih dahulu, lalu lakukan service/maintenance setelah di-approve.</p>}{selectedOrder && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600"><p className="font-semibold text-slate-800">{selectedOrder.orderCode}</p><p className="mt-1">Equipment: {selectedOrder.items?.map((item) => item.equipmentAssetCode).filter(Boolean).join(', ') || '-'}</p>{selectedOrder.items?.filter((item) => item.relatedType === 'damage' && item.relatedId).map((item) => <p key={item.id} className="mt-1 text-emerald-700">Damage log terkait akan otomatis berstatus resolved setelah reset: {item.relatedLabel || item.relatedId}</p>)}</div>}</div>
              </div>

              <div className="card-panel space-y-4 p-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-base font-bold text-slate-900">Select Maintenance Parameters to Reset</h3><p className="text-xs text-slate-500">Parameter terpilih akan di-reset ke 0 hrs.</p></div><button type="button" onClick={toggleSelectAll} className="btn btn-secondary text-xs">{selectedSettingIds.length === settings.length ? 'Deselect All' : 'Select All'}</button></div>
                {settings.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">No configured maintenance settings found.</div> : <div className="grid gap-4 sm:grid-cols-2">{settings.map((setting) => { const isSelected = selectedSettingIds.includes(setting.id); const aspectName = setting.maintenanceAspect?.aspectName || 'Maintenance Aspect'; const current = Number(setting.currentValueSinceReset || 0); const threshold = Number(setting.thresholdValue || 1); const percent = Math.min(Math.round((current / threshold) * 100), 100); const status = setting.status || 'normal'; return <div key={setting.id} onClick={() => toggleSelect(setting.id)} className={`cursor-pointer rounded-xl border p-4 transition ${isSelected ? 'border-teal-500 bg-teal-50/40 shadow-sm ring-1 ring-teal-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(setting.id)} onClick={(event) => event.stopPropagation()} className="h-4 w-4 rounded border-slate-300 text-teal-600" /><div><h4 className="text-sm font-bold text-slate-900">{aspectName}</h4><p className="font-mono text-xs text-slate-500">Current: {current} / {threshold} hrs</p></div></div><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeStyles[status] || statusBadgeStyles.normal}`}>{statusLabels[status] || status}</span></div><div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${percent}%` }} /></div></div>; })}</div>}
              </div>

              <div className="card-panel space-y-4 p-6"><h3 className="border-b border-slate-200 pb-3 text-base font-bold text-slate-900">Service Action Details</h3><div className="grid gap-4 sm:grid-cols-3"><div><label htmlFor="maintenanceType" className="block text-xs font-semibold text-slate-600">Maintenance Type *</label><select id="maintenanceType" value={maintenanceType} onChange={(event) => setMaintenanceType(event.target.value)} required className="input-control mt-1 text-xs"><option value="routine">Routine Service</option><option value="repair">Repair</option><option value="replacement">Part Replacement</option><option value="inspection">Inspection</option><option value="adjustment">Adjustment</option></select></div><div><label htmlFor="maintenanceDate" className="block text-xs font-semibold text-slate-600">Service Date *</label><input id="maintenanceDate" type="date" value={maintenanceDate} onChange={(event) => setMaintenanceDate(event.target.value)} required className="input-control mt-1 text-xs" /></div><div><label htmlFor="performedBy" className="block text-xs font-semibold text-slate-600">Performed By / Mechanic</label><input id="performedBy" list="performed-by-history" value={performedBy} onChange={(event) => setPerformedBy(event.target.value)} className="input-control mt-1 text-xs" placeholder="Nama mechanic / tim yang melakukan" /><datalist id="performed-by-history">{performerHistory.map((name) => <option key={name} value={name} />)}</datalist><p className="mt-1 text-[11px] text-slate-400">Isi bebas, riwayat nama ada di bawah.</p></div></div><div><label htmlFor="actionDescription" className="block text-xs font-semibold text-slate-600">Action Description / Notes *</label><textarea id="actionDescription" rows={3} value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} required className="input-control mt-1 resize-none text-xs" placeholder="Describe maintenance work performed..." /></div></div>

              <div className="card-panel overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div><h3 className="text-base font-bold text-slate-900">Log Service Sebelumnya</h3><p className="mt-1 text-xs text-slate-500">Riwayat tindakan service & maintenance yang sudah dilakukan untuk unit ini.</p></div><span className="text-xs text-slate-500">{previousRecords.length} catatan</span></div>{previousRecords.length ? <div className="table-container rounded-none border-0"><table className="table-modern"><thead><tr><th className="w-32">Tanggal</th><th className="w-32">Jenis</th><th>Deskripsi</th><th className="w-40">Pelaksana</th><th className="w-28 text-center">Status</th></tr></thead><tbody>{previousRecords.map((record) => <tr key={record.id}><td className="text-xs text-slate-600">{record.maintenanceDate ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(record.maintenanceDate)) : '-'}</td><td className="text-xs capitalize text-slate-700">{String(record.maintenanceType || '-').replace(/_/g, ' ')}</td><td className="text-xs text-slate-700">{record.actionDescription || '-'}</td><td className="text-xs text-slate-600">{record.performedBy || '-'}</td><td className="text-center"><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${record.status === 'cancelled' ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{record.status || 'completed'}</span></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">Belum ada log service untuk unit ini.</div>}</div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4"><button type="button" onClick={() => onBack()} disabled={submitting} className="btn btn-secondary text-xs">Cancel</button><button type="submit" disabled={submitting || !canCreate || !selectedSettingIds.length || !selectedPurchaseOrderId} className="btn btn-primary text-xs">{submitting ? 'Executing Reset...' : `Confirm Reset (${selectedSettingIds.length} Selected)`}</button></div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
