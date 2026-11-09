import { useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate } from '../../project/utils/projectFormat.js';
import { WORKER_TYPES } from '../../project/services/workerService.js';
import { hasPermission } from '../../../../services/permissions.js';
import { DecisionTrail, InfoGrid } from '../../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { approveWageClaim, getWageClaim, rejectWageClaim, validateWageClaim } from '../../../lapangan/services/fieldService.js';
import { REQUEST_STATUS, stageLabel } from '../../../lapangan/utils/fieldFormat.js';
import { currentUserId } from '../utils/approvalFormat.js';

const STAGES = {
  admin: {
    status: 'submitted',
    permission: 'labor-claim:validate',
    title: 'Keputusan Admin',
    approveLabel: 'Teruskan ke Finance',
    act: validateWageClaim,
    confirm: (code, amount) => `Teruskan ${code} senilai ${amount} ke Finance?`,
    done: (code) => `${code} diteruskan ke Finance.`,
    listHref: '#/admin/approvals/upah',
    crumb: 'Pusat Approval',
  },
  finance: {
    status: 'waiting_finance_approval',
    permission: 'labor-claim:approve',
    title: 'Keputusan Finance',
    approveLabel: 'Setujui',
    act: approveWageClaim,
    confirm: (code, amount) => `Setujui ${code} senilai ${amount}?`,
    done: (code) => `${code} disetujui. Lapangan membayar pekerja lalu mengunggah bukti bayar.`,
    listHref: '#/finance/approvals/upah',
    crumb: 'Approvals',
  },
};

/**
 * Periksa klaim upah: kehadiran & upah per orang per hari, lalu teruskan ke
 * Finance atau tolak. Baris klaim adalah salinan log, jadi tidak diubah di sini:
 * log yang salah diperbaiki Lapangan setelah klaim ditolak.
 */
export default function WageClaimReview({ recordId, onDone, stage = 'admin' }) {
  const config = STAGES[stage];
  const { data: claim, error, reload } = useRecord(() => getWageClaim(recordId), recordId);
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  if (error && !claim) return <EmptyPanel icon="🔎" title="Klaim tidak ditemukan" action={<a href={config.listHref} className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!claim) return <LoadingPanel>Memuat klaim...</LoadingPanel>;

  const own = claim.requestedBy?.id === currentUserId();
  // Pemisahan tugas: yang meneruskan sebagai Admin tidak boleh menyetujui sebagai Finance.
  const ownAdminStep = stage === 'finance' && claim.adminValidatedBy?.id === currentUserId();
  const canDecide = claim.status === config.status && hasPermission(config.permission) && !own && !ownAdminStep;

  const decide = async (action) => {
    if (action === 'reject' && !notes.trim()) { setActionError('Alasan penolakan wajib diisi supaya Lapangan tahu log mana yang harus diperbaiki.'); return; }
    if (action === 'validate' && !window.confirm(config.confirm(claim.claimCode, formatCurrency(claim.totalAmount)))) return;
    setBusy(true);
    setActionError('');
    try {
      if (action === 'validate') await config.act(claim.id, notes);
      else await rejectWageClaim(claim.id, notes);
      onDone(action === 'validate' ? config.done(claim.claimCode) : `${claim.claimCode} ditolak. Lognya terbuka kembali untuk Lapangan.`);
    } catch (requestError) {
      setActionError(requestError.message);
      setBusy(false);
      // 409 = sudah diproses user lain: pesannya tetap tampil, datanya dimuat ulang.
      if (requestError.status === 409) reload();
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: config.crumb, href: config.listHref }, { label: 'Klaim Upah' }, { label: claim.claimCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-slate-900">{claim.claimCode}</h1>
        <StatusBadge status={claim.status} map={REQUEST_STATUS} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Total Upah + Lembur" value={formatCurrency(claim.totalAmount)} accent />
        <MetricCard label="Pekerja" value={claim.workerCount} />
        <MetricCard label="Hari-Orang" value={claim.manDays} />
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
          <section className="table-container" aria-label="Kehadiran harian">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Kehadiran Harian</h2></div>
            <ResponsiveTable
              columns={[
                { key: 'date', label: 'Tanggal', primary: true, render: (item) => <span className="font-semibold text-slate-900">{formatDate(item.workDate)}</span> },
                { key: 'name', label: 'Pekerja', render: (item) => <span className="text-xs">{item.workerName}</span> },
                { key: 'role', label: 'Peran', render: (item) => <span className="text-xs">{item.workerRole} · {WORKER_TYPES[item.workerType]?.label}</span> },
                { key: 'wage', label: 'Upah', align: 'right', render: (item) => <span className="font-mono text-xs">{formatCurrency(item.dailyWage)}</span> },
                { key: 'overtime', label: 'Lembur', align: 'right', render: (item) => <span className="font-mono text-xs">{item.overtimeAmount > 0 ? formatCurrency(item.overtimeAmount) : '-'}</span> },
                { key: 'notes', label: 'Catatan Tugas', render: (item) => <span className="text-xs text-slate-600">{item.taskNotes || '-'}</span> },
              ]}
              rows={claim.items}
              rowKey={(item) => item.id}
            />
          </section>
        </div>
        <aside className="space-y-4">
          {canDecide ? (
            <div className="card-panel p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{config.title}</p>
              <label htmlFor="decision-notes" className="mt-3 block text-[11px] font-semibold text-slate-600">Catatan / alasan penolakan</label>
              <textarea id="decision-notes" rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); setActionError(''); }} className="input-control mt-1 h-auto resize-y text-sm" placeholder="Wajib bila menolak" />
              {actionError && <div className="mt-2"><Notice tone="error">{actionError}</Notice></div>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => decide('reject')} className="btn btn-secondary text-xs text-red-600">Tolak</button>
                <button type="button" disabled={busy} onClick={() => decide('validate')} className="btn bg-leaf-700 text-xs text-white hover:bg-leaf-800">{config.approveLabel}</button>
              </div>
            </div>
          ) : (
            <>
              {actionError && <Notice tone="error">{actionError}</Notice>}
              {ownAdminStep && claim.status === config.status && <Notice tone="warning">Anda meneruskannya sebagai Admin, jadi persetujuan Finance butuh orang kedua.</Notice>}
              {own && claim.status === config.status && <Notice tone="warning">Ini klaim Anda sendiri, jadi keputusannya milik orang lain.</Notice>}
            </>
          )}
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
