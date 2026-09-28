import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActionButton from '../../../components/ActionButton.jsx';
import { categoryLabel, getPurchaseOrderDetail, statusLabel, updatePurchaseOrderRequest } from '../services/purchaseOrderService.js';

const steps = [
  { key: 'submitted', label: 'Diajukan' },
  { key: 'admin', label: 'Validasi Admin' },
  { key: 'finance', label: 'Approval Finance' },
  { key: 'approved', label: 'Disetujui' },
];

function stepState(status, index) {
  if (status === 'approved') return 'done';
  if (status === 'rejected') return index < 2 ? 'done' : index === 2 ? 'rejected' : 'pending';
  if (index === 0) return 'done';
  if (index === 1) return 'current';
  return 'pending';
}

const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value)) : '-';
const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

export default function PurchaseOrderDetailPage({ orderId, onBack, onBackToModules, onSignOut }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('alat-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemForm, setItemForm] = useState({});
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getPurchaseOrderDetail(orderId).then((result) => { setOrder(result); setNotFound(!result); }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const canEdit = order?.status === 'pending';
  const resetUnitId = (order?.items || []).find((item) => item.equipmentItemId)?.equipmentItemId || null;
  const startEdit = (item) => { setEditingItemId(item.id); setItemForm({ itemName: item.itemName, quantity: item.quantity, unit: item.unit, estimatedUnitPrice: item.estimatedUnitPrice }); setItemError(''); };
  const updateItemField = (field, value) => setItemForm((current) => ({ ...current, [field]: value }));

  const saveItem = async () => {
    if (!itemForm.itemName?.trim() || Number(itemForm.quantity) <= 0 || Number(itemForm.estimatedUnitPrice) <= 0) { setItemError('Nama item, qty, dan harga harus valid.'); return; }
    setSavingItem(true);
    setItemError('');
    try {
      const items = (order.items || []).map((item) => item.id === editingItemId ? { ...item, ...itemForm, quantity: Number(itemForm.quantity), estimatedUnitPrice: Number(itemForm.estimatedUnitPrice) } : item);
      const updated = await updatePurchaseOrderRequest(order.id, { ...order, items });
      setOrder(updated);
      setEditingItemId(null);
    } catch (requestError) {
      setItemError(requestError.message);
    } finally {
      setSavingItem(false);
    }
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/purchase-orders" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-start justify-between gap-3"><div><nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBack} className="hover:text-slate-800">Purchase Orders</button><span>/</span><span className="text-slate-900 font-semibold">{order?.orderCode || 'Detail'}</span></nav><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{order?.purpose || 'Purchase Request'}</h1><p className="mt-1 text-xs text-slate-500">Diajukan oleh {order?.submittedBy || 'Divisi Alat'} · {formatDate(order?.date)} · Kategori: {categoryLabel(order?.category)}</p></div><ActionButton kind="back" label="Kembali ke daftar purchase order" onClick={onBack} /></header>
          {loading && <div className="card-panel p-12 text-center text-sm text-slate-500">Memuat detail purchase request...</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">{error}</div>}
          {!loading && notFound && <div className="card-panel p-12 text-center text-sm text-slate-500">Purchase request tidak ditemukan.</div>}
          {order && <>
            <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-700 px-2.5 py-1 text-[10px] font-bold uppercase text-white">{statusLabel(order.status)}</span><span>Status akan berubah sesuai alur approval.</span><span className="ml-auto font-semibold">Estimasi total: {money(order.totalPrice)}</span></div></section>
            <section className="card-panel overflow-x-auto p-6"><div className="relative flex min-w-[620px] items-start justify-between">{steps.map((step, index) => { const state = stepState(order.status, index); const completedIndex = order.status === 'approved' ? 3 : order.status === 'rejected' ? 2 : 1; return <div key={step.key} className="relative flex flex-1 flex-col items-center text-center"><div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${state === 'done' ? 'bg-teal-600 text-white' : state === 'rejected' ? 'bg-red-600 text-white' : state === 'current' ? 'border-2 border-teal-600 bg-white text-teal-700' : 'border-2 border-slate-200 bg-white text-slate-400'}`}>{state === 'done' ? '✓' : state === 'rejected' ? '!' : index + 1}</div><span className={`mt-2 text-xs font-semibold ${state === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>{step.label}</span>{index < steps.length - 1 && <span className={`absolute left-1/2 top-4 h-0.5 w-full ${index < completedIndex ? 'bg-teal-500' : 'bg-slate-200'}`} />}</div>; })}</div></section>
            <section className="card-panel overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><h2 className="text-sm font-bold text-slate-900">Rincian Barang</h2>{canEdit && <span className="text-[11px] text-slate-500">Edit dilakukan per item</span>}</div><div className="table-container"><table className="table-modern"><thead><tr><th>Barang</th><th>Terkait</th><th className="text-center">Qty</th><th className="text-right">Estimasi</th><th className="text-right">Disetujui Finance</th><th className="w-24 text-center">Action</th></tr></thead><tbody>{order.items?.map((item) => { const isEditing = editingItemId === item.id; return <tr key={item.id}>{isEditing ? <><td colSpan={4}><div className="grid gap-2 sm:grid-cols-[2fr_0.7fr_0.8fr_1fr]"><input value={itemForm.itemName} onChange={(event) => updateItemField('itemName', event.target.value)} className="input-control text-xs" placeholder="Nama barang" /><input type="number" min="1" value={itemForm.quantity} onChange={(event) => updateItemField('quantity', event.target.value)} className="input-control text-xs" /><input value={itemForm.unit} onChange={(event) => updateItemField('unit', event.target.value)} className="input-control text-xs" /><input type="number" min="0" value={itemForm.estimatedUnitPrice} onChange={(event) => updateItemField('estimatedUnitPrice', event.target.value)} className="input-control text-xs" /></div>{itemError && <p className="mt-2 text-xs text-red-600">{itemError}</p>}</td><td className="text-xs text-slate-600">-</td><td className="text-right text-xs font-semibold">{money((Number(itemForm.quantity) || 0) * (Number(itemForm.estimatedUnitPrice) || 0))}</td><td className="text-center"><ActionButton kind="save" label="Simpan item" tone="success" onClick={saveItem} disabled={savingItem} /><ActionButton kind="cancel" label="Batal edit item" tone="danger" onClick={() => setEditingItemId(null)} /></td></> : <><td><p className="font-semibold text-slate-900">{item.itemName}</p><p className="text-xs capitalize text-slate-500">{item.itemType}</p></td><td className="text-xs text-slate-600">{item.relatedLabel || (item.relatedType ? `${item.relatedType} · ${item.relatedId || '-'}` : '-')}{item.equipmentAssetCode && <span className="mt-1 block font-mono text-[10px] text-slate-400">{item.equipmentAssetCode}</span>}</td><td className="text-center text-xs">{item.quantity} {item.unit}</td><td className="text-right text-xs">{money((Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0))}</td><td className="text-right text-xs">{money(item.financeApprovedAmount ?? (Number(item.quantity) || 0) * (Number(item.estimatedUnitPrice) || 0))}</td><td className="text-center">{canEdit && <ActionButton kind="edit" label={`Edit item ${item.itemName}`} onClick={() => startEdit(item)} />}</td></>}</tr>; })}</tbody></table></div></section>
            <div className="grid gap-4 md:grid-cols-2"><section className="card-panel p-5"><h2 className="text-sm font-bold text-slate-900">🟦 Validasi Admin</h2><p className="mt-3 text-xs text-slate-600">Seluruh kelengkapan & kewajaran pengajuan.</p><span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{order.status === 'pending' ? 'Menunggu validasi' : 'Sudah diproses'}</span></section><section className="card-panel p-5"><h2 className="text-sm font-bold text-slate-900">🟧 Approval Finance</h2><p className="mt-3 text-xs text-slate-600">Isi nominal yang benar-benar dicicil per barang sebelum disetujui.</p><span className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{order.status === 'approved' ? `Disetujui · ${money(order.financeApprovedAmount || order.totalPrice)}` : order.status === 'rejected' ? 'Ditolak' : 'Menunggu approval'}</span></section></div>
            {order.status === 'approved' && <section className="card-panel p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-900">Pelaksanaan Service / Maintenance</h2><p className="mt-1 text-xs text-slate-500">Purchase order ini sudah approved dan dapat dipilih pada halaman Reset Maintenance untuk equipment terkait.</p></div>{resetUnitId && <ActionButton kind="reset" label="Lakukan service / maintenance" tone="success" onClick={() => { window.location.hash = `/alat/maintenance/reset/${resetUnitId}`; }} />}</div><ol className="mt-5 grid gap-3 md:grid-cols-3"><FlowStep index={1} label="Damage Log" description={order.items?.some((item) => item.relatedType === 'damage') ? 'Damage log terhubung ke pengajuan' : 'Tidak ada damage log terkait'} state="done" /><FlowStep index={2} label="Purchase Order" description={`${order.orderCode} · approved`} state="done" /><FlowStep index={3} label="Service / Maintenance" description={resetUnitId ? 'Siap dilaksanakan, damage log akan otomatis resolved' : 'Pilih equipment pada item agar bisa dilaksanakan'} state={resetUnitId ? 'current' : 'pending'} /></ol></section>}
          </>}
        </div>
      </main>
    </div>
  );
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
