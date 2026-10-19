import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { actorName, formatCurrency, formatDate, formatDateTime, formatNumber, subProjectTypeLabel } from '../../project/utils/projectFormat.js';
import { RejectReasonForm } from '../components/ApprovalUi.jsx';
import {
  getMaterialRequest, rejectMaterialRequest, replaceMaterialCosts, submitMaterialToFinance, validateMaterialQuantities,
} from '../services/approvalService.js';
import { COST_TYPES, MATERIAL_REQUEST_STATUS, currentUserId } from '../utils/approvalFormat.js';
import { hasPermission } from '../../../../services/permissions.js';

const OTHER_COST_TYPES = Object.keys(COST_TYPES).filter((type) => type !== 'material_cost');
let draftSeq = 0;
const newOtherCost = (patch = {}) => ({ key: `c${(draftSeq += 1)}`, costType: 'delivery_fee', description: '', amount: '', payeeName: '', ...patch });

/** Isian awal dari detail request: kuantitas validasi, harga per item, biaya lain. */
function toDraft(request) {
  const materialCost = new Map(request.costs.filter((cost) => cost.costType === 'material_cost').map((cost) => [cost.materialRequestItemId, cost]));
  return {
    items: Object.fromEntries(request.items.map((item) => [item.id, {
      quantity: item.adminValidatedQuantity === null ? '' : String(item.adminValidatedQuantity),
      adminNotes: item.adminNotes || '',
      price: materialCost.has(item.id) ? String(materialCost.get(item.id).amount) : '',
      payeeName: materialCost.get(item.id)?.payeeName || '',
    }])),
    others: request.costs.filter((cost) => cost.costType !== 'material_cost').map((cost) => newOtherCost({
      costType: cost.costType, description: cost.description, amount: String(cost.amount), payeeName: cost.payeeName || '',
    })),
  };
}

/**
 * Review Admin atas Request Material (E19): sesuaikan kuantitas, susun rincian
 * biaya, lalu teruskan ke Finance — atau tolak dengan alasan. Setelah diteruskan
 * kuantitas & biaya terkunci; nominal yang disetujui Finance = yang diajukan.
 */
