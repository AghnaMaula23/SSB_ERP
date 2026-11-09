import { useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { actorName, formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { getPurchaseRequest } from '../../admin/approvals/services/approvalService.js';
import { PR_CATEGORY, PR_STATUS } from '../../admin/approvals/utils/approvalFormat.js';
import { DecisionTrail } from '../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import DecisionPanel from '../components/DecisionPanel.jsx';
import { approvePurchaseRequest, rejectPurchaseRequest } from '../services/financeService.js';
import { blockedReasonFor } from '../utils/financeFormat.js';

/** Baris yang diberi nominal aktual. `key` unik, `estimate` = angka yang diajukan. */
function linesOf(pr) {
  if (pr.orderCategory === 'repair') {
    return (pr.repairItems || []).flatMap((item) => [
      { key: `fee-${item.id}`, group: `${item.damageLog?.equipmentItem?.assetCode || 'Unit'} · ${item.damageLog?.damageCode || ''}`, label: 'Biaya jasa', detail: item.damageLog?.description, estimate: Number(item.serviceFee || 0), locked: Number(item.serviceFee || 0) === 0 },
      ...(item.spareparts || []).map((sp) => ({ key: `sp-${sp.id}`, group: null, label: sp.itemName, detail: `${formatNumber(sp.quantity)} × ${formatCurrency(sp.estimatedUnitPrice)}`, estimate: Number(sp.estimatedTotalPrice || 0) })),
    ]);
  }
  if (pr.orderCategory === 'maintenance') {
    return (pr.maintenanceItems || []).map((item) => ({
      key: `mt-${item.id}`, group: null, label: `${item.maintenanceSetting?.equipmentItem?.assetCode || '-'} · ${item.maintenanceSetting?.maintenanceAspect?.aspectName || 'Servis'}`, detail: `Jadwal ${item.maintenanceSetting?.status || '-'}`, estimate: Number(item.estimatedPrice || 0),
    }));
  }
  return (pr.stockItems || []).map((item) => ({
    key: `st-${item.id}`, group: null, label: item.itemName, detail: `${formatNumber(item.quantity)} × ${formatCurrency(item.estimatedUnitPrice)}`, estimate: Number(item.estimatedTotalPrice || 0),
  }));
}

/** Bentuk body approve per kategori (purchase-request.routes.js). */
function approvalPayload(pr, actual, notes) {
  const value = (key) => Number(actual[key] || 0);
  const base = notes?.trim() ? { notes: notes.trim() } : {};
  if (pr.orderCategory === 'repair') {
    return {
      ...base,
      approvedRepairItems: pr.repairItems.map((item) => ({
        repairItemId: item.id,
        approvedServiceFee: value(`fee-${item.id}`),
        spareparts: (item.spareparts || []).map((sp) => ({ sparepartId: sp.id, approvedTotalPrice: value(`sp-${sp.id}`) })),
      })),
    };
  }
  if (pr.orderCategory === 'maintenance') {
    return { ...base, approvedMaintenanceItems: pr.maintenanceItems.map((item) => ({ itemId: item.id, approvedPrice: value(`mt-${item.id}`) })) };
  }
  return { ...base, approvedStockItems: pr.stockItems.map((item) => ({ itemId: item.id, approvedTotalPrice: value(`st-${item.id}`) })) };
}

function PurchaseRequestForm({ pr, onDone, reload }) {
  const lines = linesOf(pr);
  // Nominal aktual diisi dari nota/penawaran final; awalnya = estimasi supaya mudah dikoreksi.
  const [actual, setActual] = useState(() => Object.fromEntries(lines.map((line) => [line.key, String(line.estimate)])));
  const total = lines.reduce((sum, line) => sum + (Number(actual[line.key]) || 0), 0);
  const estimate = pr.totalEstimatedAmount;
  const blockedReason = blockedReasonFor({ status: pr.status, permission: 'purchase-request:approve', ownId: pr.requestedBy?.id, adminId: pr.adminValidatedBy?.id });
  const editable = !blockedReason;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="card-panel self-start overflow-hidden" aria-label="Nominal aktual">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Rincian & Nominal Aktual</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Isi sesuai nota atau penawaran final. Kas Alat tercatat keluar sebesar total aktual.</p>
        </div>
        <div className="table-scroll-mobile overflow-x-auto">
          <table className="table-modern">
            <thead><tr><th>Item</th><th className="text-right">Estimasi</th><th className="text-right">Aktual</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <td>
                    {line.group && <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{line.group}</p>}
                    <p className="text-sm font-medium text-slate-900">{line.label}</p>
                    {line.detail && <p className="text-[11px] text-slate-500">{line.detail}</p>}
                  </td>
                  <td className="text-right font-mono text-xs">{formatCurrency(line.estimate)}</td>
                  <td className="w-44 text-right">
                    <input
                      aria-label={`Nominal aktual ${line.label}`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={!editable || line.locked}
                      title={line.locked ? 'Tidak mengajukan biaya jasa, jadi nominalnya 0' : undefined}
                      value={actual[line.key]}
                      onChange={(event) => setActual((current) => ({ ...current, [line.key]: event.target.value }))}
                      className="input-control h-9 text-right font-mono text-xs disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-1 bg-slate-100 px-5 py-4 text-sm">
          <p className="flex justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Estimasi</span><span className="font-mono">{formatCurrency(estimate)}</span></p>
          <p className="flex justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-700">Total Aktual</span><span className="font-mono text-lg font-bold text-slate-900">{formatCurrency(total)}</span></p>
          {total !== estimate && <p className={`text-right text-[11px] font-semibold ${total > estimate ? 'text-red-600' : 'text-leaf-700'}`}>{total > estimate ? 'Di atas' : 'Di bawah'} estimasi {formatCurrency(Math.abs(total - estimate))}</p>}
        </div>
      </section>

      <aside className="space-y-4">
        <DecisionPanel
          blockedReason={blockedReason}
          approveLabel="Setujui & Cairkan"
          approveConfirm={`Setujui ${pr.requestCode} dengan total aktual ${formatCurrency(total)}? Kas Alat langsung tercatat keluar.`}
          onApprove={async (notes) => { await approvePurchaseRequest(pr.id, approvalPayload(pr, actual, notes)); onDone(`${pr.requestCode} disetujui. Kas Alat keluar ${formatCurrency(total)}.`); }}
          onReject={async (notes) => { await rejectPurchaseRequest(pr.id, notes); onDone(`${pr.requestCode} ditolak. Alasannya terlihat oleh Divisi Alat.`); }}
          onConflict={reload}
        >
          {pr.balanceProjection && (
            <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
              <p className="flex justify-between"><span>Saldo Kas Alat</span><b>{formatCurrency(pr.balanceProjection.currentBalance)}</b></p>
              <p className="flex justify-between"><span>Setelah cair</span><b className={pr.balanceProjection.currentBalance - total < 0 ? 'text-red-600' : ''}>{formatCurrency(pr.balanceProjection.currentBalance - total)}</b></p>
            </div>
          )}
        </DecisionPanel>
        <DecisionTrail entries={[
          { title: pr.status === 'rejected_by_admin' ? 'Ditolak Admin' : 'Divalidasi Admin', by: pr.adminValidatedBy, at: pr.adminValidatedAt, notes: pr.adminNotes },
          { title: pr.status === 'rejected_by_finance' ? 'Ditolak Finance' : 'Disetujui Finance', by: pr.financeApprovedBy, at: pr.financeApprovedAt, notes: pr.financeNotes },
        ]} />
      </aside>
    </div>
  );
}

/** PR Divisi Alat di meja Finance: nominal aktual per baris, lalu setujui (Kas Alat keluar) atau tolak. */
export default function PurchaseRequestApproval({ recordId, onDone }) {
  const { data: pr, error, reload } = useRecord(() => getPurchaseRequest(recordId), recordId);
  if (error && !pr) return <EmptyPanel icon="🔎" title="Purchase request tidak ditemukan" action={<a href="#/finance/approvals/pr" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!pr) return <LoadingPanel>Memuat purchase request...</LoadingPanel>;
  return (
    <>
      <Breadcrumb items={[{ label: 'Approvals', href: '#/finance/approvals/pr' }, { label: 'PO Divisi Alat', href: '#/finance/approvals/pr' }, { label: pr.requestCode }]} />
      <div className="mb-5 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-leaf-800">{pr.requestCode}</h1>
          <StatusBadge status={pr.status} map={PR_STATUS} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{PR_CATEGORY[pr.orderCategory]} · diajukan {formatDate(pr.requestDate)} oleh {actorName(pr.requestedBy)}</p>
      </div>
      <PurchaseRequestForm key={pr.status} pr={pr} onDone={onDone} reload={reload} />
    </>
  );
}
