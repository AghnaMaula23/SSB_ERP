import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CancelAction, DecisionTrail, FileLinks, InfoGrid } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { cancelPaymentProof, cancelWageClaim, getPaymentProof, getWageClaim, listPaymentProofs } from '../services/fieldService.js';
import { CANCELLABLE_REQUEST, PROOF_STATUS, REQUEST_STATUS, currentUserId, stageLabel } from '../utils/fieldFormat.js';

/** Bukti bayar satu klaim, termasuk yang ditolak beserta alasannya. */
function ProofCard({ proof, canCancel, onCancel }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4" aria-label={`Bukti ${proof.proofCode}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-slate-900">{proof.proofCode}</span>
        <StatusBadge status={proof.status} map={PROOF_STATUS} />
      </div>
      <p className="text-xs text-slate-600">
        Dibayar {formatCurrency(proof.paidAmount)} pada {formatDate(proof.paymentDate)}{proof.receiverName ? ` · diterima ${proof.receiverName}` : ''}
      </p>
      {proof.financeNotes && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">Finance: {proof.financeNotes}</p>}
      {proof.cancelReason && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">Dibatalkan: {proof.cancelReason}</p>}
      <FileLinks files={proof.files} label="Berkas Bukti" />
      {canCancel && <CancelAction label="Batalkan Bukti" onConfirm={onCancel} />}
    </section>
  );
}

export default function WageClaimDetailPage({ recordId, initialNotice }) {
  const { data, error, reload } = useRecord(async () => {
    const [claim, proofs] = await Promise.all([getWageClaim(recordId), listPaymentProofs(recordId)]);
    return { claim, proofs: await Promise.all((proofs.data || []).map((proof) => getPaymentProof(proof.id))) };
  }, recordId);
  const [notice, setNotice] = useState(initialNotice || '');

  if (error && !data) return <EmptyPanel icon="🔎" title="Klaim tidak ditemukan" action={<a href="#/lapangan/upah" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat klaim...</LoadingPanel>;

  const { claim, proofs } = data;
  const userId = currentUserId();
  const canCreate = hasPermission('labor-claim:create');
  const canCancel = canCreate && CANCELLABLE_REQUEST.includes(claim.status) && claim.requestedBy?.id === userId;

  return (
    <>
      <Breadcrumb items={[{ label: 'Upah Pekerja', href: '#/lapangan/upah' }, { label: claim.claimCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{claim.claimCode}</h1>
          <StatusBadge status={claim.status} map={REQUEST_STATUS} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && claim.status === 'approved' && !claim.payment && <a href={`#/lapangan/upah/${claim.id}/bukti/new`} className="btn btn-primary text-xs">+ Unggah Bukti Bayar</a>}
          {canCancel && <CancelAction label="Batalkan Klaim" onConfirm={async (reason) => { await cancelWageClaim(claim.id, reason); setNotice(`${claim.claimCode} dibatalkan. Lognya kembali belum diklaim.`); reload(); }} />}
        </div>
      </div>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Upah + Lembur" value={formatCurrency(claim.totalAmount)} accent />
        <MetricCard label="Orang / Hari-Orang" value={`${claim.workerCount} / ${claim.manDays}`} />
        <MetricCard label="Dibayar" value={claim.paidAmount === null ? 'Belum' : formatCurrency(claim.paidAmount)} tone="emerald" hint="Dari bukti tervalidasi" />
        <MetricCard label="Selisih" value={claim.difference === null ? '-' : formatCurrency(claim.difference)} tone={claim.difference < 0 ? 'red' : 'slate'} hint={claim.difference < 0 ? 'Dibayar melebihi klaim' : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tahapan', stageLabel(claim.subProject)],
            ['Periode', `${formatDate(claim.periodStart)} – ${formatDate(claim.periodEnd)}`],
            ['Pengaju', claim.requestedBy?.fullName],
            claim.notes && ['Catatan', claim.notes],
          ]} />
          <section className="table-container" aria-label="Rekap per pekerja">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Rekap per Pekerja</h2></div>
            <ResponsiveTable
              columns={[
                { key: 'name', label: 'Pekerja', primary: true, render: (row) => <span className="font-semibold text-slate-900">{row.workerName}</span> },
                { key: 'days', label: 'Hari', align: 'right', render: (row) => <span className="text-xs">{row.days}</span> },
                { key: 'wage', label: 'Upah', align: 'right', render: (row) => <span className="font-mono text-xs">{formatCurrency(row.totalDailyWage)}</span> },
                { key: 'overtime', label: 'Lembur', align: 'right', render: (row) => <span className="font-mono text-xs">{formatCurrency(row.totalOvertime)}</span> },
                { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.totalWage)}</span> },
              ]}
              rows={claim.perWorker}
              rowKey={(row) => row.projectWorkerId}
            />
          </section>
          {proofs.length > 0 && (
            <section className="card-panel space-y-3 p-4" aria-label="Bukti bayar">
              <h2 className="text-sm font-bold text-slate-900">Bukti Bayar</h2>
              {proofs.map((proof) => (
                <ProofCard
                  key={proof.id}
                  proof={proof}
                  canCancel={canCreate && proof.status === 'submitted' && proof.submittedBy?.id === userId}
                  onCancel={async (reason) => { await cancelPaymentProof(proof.id, reason); setNotice(`Bukti ${proof.proofCode} dibatalkan.`); reload(); }}
                />
              ))}
            </section>
          )}
        </div>
        <aside>
          <DecisionTrail entries={[
            { title: claim.rejectedBy === 'admin' ? 'Ditolak Admin' : 'Diteruskan Admin', by: claim.adminValidatedBy, at: claim.adminValidatedAt, notes: claim.adminNotes },
            { title: claim.rejectedBy === 'finance' ? 'Ditolak Finance' : 'Disetujui Finance', by: claim.financeReviewedBy, at: claim.financeReviewedAt, notes: claim.financeNotes },
            { title: 'Dibatalkan', by: claim.cancelledBy, at: claim.cancelledAt, notes: claim.cancelReason },
          ]} />
        </aside>
      </div>
    </>
  );
}
