import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { getMaterialRequest } from '../../admin/approvals/services/approvalService.js';
import { COST_TYPES, MATERIAL_REQUEST_STATUS } from '../../admin/approvals/utils/approvalFormat.js';
import { DecisionTrail, InfoGrid } from '../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { stageLabel } from '../../lapangan/utils/fieldFormat.js';
import DecisionPanel from '../components/DecisionPanel.jsx';
import { approveMaterialRequest, listLiveMaterialPools, rejectMaterialRequest } from '../services/financeService.js';
import { blockedReasonFor } from '../utils/financeFormat.js';

/**
 * Paket request material di meja Finance. Nominal yang disetujui = yang disusun
 * Admin (tidak ada isian nominal aktual). Material masuk pool project; bila
 * project punya lebih dari satu pool aktif, Finance memilih tujuannya.
 */
export default function MaterialRequestApproval({ recordId, onDone }) {
  const { data, error, reload } = useRecord(async () => {
    const request = await getMaterialRequest(recordId);
    const pools = request.status === 'waiting_finance_approval' ? await listLiveMaterialPools(request).catch(() => []) : [];
    return { request, pools };
  }, recordId);
  const [poolId, setPoolId] = useState('');

  if (error && !data) return <EmptyPanel icon="🔎" title="Request material tidak ditemukan" action={<a href="#/finance/approvals/material" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat request material...</LoadingPanel>;

  const { request, pools } = data;
  const itemName = new Map(request.items.map((item) => [item.id, item.materialType?.materialName]));
  const blockedReason = blockedReasonFor({ status: request.status, permission: 'material-request:approve', ownId: request.requestedBy?.id, adminId: request.adminReviewedBy?.id });
  const context = request.requestType === 'external_supply' ? `Supply · ${request.externalSupplyProject?.supplyProjectName || '-'}` : stageLabel(request.subProject);

  return (
    <>
      <Breadcrumb items={[{ label: 'Approvals', href: '#/finance/approvals/material' }, { label: 'Request Material', href: '#/finance/approvals/material' }, { label: request.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-leaf-800">{request.requestCode}</h1>
        <StatusBadge status={request.status} map={MATERIAL_REQUEST_STATUS} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tujuan', context],
            ['Tanggal', formatDate(request.requestDate)],
            ['Dibutuhkan', request.neededDate ? formatDate(request.neededDate) : '-'],
            ['Pengaju', request.requestedBy?.fullName],
            request.requestNotes && ['Catatan', request.requestNotes],
          ]} />
          <section className="table-container" aria-label="Material">
            <ResponsiveTable
              columns={[
                { key: 'name', label: 'Material', primary: true, render: (item) => <span className="font-semibold text-slate-900">{item.materialType?.materialName}</span> },
                { key: 'requested', label: 'Diminta', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs">{formatNumber(item.requestedQuantity)} {item.unit}</span> },
                { key: 'effective', label: 'Disetujui Admin', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{formatNumber(item.effectiveQuantity)} {item.unit}</span> },
                { key: 'notes', label: 'Catatan Admin', render: (item) => <span className="text-xs text-slate-600">{item.adminNotes || '-'}</span> },
              ]}
              rows={request.items}
              rowKey={(item) => item.id}
            />
          </section>
          <section className="table-container" aria-label="Rincian biaya">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Rincian Biaya dari Admin</h2></div>
            <ResponsiveTable
              columns={[
                { key: 'type', label: 'Jenis', primary: true, render: (cost) => <span className="font-semibold text-slate-900">{COST_TYPES[cost.costType] || cost.costType}</span> },
                { key: 'desc', label: 'Uraian', render: (cost) => <span className="text-xs">{cost.description}{cost.materialRequestItemId ? ` · ${itemName.get(cost.materialRequestItemId) || ''}` : ''}</span> },
                { key: 'payee', label: 'Dibayar ke', render: (cost) => <span className="text-xs">{cost.payeeName || '-'}</span> },
                { key: 'amount', label: 'Nominal', align: 'right', render: (cost) => <span className="font-mono text-xs font-semibold">{formatCurrency(cost.amount)}</span> },
              ]}
              rows={request.costs || []}
              rowKey={(cost) => cost.id}
              empty="Belum ada rincian biaya."
            />
            <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total Paket</span>
              <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(request.totalCostAmount)}</span>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <DecisionPanel
            blockedReason={blockedReason}
            approveConfirm={`Setujui ${request.requestCode} senilai ${formatCurrency(request.totalCostAmount)}?`}
            onApprove={async (notes) => { await approveMaterialRequest(request.id, notes, poolId); onDone(`${request.requestCode} disetujui. Lapangan bisa mencatat surat jalannya.`); }}
            onReject={async (notes) => { await rejectMaterialRequest(request.id, notes); onDone(`${request.requestCode} ditolak.`); }}
            onConflict={reload}
          >
            {pools.length > 1 && (
              <label className="mt-3 block text-[11px] font-semibold text-slate-600">
                Pool tujuan material
                <select value={poolId} onChange={(event) => setPoolId(event.target.value)} className="input-control mt-1 text-sm">
                  <option value="">- Pilih pool -</option>
                  {pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.poolCode}{pool.poolName ? ` · ${pool.poolName}` : ''}</option>)}
                </select>
                <span className="mt-1 block font-normal text-slate-400">Project ini punya {pools.length} pool aktif.</span>
              </label>
            )}
          </DecisionPanel>
          <DecisionTrail entries={[
            { title: request.rejectedBy === 'admin' ? 'Ditolak Admin' : 'Diteruskan Admin', by: request.adminReviewedBy, at: request.adminReviewedAt, notes: request.adminNotes },
            { title: request.rejectedBy === 'finance' ? 'Ditolak Finance' : 'Disetujui Finance', by: request.financeReviewedBy, at: request.financeReviewedAt, notes: request.financeNotes },
          ]} />
        </aside>
      </div>
    </>
  );
}
