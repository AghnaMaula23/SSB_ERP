import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../components/AlatHeader.jsx';
import AlatSidebar from '../components/AlatSidebar.jsx';
import ActionButton from '../../../components/ActionButton.jsx';
import { cancelPurchaseOrder, categoryLabel, getPurchaseOrderDetail, isEditableStatus, statusLabel, updatePurchaseOrderRequest } from '../services/purchaseOrderService.js';
import { hasPermission } from '../../../services/permissions.js';

const steps = [
  { key: 'submitted', label: 'Diajukan' },
  { key: 'admin', label: 'Validasi Admin' },
  { key: 'finance', label: 'Approval Finance' },
  { key: 'approved', label: 'Disetujui' },
];

function stepState(status, index) {
  if (status === 'approved') return 'done';
  if (status === 'rejected_by_admin') return index === 0 ? 'done' : index === 1 ? 'rejected' : 'pending';
  if (status === 'rejected_by_finance') return index <= 1 ? 'done' : index === 2 ? 'rejected' : 'pending';
  if (status === 'cancelled') return 'cancelled';
  if (index === 0) return 'done';
  if (index === 1) return 'current';
  return 'pending';
}

const flowStates = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  current: 'border-teal-300 bg-teal-50 text-teal-800',
  pending: 'border-slate-200 bg-white text-slate-500',
};