export default function MaterialRequestReview({ recordId, onDone }) {
  const [request, setRequest] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [forwardNotes, setForwardNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const canValidate = hasPermission('material-request:validate');

  useEffect(() => {
    let cancelled = false;
    getMaterialRequest(recordId)
      .then((row) => { if (!cancelled) { setRequest(row); setDraft(toDraft(row)); } })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [recordId, reloadKey]);

  if (loadError) return <EmptyPanel icon="🔎" title="Request material tidak ditemukan" action={<a href="#/admin/approvals/antrean" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!request || !draft) return <LoadingPanel>Memuat request material...</LoadingPanel>;

  const own = request.requestedBy?.id === currentUserId();
  const editable = request.status === 'submitted' && canValidate && !own;
  const setItem = (itemId, patch) => setDraft((current) => ({ ...current, items: { ...current.items, [itemId]: { ...current.items[itemId], ...patch } } }));
  const setOther = (key, patch) => setDraft((current) => ({ ...current, others: current.others.map((row) => (row.key === key ? { ...row, ...patch } : row)) }));

  const materialTotal = request.items.reduce((sum, item) => sum + (Number(draft.items[item.id].price) || 0), 0);
  const otherTotal = draft.others.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const missingPrice = request.items.filter((item) => !(Number(draft.items[item.id].price) > 0));

  // 409 = sudah diproses user lain: tampilkan pesannya dan muat ulang.
  const showError = (error) => {
    setNotice({ tone: 'error', text: error.message });
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const quantityPayload = () => request.items.map((item) => {
    const value = draft.items[item.id].quantity.trim();
    return {
      itemId: item.id,
      // Kosong / sama dengan diminta = kembali ke kuantitas yang diminta.
      adminValidatedQuantity: value === '' || Number(value) === item.requestedQuantity ? null : Number(value),
      adminNotes: draft.items[item.id].adminNotes.trim() || null,
    };
  });

  const costPayload = () => [
    ...request.items.filter((item) => Number(draft.items[item.id].price) > 0).map((item) => ({
      costType: 'material_cost',
      materialRequestItemId: item.id,
      description: `${item.materialType?.materialName || 'Material'}`,
      amount: Number(draft.items[item.id].price),
      payeeName: draft.items[item.id].payeeName.trim() || null,
    })),
    ...draft.others.filter((row) => row.description.trim() || Number(row.amount) > 0).map((row) => ({
      costType: row.costType,
      description: row.description.trim(),
      amount: Number(row.amount),
      payeeName: row.payeeName.trim() || null,
    })),
  ];

  const validateDraft = () => {
    const invalidQty = request.items.find((item) => draft.items[item.id].quantity.trim() !== '' && !(Number(draft.items[item.id].quantity) > 0));
    if (invalidQty) return `Kuantitas ${invalidQty.materialType?.materialName} harus lebih dari 0 — untuk mencoret item, tolak request-nya.`;
    const badOther = draft.others.find((row) => (row.description.trim() || Number(row.amount) > 0) && (!row.description.trim() || !(Number(row.amount) > 0)));
    if (badOther) return 'Setiap biaya lain wajib punya uraian dan nominal lebih dari 0.';
    return '';
  };

  const saveDraft = async () => {
    const problem = validateDraft();
    if (problem) { setNotice({ tone: 'error', text: problem }); return false; }
    await validateMaterialQuantities(request.id, quantityPayload());
    const updated = await replaceMaterialCosts(request.id, costPayload());
    setRequest(updated);
    return true;
  };

  const run = async (kind) => {
    if (kind === 'submit') {
      if (missingPrice.length) { setNotice({ tone: 'error', text: `Isi harga material untuk: ${missingPrice.map((item) => item.materialType?.materialName).join(', ')}.` }); return; }
      if (!window.confirm(`Teruskan ${request.requestCode} ke Finance senilai ${formatCurrency(materialTotal + otherTotal)}? Kuantitas & biaya terkunci setelah ini.`)) return;
    }
    setBusy(kind);
    setNotice({ tone: 'success', text: '' });
    try {
      if (!(await saveDraft())) { setBusy(''); return; }
      if (kind === 'submit') {
        await submitMaterialToFinance(request.id, forwardNotes);
        onDone(`${request.requestCode} diteruskan ke Finance.`);
        return;
      }
      setNotice({ tone: 'success', text: 'Kuantitas & rincian biaya tersimpan. Request masih menunggu Admin.' });
    } catch (error) {
      showError(error);
    }
    setBusy('');
  };

  const reject = async (reason) => {
    try {
      await rejectMaterialRequest(request.id, reason);
    } catch (error) {
      if (error.status !== 409) throw error;
      setRejecting(false);
      showError(error);
      return;
    }
    onDone(`${request.requestCode} ditolak. Alasannya terlihat oleh pengaju.`);
  };

  const stage = request.subProject;
  const supply = request.externalSupplyProject;

  return (
    <>
      <Breadcrumb items={[{ label: 'Approval', href: '#/admin/approvals/antrean' }, { label: 'Request Material' }, { label: request.requestCode }]} />
      <div className="mb-5 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-emerald-800">{request.requestCode}</h1>
          <StatusBadge status={request.status} map={MATERIAL_REQUEST_STATUS} />
          {request.rejectedBy && <span className="text-xs text-red-600">oleh {request.rejectedBy === 'admin' ? 'Admin' : 'Finance'}</span>}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Diajukan {formatDate(request.requestDate)} oleh {actorName(request.requestedBy)}
          {stage && <> · <a href={`#/admin/projects/${stage.constructionProjectId}/sub/${stage.id}/inventory`} className="font-semibold text-teal-700 hover:underline">{subProjectTypeLabel(stage.subProjectType)}</a></>}
          {supply && <> · <a href={`#/admin/supply/${supply.id}`} className="font-semibold text-teal-700 hover:underline">{supply.supplyProjectCode} {supply.supplyProjectName}</a></>}
          {request.neededDate && ` · dibutuhkan ${formatDate(request.neededDate)}`}
        </p>
        {request.requestNotes && <p className="mt-2 max-w-3xl whitespace-pre-line rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{request.requestNotes}</p>}
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {request.status === 'submitted' && own && <Notice tone="warning">Request ini Anda ajukan sendiri — harus divalidasi orang lain.</Notice>}
      {request.status === 'submitted' && !canValidate && <Notice tone="warning">Akun ini tidak memegang material-request:validate.</Notice>}

      <section className="card-panel mb-5 overflow-hidden" aria-label="Kuantitas & harga material">
        <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Material & Harga</p>
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Material</th>
                <th className="text-right">Diminta</th>
                <th className="w-40">Kuantitas Disetujui</th>
                <th className="w-44">Harga Material (Rp)</th>
                <th className="w-48">Supplier / Penerima</th>
                <th>Catatan Admin</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((item) => {
                const row = draft.items[item.id];
                return (
                  <tr key={item.id}>
                    <td>
                      <p className="font-semibold text-slate-900">{item.materialType?.materialName}</p>
                      {item.itemNotes && <p className="text-[11px] text-slate-500">{item.itemNotes}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right font-mono text-sm">{formatNumber(item.requestedQuantity)} <span className="text-[11px] text-slate-500">{item.unit}</span></td>
                    <td>
                      {editable ? (
                        <div className="relative">
                          <input type="number" min="0" step="any" value={row.quantity} onChange={(event) => setItem(item.id, { quantity: event.target.value })} placeholder={String(item.requestedQuantity)} className="input-control pr-12 font-mono text-sm" aria-label={`Kuantitas disetujui ${item.materialType?.materialName}`} />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{item.unit}</span>
                        </div>
                      ) : <span className="font-mono text-sm font-bold">{formatNumber(item.effectiveQuantity)} {item.unit}</span>}
                    </td>
                    <td>
                      {editable
                        ? <input type="number" min="0" step="1" value={row.price} onChange={(event) => setItem(item.id, { price: event.target.value })} className={`input-control font-mono text-sm ${!(Number(row.price) > 0) ? 'border-amber-300' : ''}`} placeholder="0" aria-label={`Harga ${item.materialType?.materialName}`} />
                        : <span className="font-mono text-sm">{row.price ? formatCurrency(Number(row.price)) : '-'}</span>}
                    </td>
                    <td>
                      {editable
                        ? <input value={row.payeeName} onChange={(event) => setItem(item.id, { payeeName: event.target.value })} maxLength={150} className="input-control text-sm" placeholder="Opsional" />
                        : <span className="text-xs">{row.payeeName || '-'}</span>}
                    </td>
                    <td>
                      {editable
                        ? <input value={row.adminNotes} onChange={(event) => setItem(item.id, { adminNotes: event.target.value })} maxLength={300} className="input-control text-sm" placeholder="Opsional" />
                        : <span className="text-xs">{item.adminNotes || '-'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-panel mb-5 p-5" aria-label="Biaya lain">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Biaya Lain</p>
          {editable && <button type="button" onClick={() => setDraft((current) => ({ ...current, others: [...current.others, newOtherCost()] }))} className="text-xs font-bold text-teal-700 hover:underline">+ Tambah Biaya</button>}
        </div>
        {draft.others.length === 0 ? (
          <p className="text-xs text-slate-500">Tidak ada biaya selain harga material.</p>
        ) : (
          <div className="space-y-2">
            {draft.others.map((row) => (editable ? (
              <div key={row.key} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_10rem_10rem_auto]">
                <select value={row.costType} onChange={(event) => setOther(row.key, { costType: event.target.value })} className="input-control text-sm" aria-label="Jenis biaya">
                  {OTHER_COST_TYPES.map((type) => <option key={type} value={type}>{COST_TYPES[type]}</option>)}
                </select>
                <input value={row.description} onChange={(event) => setOther(row.key, { description: event.target.value })} maxLength={255} className="input-control text-sm" placeholder="Uraian, mis. Ongkos kirim 3 rit" aria-label="Uraian biaya" />
                <input type="number" min="0" step="1" value={row.amount} onChange={(event) => setOther(row.key, { amount: event.target.value })} className="input-control font-mono text-sm" placeholder="Nominal" aria-label="Nominal" />
                <input value={row.payeeName} onChange={(event) => setOther(row.key, { payeeName: event.target.value })} maxLength={150} className="input-control text-sm" placeholder="Penerima" aria-label="Penerima" />
                <button type="button" onClick={() => setDraft((current) => ({ ...current, others: current.others.filter((item) => item.key !== row.key) }))} className="btn btn-ghost px-2 text-red-600" aria-label="Hapus biaya">✕</button>
              </div>
            ) : (
              <div key={row.key} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-b-0">
                <span><span className="text-xs font-semibold text-slate-500">{COST_TYPES[row.costType]}</span> · {row.description}{row.payeeName ? ` (${row.payeeName})` : ''}</span>
                <span className="font-mono">{formatCurrency(Number(row.amount))}</span>
              </div>
            )))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-sm">
          <span className="text-slate-500">Material <b className="font-mono text-slate-900">{formatCurrency(materialTotal)}</b></span>
          <span className="text-slate-500">Lain-lain <b className="font-mono text-slate-900">{formatCurrency(otherTotal)}</b></span>
          <span className="text-base font-bold text-slate-900">Total <span className="font-mono">{formatCurrency(materialTotal + otherTotal)}</span></span>
        </div>
      </section>

      {editable && (
        <section className="card-panel p-5" aria-label="Keputusan Admin">
          {rejecting ? (
            <RejectReasonForm
              label={`Alasan menolak ${request.requestCode}`}
              submitLabel="Tolak Request"
              placeholder="Contoh: Material sejenis masih tersedia di stok tahapan"
              onSubmit={reject}
              onCancel={() => setRejecting(false)}
            />
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="flex-1">
                <span className="text-[11px] font-semibold text-slate-600">Catatan untuk Finance (opsional)</span>
                <input value={forwardNotes} onChange={(event) => setForwardNotes(event.target.value)} maxLength={500} className="input-control mt-1 text-sm" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => setRejecting(true)} className="btn btn-secondary text-xs text-red-600">Tolak</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => run('save')} className="btn btn-secondary text-xs">{busy === 'save' ? 'Menyimpan...' : 'Simpan Draf'}</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => run('submit')} className="btn btn-primary text-xs" title={missingPrice.length ? 'Lengkapi harga semua material dulu' : undefined}>{busy === 'submit' ? 'Meneruskan...' : 'Simpan & Teruskan ke Finance'}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {request.adminReviewedAt && (
        <p className="mt-4 text-xs text-slate-500">
          Diteruskan Admin {formatDateTime(request.adminReviewedAt)} · {actorName(request.adminReviewedBy)}{request.adminNotes ? ` — “${request.adminNotes}”` : ''}
          {request.financeReviewedAt && <><br />Finance {formatDateTime(request.financeReviewedAt)} · {actorName(request.financeReviewedBy)}{request.financeNotes ? ` — “${request.financeNotes}”` : ''}</>}
        </p>
      )}
    </>
  );
}
