import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../../components/AlatHeader.jsx';
import AlatSidebar from '../../components/AlatSidebar.jsx';
import ActionButton from '../../../../components/ActionButton.jsx';
import DamageLogActionModal from '../components/DamageLogActionModal.jsx';
import { getDamageLogById } from '../services/informationService.js';
import { completeAction, getActionStatuses } from '../services/damageLogActionService.js';
import { getPurchaseOrders, ordersForDamageLog } from '../../services/purchaseOrderService.js';
import { recordActivity } from '../../../../services/activityLogService.js';
import { hasPermission } from '../../../../services/permissions.js';

const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value)) : '-';

export default function DamageLogDetailPage({ logId, onBack, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionType, setActionType] = useState(null);
  const [relatedOrders, setRelatedOrders] = useState([]);
  const [statuses, setStatuses] = useState(() => getActionStatuses());
  const canUpdate = hasPermission('damage:update');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, orders] = await Promise.allSettled([
        getDamageLogById(logId),
        getPurchaseOrders(),
      ]);
      if (detail.status === 'rejected') throw detail.reason;
      setLog(detail.value);
      setRelatedOrders(orders.status === 'fulfilled' ? ordersForDamageLog(orders.value, logId) : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [logId]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const records = log?.maintenanceRecords || [];
  const isDone = (recordId) => statuses[String(recordId)] === 'completed';

  const handleCompleteAction = (record) => {
    setStatuses(completeAction(record.id));
    recordActivity({
      module: 'Information',
      action: 'Tindakan damage log diselesaikan',
      description: `${log?.damageCode || 'Damage log'} · ${record.maintenanceType || 'maintenance'} · ${record.actionDescription || ''}`.slice(0, 160),
      ref: `alat/information/${logId}`,
    });
  };

  const approvedOrders = relatedOrders.filter((order) => order.status === 'approved');
  const approvedOrder = approvedOrders[0];
  const navigate = (route) => { window.location.hash = `/${route}`; };
  const startPurchaseOrder = () => {
    sessionStorage.setItem('po-preselect-damage', JSON.stringify({ damageLogId: log.id, assetCode: log.equipmentItem?.assetCode || '', equipmentItemId: log.equipmentItemId || log.equipmentItem?.id || null }));
    navigate('alat/purchase-orders/create');
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/information" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBack} className="hover:text-slate-800">Damage Logs</button><span>/</span><span className="text-slate-900 font-semibold">{log?.damageCode || 'Detail'}</span></nav>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Detail Damage Log</h1>
            </div>
            <ActionButton kind="back" label="Kembali ke daftar damage log" onClick={onBack} />
          </header>
          {loading && <div className="card-panel p-12 text-center text-sm text-slate-500">Memuat detail damage log...</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">{error}</div>}
          {!loading && log && (
            <>
              {log.status === 'reported' && (
                <section className="card-panel p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="text-sm font-bold text-slate-900">Alur Perbaikan Equipment</h2><p className="mt-1 text-xs text-slate-500">Damage log → Purchase Order Perbaikan Alat → Perbaikan. Setelah PO approved, selesaikan damage log dengan memilih PO tersebut.</p></div>
                    <ActionButton kind="add" label="Buat purchase order untuk damage ini" tone="primary" onClick={startPurchaseOrder} />
                  </div>
                  <ol className="mt-5 grid gap-3 md:grid-cols-3">
                    <FlowStep index={1} label="Damage Log" description="Dilaporkan" state="done" />
                    <FlowStep index={2} label="Purchase Order" description={relatedOrders.length ? relatedOrders.map((order) => `${order.orderCode} · ${order.status}`).join(', ') : 'Belum ada pengajuan'} state={approvedOrder ? 'done' : relatedOrders.length ? 'current' : 'pending'} />
                    <FlowStep index={3} label="Perbaikan" description={approvedOrder ? 'Purchase order approved, siap diselesaikan' : 'Menunggu purchase order approved'} state={approvedOrder ? 'current' : 'pending'} />
                  </ol>
                  {approvedOrder && canUpdate && (
                    <div className="mt-4 flex justify-end">
                      <ActionButton kind="resolve" label="Selesaikan perbaikan dengan purchase order" tone="success" onClick={() => setActionType('resolve')} />
                    </div>
                  )}
                </section>
              )}
              <section className="card-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><span className="font-mono text-xs font-semibold text-teal-700">{log.damageCode}</span><h2 className="mt-1 text-xl font-bold text-slate-900">{log.description}</h2><p className="mt-1 text-xs text-slate-500">{log.equipmentItem?.assetCode || 'Equipment'} · {formatDate(log.damageDate)}</p></div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${log.status === 'resolved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : log.status === 'cancelled' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{log.status}</span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Level" value={log.level || (log.stopsOperation ? 'critical' : 'minor')} />
                  <Detail label="Spare Part" value={log.sparePartSource || '-'} />
                  <Detail label="Mechanic" value={log.mechanicTeam || '-'} />
                  <Detail label="Equipment" value={log.equipmentItem?.assetCode || '-'} />
                </div>
                {log.stopsOperation && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">Kerusakan ini menghentikan operasi equipment.</div>}
              </section>
              <section className="card-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-4">
                  <div><h2 className="text-sm font-bold text-slate-900">Riwayat Tindakan</h2><p className="mt-1 text-xs text-slate-500">Tiap tindakan punya tombol sendiri untuk diselesaikan.</p></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{records.length} tindakan</span>
                </div>
                {records.length > 0 ? (
                  <div className="table-container rounded-none border-0">
                    <table className="table-modern">
                      <thead><tr><th className="w-32">Tanggal</th><th className="w-32">Jenis</th><th>Deskripsi</th><th className="w-40">Pelaksana</th><th className="w-28 text-center">Status</th><th className="w-24 text-center">Action</th></tr></thead>
                      <tbody>
                        {records.map((record) => {
                          const done = record.status === 'cancelled' ? false : isDone(record.id);
                          return (
                            <tr key={record.id}>
                              <td className="text-xs text-slate-600">{formatDate(record.maintenanceDate)}</td>
                              <td className="text-xs capitalize text-slate-700">{String(record.maintenanceType || '-').replace(/_/g, ' ')}</td>
                              <td className="text-xs text-slate-700">{record.actionDescription || '-'}</td>
                              <td className="text-xs text-slate-600">{record.performedBy || '-'}</td>
                              <td className="text-center">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${record.status === 'cancelled' ? 'border-slate-200 bg-slate-100 text-slate-500' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                  {record.status === 'cancelled' ? 'cancelled' : done ? 'selesai' : 'berjalan'}
                                </span>
                              </td>
                              <td className="text-center">
                                {record.status === 'cancelled' || done
                                  ? <span className="text-[11px] text-slate-400">—</span>
                                  : <ActionButton kind="resolve" tone="success" label={`Selesaikan tindakan ${record.maintenanceCode || record.id}`} onClick={() => handleCompleteAction(record)} />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                    Belum ada tindakan untuk damage log ini. Selesaikan damage log setelah purchase order Perbaikan Alat di-approve.
                  </div>
                )}
              </section>
              {canUpdate && log.status === 'reported' && <div className="flex justify-end gap-2"><ActionButton kind="cancel" tone="danger" label={`Batalkan damage log ${log.damageCode || ''}`} onClick={() => setActionType('cancel')} /><ActionButton kind="resolve" tone="success" label={`Tandai selesai damage log ${log.damageCode || ''}`} onClick={() => setActionType('resolve')} /></div>}
            </>
          )}
        </div>
      </main>
      <DamageLogActionModal
        key={`${log?.id || 'none'}-${actionType || 'none'}`}
        log={actionType ? log : null}
        action={actionType}
        purchaseOrders={approvedOrders}
        onClose={() => setActionType(null)}
        onSaved={() => {
          recordActivity({
            module: 'Information',
            action: actionType === 'resolve' ? 'Damage log diselesaikan' : 'Damage log dibatalkan',
            description: `${log?.damageCode || 'Damage log'} · ${log?.equipmentItem?.assetCode || 'equipment'}`,
            ref: `alat/information/${logId}`,
          });
          setActionType(null);
          load();
        }}
      />
    </div>
  );
}

function Detail({ label, value }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-slate-800">{value}</p></div>;
}

const flowStates = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  current: 'border-teal-300 bg-teal-50 text-teal-800',
  pending: 'border-slate-200 bg-white text-slate-500',
};

function FlowStep({ index, label, description, state }) {
  return (
    <li className={`rounded-xl border p-4 ${flowStates[state]}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-xs font-bold">{state === 'done' ? '✓' : index}</span>
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed">{description}</p>
    </li>
  );
}