const formatDate = (value) => (value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value)) : '-');
const money = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

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
    getPurchaseOrderDetail(orderId)
      .then((result) => { setOrder(result); setNotFound(!result); })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  // Edit item & batalkan order butuh izin purchase-request:update (backend 403
  // kalau tidak) DAN status masih `submitted` (backend 409 kalau sudah diproses).
  const canEdit = isEditableStatus(order?.status) && hasPermission('purchase-request:update');
  const isMaintenance = order?.category === 'maintenance';
  // Maintenance: tiap item punya unit sendiri → satu tombol reset per unit.
  const resetUnits = [...new Map((order?.items || []).filter((item) => item.equipmentItemId).map((item) => [String(item.equipmentItemId), item.equipmentAssetCode])).entries()]
    .map(([id, assetCode]) => ({ id, assetCode: assetCode || `Unit ${id}` }));
  // Repair: tiap item merujuk damage log sendiri → satu tombol per damage log.
  const damageTargets = [...new Map((order?.items || []).filter((item) => item.relatedType === 'damage' && item.relatedId).map((item) => [String(item.relatedId), item.relatedLabel || `Damage log ${item.relatedId}`])).entries()]
    .map(([id, label]) => ({ id, label }));
  const actionTargets = isMaintenance
    ? resetUnits.map((unit) => ({ key: unit.id, label: `Reset ${unit.assetCode}`, route: `alat/maintenance/reset/${unit.id}` }))
    : damageTargets.map((damage) => ({ key: damage.id, label: `Selesaikan ${damage.label.split(' · ')[0]}`, route: `alat/information/${damage.id}` }));
  const referenceStep = isMaintenance
    ? { label: 'Aspek Maintenance', description: (order?.items || []).map((item) => item.relatedLabel).filter(Boolean).join(' · ') || 'Aspek maintenance terpilih' }
    : { label: 'Damage Log', description: damageTargets.length ? `${damageTargets.length} damage log terhubung ke pengajuan` : 'Tidak ada damage log terkait' };

  // Backend mengganti SELURUH item saat PUT, jadi "edit per item" dikirim dengan
  // menyalin item lain apa adanya.
  const startEdit = (item) => {
    setEditingItemId(item.id);
    setItemForm(order.category === 'repair'
      ? { serviceFee: item.serviceFee ?? '', spareparts: (item.spareparts || []).map((sp) => ({ ...sp, quantity: sp.quantity ?? 1 })) }
      : order.category === 'maintenance'
        ? { estimatedUnitPrice: item.estimatedUnitPrice ?? '' }
        : { itemName: item.itemName ?? '', quantity: item.quantity ?? 1, estimatedUnitPrice: item.estimatedUnitPrice ?? '' });
    setItemError('');
  };

  const updateItemField = (field, value) => setItemForm((current) => ({ ...current, [field]: value }));
  const updateSparepart = (index, patch) => setItemForm((current) => ({ ...current, spareparts: current.spareparts.map((sp, i) => (i === index ? { ...sp, ...patch } : sp)) }));
  const addSparepartRow = () => setItemForm((current) => ({ ...current, spareparts: [...(current.spareparts || []), { itemName: '', quantity: 1, estimatedUnitPrice: '' }] }));
  const removeSparepartRow = (index) => setItemForm((current) => ({ ...current, spareparts: current.spareparts.filter((_, i) => i !== index) }));

  const editingTotal = order?.category === 'repair'
    ? Number(itemForm.serviceFee || 0) + (itemForm.spareparts || []).reduce((sum, sp) => sum + Number(sp.quantity || 0) * Number(sp.estimatedUnitPrice || 0), 0)
    : order?.category === 'stock'
      ? Number(itemForm.quantity || 0) * Number(itemForm.estimatedUnitPrice || 0)
      : Number(itemForm.estimatedUnitPrice || 0);

  const handleCancelOrder = async () => {
    if (!window.confirm(`Batalkan purchase order ${order.orderCode}?`)) return;
    try {
      setOrder(await cancelPurchaseOrder(order.id));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const saveItem = async () => {
    const edited = (order.items || []).find((item) => item.id === editingItemId);
    if (!edited) return;

    if (order.category === 'repair') {
      const badSparepart = (itemForm.spareparts || []).some((sp) => !sp.itemName?.trim() || Number(sp.quantity) <= 0 || Number(sp.estimatedUnitPrice) < 0);
      if (badSparepart) { setItemError('Nama sparepart, jumlah, dan harga harus valid.'); return; }
      if (!(itemForm.spareparts || []).length && Number(itemForm.serviceFee || 0) <= 0) { setItemError('Minimal ada biaya jasa atau satu baris sparepart.'); return; }
    } else if (order.category === 'stock' && (!itemForm.itemName?.trim() || Number(itemForm.quantity) <= 0 || Number(itemForm.estimatedUnitPrice) < 0)) {
      setItemError('Nama barang, jumlah, dan harga harus valid.');
      return;
    } else if (Number(itemForm.estimatedUnitPrice) < 0) {
      setItemError('Estimasi harga tidak boleh negatif.');
      return;
    }

    setSavingItem(true);
    setItemError('');
    try {
      const merged = (order.items || []).map((item) => {
        if (item.id !== editingItemId) return item;
        if (order.category === 'repair') {
          return {
            ...item,
            serviceFee: Number(itemForm.serviceFee || 0),
            spareparts: (itemForm.spareparts || []).map((sp) => ({ id: sp.id, itemName: sp.itemName, quantity: Number(sp.quantity || 0), estimatedUnitPrice: Number(sp.estimatedUnitPrice || 0) })),
          };
        }
        if (order.category === 'maintenance') return { ...item, estimatedUnitPrice: Number(itemForm.estimatedUnitPrice || 0) };
        return { ...item, itemName: itemForm.itemName, quantity: Number(itemForm.quantity || 0), estimatedUnitPrice: Number(itemForm.estimatedUnitPrice || 0) };
      });
      setOrder(await updatePurchaseOrderRequest(order.id, { date: order.date, category: order.category, items: merged }));
      setEditingItemId(null);
    } catch (requestError) {
      setItemError(requestError.message);
    } finally {
      setSavingItem(false);
    }
  };

  const renderEditForm = () => {
    if (order.category === 'repair') {
      return (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input type="number" min="0" value={itemForm.serviceFee ?? ''} onChange={(event) => updateItemField('serviceFee', event.target.value)} className="input-control text-xs" placeholder="Biaya jasa" />
            <div>
              {(itemForm.spareparts || []).map((sp, index) => (
                <div key={sp.id || `new-${index}`} className="mb-2 grid grid-cols-[1fr_4rem_6rem_auto] items-center gap-2">
                  <input value={sp.itemName} onChange={(event) => updateSparepart(index, { itemName: event.target.value })} className="input-control text-xs" placeholder="Nama sparepart" />
                  <input type="number" min="1" value={sp.quantity} onChange={(event) => updateSparepart(index, { quantity: event.target.value })} className="input-control text-xs" placeholder="Qty" />
                  <input type="number" min="0" value={sp.estimatedUnitPrice} onChange={(event) => updateSparepart(index, { estimatedUnitPrice: event.target.value })} className="input-control text-xs" placeholder="Harga" />
                  <button type="button" onClick={() => removeSparepartRow(index)} className="text-xs text-red-600" aria-label="Hapus sparepart">✕</button>
                </div>
              ))}
              <button type="button" onClick={addSparepartRow} className="text-xs font-semibold text-teal-700 hover:text-teal-900">+ Tambah sparepart</button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Baris sparepart yang dikosongkan akan dihapus saat disimpan.</p>
        </div>
      );
    }

    if (order.category === 'maintenance') {
      return (
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={itemForm.estimatedUnitPrice ?? ''} onChange={(event) => updateItemField('estimatedUnitPrice', event.target.value)} className="input-control text-xs sm:max-w-[12rem]" placeholder="Estimasi harga" />
          <span className="text-[11px] text-slate-400">Harga per aspek maintenance ini.</span>
        </div>
      );
    }

    return (
      <div className="grid gap-2 sm:grid-cols-[2fr_0.7fr_1fr]">
        <input value={itemForm.itemName ?? ''} onChange={(event) => updateItemField('itemName', event.target.value)} className="input-control text-xs" placeholder="Nama barang" />
        <input type="number" min="1" value={itemForm.quantity ?? 1} onChange={(event) => updateItemField('quantity', event.target.value)} className="input-control text-xs" placeholder="Qty" />
        <input type="number" min="0" value={itemForm.estimatedUnitPrice ?? ''} onChange={(event) => updateItemField('estimatedUnitPrice', event.target.value)} className="input-control text-xs" placeholder="Harga satuan" />
      </div>
    );
  };

  const renderItemCells = (item) => {
    if (item.itemType === 'repair') {
      return (
        <>
          <td>
            <p className="font-semibold text-slate-900">{item.itemName}</p>
            <p className="text-xs text-slate-500">Biaya jasa: {money(item.serviceFee)}</p>
            {(item.spareparts || []).map((sp) => (
              <p key={sp.id} className="text-[11px] text-slate-500">· {sp.itemName} × {sp.quantity} @ {money(sp.estimatedUnitPrice)}</p>
            ))}
          </td>
          <td className="text-xs text-slate-600">{item.relatedLabel || '-'}{item.equipmentAssetCode && <span className="mt-1 block font-mono text-[10px] text-slate-400">{item.equipmentAssetCode}</span>}</td>
          <td className="text-right text-xs font-semibold">{money(item.estimatedTotalPrice)}</td>
          <td className="text-right text-xs">{money(item.approvedTotalPrice)}</td>
        </>
      );
    }

    if (item.itemType === 'maintenance') {
      return (
        <>
          <td><p className="font-semibold text-slate-900">{item.itemName}</p><p className="text-xs text-slate-500">Aspek maintenance</p></td>
          <td className="text-xs text-slate-600">{item.relatedLabel || '-'}{item.relatedStatus && <span className="mt-1 block text-[10px] uppercase text-slate-400">{item.relatedStatus}</span>}</td>
          <td className="text-right text-xs font-semibold">{money(item.estimatedUnitPrice)}</td>
          <td className="text-right text-xs">{money(item.approvedTotalPrice)}</td>
        </>
      );
    }

    return (
      <>
        <td><p className="font-semibold text-slate-900">{item.itemName}</p></td>
        <td className="text-xs text-slate-600">Stok gudang</td>
        <td className="text-center text-xs">{item.quantity}</td>
        <td className="text-right text-xs font-semibold">{money(item.estimatedTotalPrice)}</td>
        <td className="text-right text-xs">{money(item.approvedTotalPrice)}</td>
      </>
    );
  };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/purchase-orders" onToggle={() => setCollapsed((value) => { const next = !value; localStorage.setItem('alat-sidebar-collapsed', String(next)); return next; })} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      <AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <nav className="flex items-center gap-2 text-xs font-medium text-slate-500"><button type="button" onClick={onBack} className="hover:text-slate-800">Purchase Orders</button><span>/</span><span className="text-slate-900 font-semibold">{order?.orderCode || 'Detail'}</span></nav>
              <h1 className="mt-1 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{order?.purpose || 'Purchase Request'}</h1>
              <p className="mt-1 text-xs text-slate-500">Diajukan oleh {order?.submittedBy || 'Divisi Alat'} · {formatDate(order?.date)} · Kategori: {categoryLabel(order?.category)}</p>
            </div>
            <ActionButton kind="back" className="shrink-0" label="Kembali ke daftar purchase order" onClick={onBack} />
          </header>

          {loading && <div className="card-panel p-12 text-center text-sm text-slate-500">Memuat detail purchase request...</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700" role="alert">{error}</div>}
          {!loading && notFound && <div className="card-panel p-12 text-center text-sm text-slate-500">Purchase request tidak ditemukan.</div>}

          {order && (
            <>
              <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs text-violet-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-700 px-2.5 py-1 text-[10px] font-bold uppercase text-white">{statusLabel(order.status)}</span>
                  <span>Nomor, status, dan total dihitung otomatis; validasi dan approval dilakukan oleh Admin & Finance.</span>
                  <span className="ml-auto font-semibold">Estimasi: {money(order.totalEstimatedAmount)}{order.totalApprovedAmount > 0 ? ` · Disetujui: ${money(order.totalApprovedAmount)}` : ''}</span>
                  {canEdit && <button type="button" onClick={handleCancelOrder} className="btn btn-secondary text-[11px]">Batalkan order</button>}
                </div>
                {order.balanceWarning && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] font-semibold text-amber-800">⚠ {order.balanceWarning.message}</p>}
                {order.balanceProjection && <p className="mt-2 text-[11px] text-violet-800">Saldo setelah dicairkan: {money(order.balanceProjection.projectedBalance)}</p>}
              </section>

              <section className="card-panel p-4 sm:p-6">
                <div className="relative flex items-start justify-between">
                  {steps.map((step, index) => {
                    const state = stepState(order.status, index);
                    const completedIndex = order.status === 'approved' ? 3 : order.status === 'rejected_by_finance' ? 2 : 1;
                    return (
                      <div key={step.key} className="relative flex flex-1 flex-col items-center text-center">
                        <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold sm:h-8 sm:w-8 sm:text-sm ${state === 'done' ? 'bg-teal-600 text-white' : state === 'rejected' ? 'bg-red-600 text-white' : state === 'cancelled' ? 'bg-slate-400 text-white' : state === 'current' ? 'border-2 border-teal-600 bg-white text-teal-700' : 'border-2 border-slate-200 bg-white text-slate-400'}`}>
                          {state === 'done' ? '✓' : state === 'rejected' ? '!' : state === 'cancelled' ? '✕' : index + 1}
                        </div>
                        <span className={`mt-2 px-1 text-[10px] font-semibold leading-tight sm:text-xs ${state === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>{step.label}</span>
                        {index < steps.length - 1 && <span className={`absolute left-1/2 top-3.5 h-0.5 w-full sm:top-4 ${index < completedIndex ? 'bg-teal-500' : 'bg-slate-200'}`} />}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200 px-4 py-4 sm:px-6">
                  <h2 className="text-sm font-bold text-slate-900">Rincian Item</h2>
                  {canEdit && <span className="text-[11px] text-slate-500">Edit per item · hanya selagi status Diajukan</span>}
                </div>
                {/* Mobile: kartu per item. Tabel di bawah hanya untuk layar md ke atas. */}
                <ul className="divide-y divide-slate-200 md:hidden">
                  {(order.items || []).map((item) => (
                    <li key={item.id} className="space-y-3 px-4 py-4">
                      {editingItemId === item.id ? (
                        <>
                          {renderEditForm()}
                          {itemError && <p className="text-xs text-red-600">{itemError}</p>}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">Estimasi: <strong className="text-slate-900">{money(editingTotal)}</strong></span>
                            <div className="flex gap-1">
                              <ActionButton kind="cancel" label="Batal" tone="danger" showLabel onClick={() => setEditingItemId(null)} />
                              <ActionButton kind="save" label="Simpan" tone="success" showLabel onClick={saveItem} disabled={savingItem} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words font-semibold text-slate-900">{item.itemName}</p>
                              <p className="mt-0.5 break-words text-xs text-slate-500">{item.itemType === 'stock' || (item.itemType !== 'repair' && item.itemType !== 'maintenance') ? `Stok gudang · Qty ${item.quantity}` : item.relatedLabel || '-'}</p>
                              {item.itemType === 'repair' && <p className="mt-1 text-[11px] text-slate-500">Biaya jasa: {money(item.serviceFee)}</p>}
                              {item.itemType === 'repair' && (item.spareparts || []).map((sp) => <p key={sp.id} className="text-[11px] text-slate-500">· {sp.itemName} × {sp.quantity} @ {money(sp.estimatedUnitPrice)}</p>)}
                            </div>
                            {canEdit && <ActionButton kind="edit" label="Edit" showLabel className="shrink-0" onClick={() => startEdit(item)} />}
                          </div>
                          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                            <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estimasi</dt><dd className="mt-0.5 font-semibold text-slate-900">{money(item.itemType === 'maintenance' ? item.estimatedUnitPrice : item.estimatedTotalPrice)}</dd></div>
                            <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Disetujui Finance</dt><dd className="mt-0.5 font-semibold text-slate-900">{money(item.approvedTotalPrice)}</dd></div>
                          </dl>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="table-container hidden rounded-none border-0 md:block">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Item</th><th>Terkait</th>
                        {order.category !== 'repair' && order.category !== 'maintenance' && <th className="text-center">Qty</th>}
                        <th className="text-right">Estimasi</th>
                        <th className="text-right">Disetujui Finance</th>
                        <th className="w-24 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items || []).map((item) => {
                        const isEditing = editingItemId === item.id;
                        const extraCols = order.category === 'repair' || order.category === 'maintenance' ? 0 : 1;
                        return (
                          <tr key={item.id}>
                            {isEditing ? (
                              <>
                                {/* Form menempati kolom Item, Terkait (dan Qty); sisanya tetap sejajar header. */}
                                <td colSpan={2 + extraCols}>
                                  {renderEditForm()}
                                  {itemError && <p className="mt-2 text-xs text-red-600">{itemError}</p>}
                                </td>
                                <td className="whitespace-nowrap text-right text-xs font-semibold">{money(editingTotal)}</td>
                                <td className="whitespace-nowrap text-right text-xs text-slate-400">diisi Finance</td>
                                <td className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <ActionButton kind="save" label="Simpan item" tone="success" onClick={saveItem} disabled={savingItem} />
                                    <ActionButton kind="cancel" label="Batal edit item" tone="danger" onClick={() => setEditingItemId(null)} />
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                {renderItemCells(item)}
                                <td className="text-center">{canEdit && <ActionButton kind="edit" label={`Edit item ${item.itemName}`} onClick={() => startEdit(item)} />}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="card-panel p-5">
                  <h2 className="text-sm font-bold text-slate-900">🟦 Validasi Admin</h2>
                  <p className="mt-3 text-xs text-slate-600">
                    {order.adminValidatedBy ? `Divalidasi ${order.adminValidatedBy}${order.adminValidatedAt ? ` · ${formatDate(order.adminValidatedAt)}` : ''}` : 'Menunggu validasi Admin.'}
                  </p>
                  <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{order.adminValidatedBy ? 'Sudah divalidasi' : 'Menunggu validasi'}</span>
                </section>
                <section className="card-panel p-5">
                  <h2 className="text-sm font-bold text-slate-900">🟧 Approval Finance</h2>
                  <p className="mt-3 text-xs text-slate-600">
                    {order.financeApprovedBy ? `Disetujui ${order.financeApprovedBy}${order.financeApprovedAt ? ` · ${formatDate(order.financeApprovedAt)}` : ''}` : 'Menunggu Finance mengisi nominal aktual per item.'}
                  </p>
                  <span className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {order.status === 'approved' ? `Disetujui · ${money(order.totalApprovedAmount)}` : order.status === 'rejected_by_finance' ? 'Ditolak Finance' : 'Menunggu approval'}
                  </span>
                </section>
              </div>

              {order.status === 'approved' && order.category !== 'stock' && (
                <section className="card-panel p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{isMaintenance ? 'Pelaksanaan Maintenance' : 'Penyelesaian Repair / Service'}</h2>
                      <p className="mt-1 text-xs text-slate-500">{isMaintenance ? 'Order ini sudah approved dan dapat dipilih pada halaman Reset Maintenance untuk unit terkait.' : 'Order ini sudah approved dan dipakai saat menyelesaikan damage log terkait di halaman Information.'}</p>
                    </div>
                    {actionTargets.length > 0 && (
                      <div className="flex flex-wrap gap-2">{actionTargets.map((target) => <button key={target.key} type="button" onClick={() => { window.location.hash = `/${target.route}`; }} className="btn btn-secondary text-xs">{target.label}</button>)}</div>
                    )}
                  </div>
                  <ol className="mt-5 grid gap-3 md:grid-cols-3">
                    <FlowStep index={1} label={referenceStep.label} description={referenceStep.description} state="done" />
                    <FlowStep index={2} label="Purchase Order" description={`${order.orderCode} · approved`} state="done" />
                    <FlowStep index={3} label={isMaintenance ? 'Reset Maintenance' : 'Resolve Damage Log'} description={!actionTargets.length ? 'Belum ada unit / damage log pada item' : isMaintenance ? 'Siap dilaksanakan, hanya aspek di order ini yang bisa di-reset' : 'Siap diselesaikan dari halaman detail damage log'} state={actionTargets.length ? 'current' : 'pending'} />
                  </ol>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
