import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate } from '../../admin/project/utils/projectFormat.js';
import { DecisionTrail, FileLinks, InfoGrid } from '../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { getPaymentProof } from '../../lapangan/services/fieldService.js';
import { PROOF_STATUS, stageLabel } from '../../lapangan/utils/fieldFormat.js';
import DecisionPanel from '../components/DecisionPanel.jsx';
import { rejectPaymentProof, validatePaymentProof } from '../services/financeService.js';
import { blockedReasonFor } from '../utils/financeFormat.js';

/** Bukti bayar upah di meja Finance. Tervalidasi = klaim lunas; nominal boleh beda dari klaim. */
export default function PaymentProofReview({ recordId, onDone }) {
  const { data: proof, error, reload } = useRecord(() => getPaymentProof(recordId), recordId);
  if (error && !proof) return <EmptyPanel icon="🔎" title="Bukti bayar tidak ditemukan" action={<a href="#/finance/approvals/bukti" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!proof) return <LoadingPanel>Memuat bukti bayar...</LoadingPanel>;

  const blockedReason = blockedReasonFor({ status: proof.status, expectedStatus: 'submitted', permission: 'labor-claim:approve', ownId: proof.submittedBy?.id });
  const claim = proof.claim;

  return (
    <>
      <Breadcrumb items={[{ label: 'Approvals', href: '#/finance/approvals/bukti' }, { label: 'Bukti Bayar Upah', href: '#/finance/approvals/bukti' }, { label: proof.proofCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-leaf-800">{proof.proofCode}</h1>
        <StatusBadge status={proof.status} map={PROOF_STATUS} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Total Klaim" value={formatCurrency(claim.totalAmount)} hint={claim.claimCode} />
        <MetricCard label="Dibayar" value={formatCurrency(proof.paidAmount)} accent tone="emerald" />
        <MetricCard label="Selisih" value={formatCurrency(proof.difference)} tone={proof.difference !== 0 ? 'red' : 'slate'} hint={proof.difference < 0 ? 'Dibayar melebihi klaim' : proof.difference > 0 ? 'Dibayar kurang dari klaim' : 'Sesuai klaim'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Klaim', <a key="claim" href={`#/finance/approvals/upah/${claim.id}`} className="font-mono text-brand-700 hover:underline">{claim.claimCode}</a>],
            ['Tahapan', stageLabel(claim.subProject)],
            ['Periode', `${formatDate(claim.periodStart)} – ${formatDate(claim.periodEnd)}`],
            ['Tanggal Bayar', formatDate(proof.paymentDate)],
            ['Diterima Oleh', proof.receiverName],
            ['Pengunggah', proof.submittedBy?.fullName],
            proof.notes && ['Catatan', proof.notes],
          ]} />
          <FileLinks files={proof.files} label="Berkas Bukti" />
        </div>
        <aside className="space-y-4">
          <DecisionPanel
            blockedReason={blockedReason}
            approveLabel="Validasi"
            approveConfirm={`Validasi ${proof.proofCode}? Klaim ${claim.claimCode} dinyatakan lunas.`}
            onApprove={async (notes) => { await validatePaymentProof(proof.id, notes); onDone(`${proof.proofCode} divalidasi. Klaim ${claim.claimCode} lunas.`); }}
            onReject={async (notes) => { await rejectPaymentProof(proof.id, notes); onDone(`${proof.proofCode} ditolak. Lapangan perlu mengunggah bukti baru.`); }}
            onConflict={reload}
          />
          <DecisionTrail entries={[
            { title: proof.status === 'rejected' ? 'Ditolak Finance' : 'Divalidasi Finance', by: proof.validatedBy, at: proof.validatedAt, notes: proof.financeNotes },
            { title: 'Dibatalkan', by: proof.cancelledBy, at: proof.cancelledAt, notes: proof.cancelReason },
          ]} />
        </aside>
      </div>
    </>
  );
}
