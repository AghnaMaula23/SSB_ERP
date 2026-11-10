import { useState } from 'react';
import ResponsiveTable from '../../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../project/utils/projectFormat.js';
import { hasPermission } from '../../../../services/permissions.js';
import { DecisionTrail, InfoGrid } from '../../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../../lapangan/hooks/useFieldData.js';
import { approveCashRequest, getCashRequest, rejectCashRequest, validateCashRequest } from '../../../lapangan/services/fieldService.js';
import { PROOF_STATUS, REQUEST_STATUS, stageLabel } from '../../../lapangan/utils/fieldFormat.js';
import { currentUserId } from '../utils/approvalFormat.js';

const STAGES = {
  admin: {
    status: 'submitted',
    permission: 'field-cash:validate',
    title: 'Keputusan Admin',
    approveLabel: 'Teruskan ke Finance',
    act: validateCashRequest,
    confirm: (code, amount) => `Teruskan ${code} senilai ${amount} ke Finance?`,
    done: (code) => `${code} diteruskan ke Finance.`,
    listHref: '#/admin/approvals/kas',
    crumb: 'Pusat Approval',
  },
  finance: {
    status: 'waiting_finance_approval',
    permission: 'field-cash:approve',
    title: 'Keputusan Finance',
    approveLabel: 'Setujui',
    act: approveCashRequest,
    confirm: (code, amount) => `Setujui ${code} senilai ${amount}?`,
    done: (code) => `${code} disetujui. Lapangan boleh berbelanja lalu melaporkan realisasinya.`,
    listHref: '#/finance/approvals/kas',
    crumb: 'Approvals',
  },
};

/**
 * Periksa pengajuan dana lapangan: teruskan ke Finance atau tolak (alasan wajib,
 * final). Admin tidak mengubah nominal: angkanya perkiraan, dan yang menjadi
 * pengeluaran resmi adalah laporan realisasi yang divalidasi Finance.
 */
export default function FieldCashReview({ recordId, onDone, stage = 'admin' }) {
  const config = STAGES[stage];
  const { data: row, error, reload } = useRecord(() => getCashRequest(recordId), recordId);
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  if (error && !row) return <EmptyPanel icon="🔎" title="Pengajuan tidak ditemukan" action={<a href={config.listHref} className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!row) return <LoadingPanel>Memuat pengajuan...</LoadingPanel>;

  const own = row.requestedBy?.id === currentUserId();
  // Pemisahan tugas: yang meneruskan sebagai Admin tidak boleh menyetujui sebagai Finance.
  const ownAdminStep = stage === 'finance' && row.adminValidatedBy?.id === currentUserId();
  const canDecide = row.status === config.status && hasPermission(config.permission) && !own && !ownAdminStep;

  const decide = async (action) => {
    if (action === 'reject' && !notes.trim()) { setActionError('Alasan penolakan wajib diisi supaya Lapangan tahu yang harus diperbaiki.'); return; }
    if (action === 'validate' && !window.confirm(config.confirm(row.requestCode, formatCurrency(row.requestedAmount)))) return;
    setBusy(true);
    setActionError('');
    try {
      if (action === 'validate') await config.act(row.id, notes);
      else await rejectCashRequest(row.id, notes);
      onDone(action === 'validate' ? config.done(row.requestCode) : `${row.requestCode} ditolak.`);
    } catch (requestError) {
      setActionError(requestError.message);
      setBusy(false);
      // 409 = sudah diproses user lain: pesannya tetap tampil, datanya dimuat ulang.
      if (requestError.status === 409) reload();
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: config.crumb, href: config.listHref }, { label: 'Kas Lapangan' }, { label: row.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-slate-900">{row.requestCode}</h1>
        <StatusBadge status={row.status} map={REQUEST_STATUS} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tahapan', stageLabel(row.subProject)],
            ['Tanggal', formatDate(row.requestDate)],
            ['Dibutuhkan', row.neededDate ? formatDate(row.neededDate) : '-'],
            ['Pengaju', row.requestedBy?.fullName],
            row.notes && ['Catatan', row.notes],
          ]} />
          <section className="table-container" aria-label="Rincian biaya">
            <ResponsiveTable
              columns={[
                { key: 'name', label: 'Biaya', primary: true, render: (item) => <span className="font-semibold text-slate-900">{item.itemName}</span> },
                { key: 'category', label: 'Kategori', render: (item) => <span className="text-xs">{item.category?.categoryName}</span> },
                { key: 'qty', label: 'Jumlah', align: 'right', render: (item) => <span className="whitespace-nowrap text-xs">{formatNumber(item.quantity)} {item.unit}</span> },
                { key: 'price', label: 'Harga', align: 'right', render: (item) => <span className="font-mono text-xs">{formatCurrency(item.estimatedUnitPrice)}</span> },
                { key: 'total', label: 'Total', align: 'right', render: (item) => <span className="font-mono text-xs font-semibold">{formatCurrency(item.estimatedAmount)}</span> },
              ]}
              rows={row.items}
              rowKey={(item) => item.id}
            />
            <div className="flex items-center justify-between bg-slate-100 px-5 py-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-700">Total Perkiraan</span>
              <span className="font-mono text-xl font-bold text-slate-900">{formatCurrency(row.requestedAmount)}</span>
            </div>
          </section>
          {row.reports.length > 0 && (
            <section className="card-panel p-4 text-xs" aria-label="Laporan realisasi">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Laporan Realisasi · tervalidasi {formatCurrency(row.realizedAmount)}</p>
              <ul className="mt-2 space-y-2">
                {row.reports.map((report) => (
                  <li key={report.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{report.reportCode} · {formatCurrency(report.totalAmount)}</span>
                    <StatusBadge status={report.status} map={PROOF_STATUS} />
                  </li>
                ))}
              </ul>
            </section>
          )}
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
              {ownAdminStep && row.status === config.status && <Notice tone="warning">Anda meneruskannya sebagai Admin, jadi persetujuan Finance butuh orang kedua.</Notice>}
              {own && row.status === config.status && <Notice tone="warning">Ini pengajuan Anda sendiri, jadi keputusannya milik orang lain.</Notice>}
            </>
          )}
          <DecisionTrail entries={[
            { title: row.rejectedBy === 'admin' ? 'Ditolak Admin' : 'Diteruskan Admin', by: row.adminValidatedBy, at: row.adminValidatedAt, notes: row.adminNotes },
            { title: row.rejectedBy === 'finance' ? 'Ditolak Finance' : 'Disetujui Finance', by: row.financeReviewedBy, at: row.financeReviewedAt, notes: row.financeNotes },
            { title: 'Dibatalkan', by: row.cancelledBy, at: row.cancelledAt, notes: row.cancelReason },
          ]} />
        </aside>
      </div>
    </>
  );
}
