import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { actorName, formatCurrency, formatDate, formatDateTime, formatNumber } from '../../project/utils/projectFormat.js';
import { DecisionButtons, RejectReasonForm } from '../components/ApprovalUi.jsx';
import { getPurchaseRequest, rejectPurchaseRequest, validatePurchaseRequest } from '../services/approvalService.js';
import { PRIORITY, PR_CATEGORY, PR_STATUS, prPermissions, prPriority } from '../utils/approvalFormat.js';

function ItemTable({ head, rows }) {
  return (
    <table className="table-modern">
      <thead><tr>{head.map((label, index) => <th key={label} className={index >= head.length - 2 ? 'text-right' : ''}>{label}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

/**
 * Detail satu purchase request untuk diperiksa sebelum divalidasi. Dibuka dari
 * Approval Center atau tab PO — `listHref`/`listLabel` menunjuk asalnya.
 */
export default function PurchaseRequestDetail({ recordId, onDone, listHref = '#/admin/approvals/po', listLabel = 'PO Suku Cadang & Servis' }) {
  const [pr, setPr] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });
  const perms = prPermissions();

  useEffect(() => {
    let cancelled = false;
    getPurchaseRequest(recordId)
      .then((row) => { if (!cancelled) setPr(row); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [recordId, reloadKey]);

  if (loadError) return <EmptyPanel icon="🔎" title="Purchase request tidak ditemukan" action={<a href={listHref} className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!pr) return <LoadingPanel>Memuat purchase request...</LoadingPanel>;

  const own = pr.requestedBy?.id === perms.userId;
  const priority = PRIORITY[prPriority(pr)];

  // 409 = order sudah diproses user lain: tampilkan pesannya dan muat ulang statusnya.
  const showConflict = (error) => {
    setNotice({ tone: 'error', text: error.message });
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const approve = async () => {
    if (!window.confirm(`Validasi ${pr.requestCode}? Order diteruskan ke Finance.`)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      await validatePurchaseRequest(pr.id);
      onDone(`${pr.requestCode} divalidasi dan diteruskan ke Finance.`);
    } catch (error) {
      showConflict(error);
      setBusy(false);
    }
  };

  const reject = async (notes) => {
    try {
      await rejectPurchaseRequest(pr.id, notes);
    } catch (error) {
      if (error.status !== 409) throw error;
      setRejecting(false);
      showConflict(error);
      return;
    }
    onDone(`${pr.requestCode} ditolak. Alasannya terlihat oleh Divisi Alat.`);
  };

  const timeline = [
    { label: 'Diajukan Divisi Alat', at: pr.createdAt, by: actorName(pr.requestedBy), done: true },
    { label: pr.status === 'rejected_by_admin' ? 'Ditolak Admin' : 'Validasi Admin', at: pr.adminValidatedAt, by: pr.adminValidatedBy && actorName(pr.adminValidatedBy), done: Boolean(pr.adminValidatedAt), red: pr.status === 'rejected_by_admin', notes: pr.adminNotes },
    { label: pr.status === 'rejected_by_finance' ? 'Ditolak Finance' : 'Pencairan Finance', at: pr.financeApprovedAt, by: pr.financeApprovedBy && actorName(pr.financeApprovedBy), done: Boolean(pr.financeApprovedAt), red: pr.status === 'rejected_by_finance', notes: pr.financeNotes },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Approvals' }, { label: listLabel, href: listHref }, { label: pr.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold text-emerald-800">{pr.requestCode}</h1>
            <StatusBadge status={pr.status} map={PR_STATUS} />
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${priority.className}`}>{priority.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{PR_CATEGORY[pr.orderCategory]} · diajukan {formatDate(pr.requestDate)} oleh {actorName(pr.requestedBy)}</p>
        </div>
        {pr.status === 'submitted' && (
          <div className="flex flex-col items-end gap-1">
            <DecisionButtons
              busy={busy}
              disabled={busy || rejecting || own}
              approveLabel="Approve & Teruskan"
              onApprove={perms.canValidate ? approve : null}
              onReject={perms.canReject ? () => setRejecting(true) : null}
              approveTitle={own ? 'Tidak bisa memvalidasi order sendiri' : undefined}
            />
            {own && <span className="text-[11px] text-slate-500">Order ini Anda ajukan sendiri — harus divalidasi orang lain.</span>}
          </div>
        )}
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
      {rejecting && pr.status === 'submitted' && (
        <div className="card-panel mb-5 border-red-200 bg-red-50/60 p-4">
          <RejectReasonForm
            label={`Alasan penolakan ${pr.requestCode}`}
            submitLabel="Tolak Order"
            placeholder="Contoh: Harga sparepart terlalu tinggi, minta pembanding"
            onSubmit={reject}
            onCancel={() => setRejecting(false)}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card-panel self-start overflow-hidden" aria-label="Rincian item">
          <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Rincian Item</p>
          <div className="table-scroll-mobile overflow-x-auto">
            {pr.orderCategory === 'repair' && (pr.repairItems || []).map((item) => (
              <div key={item.id} className="border-b border-slate-200 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
                  <p className="text-sm font-bold text-slate-900">{item.damageLog?.equipmentItem?.assetCode || 'Unit'} · {item.damageLog?.damageCode}</p>
                  <p className="text-xs text-slate-500">Jasa {formatCurrency(item.serviceFee)}</p>
                </div>
                <p className="px-5 pb-2 text-xs text-slate-600">{item.damageLog?.description}</p>
                <ItemTable
                  head={['Sparepart', 'Qty', 'Harga Satuan', 'Total']}
                  rows={(item.spareparts || []).length ? item.spareparts.map((sp) => (
                    <tr key={sp.id}>
                      <td className="text-sm">{sp.itemName}</td>
                      <td className="text-xs">{formatNumber(sp.quantity)}</td>
                      <td className="text-right font-mono text-xs">{formatCurrency(sp.estimatedUnitPrice)}</td>
                      <td className="text-right font-mono font-semibold">{formatCurrency(sp.estimatedTotalPrice)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="text-center text-xs text-slate-500">Tanpa sparepart — jasa saja</td></tr>}
                />
              </div>
            ))}
            {pr.orderCategory === 'maintenance' && (
              <ItemTable
                head={['Unit', 'Aspek Servis', 'Status Jadwal', 'Estimasi']}
                rows={(pr.maintenanceItems || []).map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs font-bold">{item.maintenanceSetting?.equipmentItem?.assetCode || '-'}</td>
                    <td className="text-sm">{item.maintenanceSetting?.maintenanceAspect?.aspectName || '-'}</td>
                    <td className="text-right text-xs uppercase">{item.maintenanceSetting?.status || '-'}</td>
                    <td className="text-right font-mono font-semibold">{formatCurrency(item.estimatedPrice)}</td>
                  </tr>
                ))}
              />
            )}
            {pr.orderCategory === 'stock' && (
              <ItemTable
                head={['Barang', 'Qty', 'Harga Satuan', 'Total']}
                rows={(pr.stockItems || []).map((item) => (
                  <tr key={item.id}>
                    <td className="text-sm">{item.itemName}</td>
                    <td className="text-xs">{formatNumber(item.quantity)}</td>
                    <td className="text-right font-mono text-xs">{formatCurrency(item.estimatedUnitPrice)}</td>
                    <td className="text-right font-mono font-semibold">{formatCurrency(item.estimatedTotalPrice)}</td>
                  </tr>
                ))}
              />
            )}
          </div>
          <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total Estimasi</span>
            <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(pr.totalEstimatedAmount)}</span>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card-panel p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Alur Persetujuan</p>
            <ol className="mt-3 space-y-3">
              {timeline.map((step) => (
                <li key={step.label} className="flex gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${step.done ? (step.red ? 'bg-red-500' : 'bg-emerald-600') : 'bg-slate-300'}`}>{step.done ? (step.red ? '✕' : '✓') : ''}</span>
                  <div className="text-xs">
                    <p className={`font-semibold ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
                    {step.done && <p className="text-[11px] text-slate-500">{formatDateTime(step.at)}{step.by ? ` · ${step.by}` : ''}</p>}
                    {step.notes && <p className={`mt-1 rounded-md px-2 py-1 text-[11px] ${step.red ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>“{step.notes}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {pr.balanceProjection && (
            <div className="card-panel p-4 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Proyeksi Kas Alat</p>
              <p className="mt-2 flex justify-between"><span>Saldo saat ini</span><b>{formatCurrency(pr.balanceProjection.currentBalance)}</b></p>
              <p className="flex justify-between"><span>Setelah cair</span><b className={pr.balanceProjection.projectedBalance < 0 ? 'text-red-600' : ''}>{formatCurrency(pr.balanceProjection.projectedBalance)}</b></p>
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            Approve = validasi Admin; order lalu menunggu pencairan Finance. Menolak wajib disertai alasan — alasannya tampil ke Divisi Alat.
          </div>
        </aside>
      </div>
    </>
  );
}
