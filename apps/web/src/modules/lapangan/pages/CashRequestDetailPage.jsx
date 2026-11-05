import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CancelAction, DecisionTrail, InfoGrid } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { cancelCashRequest, getCashRequest } from '../services/fieldService.js';
import { CANCELLABLE_REQUEST, PROOF_STATUS, REQUEST_STATUS, currentUserId, stageLabel } from '../utils/fieldFormat.js';

export default function CashRequestDetailPage({ recordId, initialNotice }) {
  const { data: row, error, reload } = useRecord(() => getCashRequest(recordId), recordId);
  const [notice, setNotice] = useState(initialNotice || '');

  if (error && !row) return <EmptyPanel icon="🔎" title="Pengajuan tidak ditemukan" action={<a href="#/lapangan/kas" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!row) return <LoadingPanel>Memuat pengajuan...</LoadingPanel>;

  const canCreate = hasPermission('field-cash:create');
  const canCancel = canCreate && CANCELLABLE_REQUEST.includes(row.status) && row.requestedBy?.id === currentUserId();

  return (
    <>
      <Breadcrumb items={[{ label: 'Kas Lapangan', href: '#/lapangan/kas' }, { label: row.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{row.requestCode}</h1>
          <StatusBadge status={row.status} map={REQUEST_STATUS} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && row.status === 'approved' && <a href={`#/lapangan/kas/${row.id}/laporan/new`} className="btn btn-primary text-xs">+ Lapor Realisasi</a>}
          {canCancel && <CancelAction label="Batalkan Pengajuan" onConfirm={async (reason) => { await cancelCashRequest(row.id, reason); setNotice(`${row.requestCode} dibatalkan.`); reload(); }} />}
        </div>
      </div>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Perkiraan" value={formatCurrency(row.requestedAmount)} accent />
        <MetricCard label="Realisasi Tervalidasi" value={formatCurrency(row.realizedAmount)} tone="emerald" />
        <MetricCard label="Selisih" value={formatCurrency(row.difference)} tone={row.difference < 0 ? 'red' : 'slate'} hint={row.difference < 0 ? 'Realisasi melebihi pengajuan' : undefined} />
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
          </section>
          <section className="table-container" aria-label="Laporan realisasi">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Laporan Realisasi</h2></div>
            <ResponsiveTable
              columns={[
                { key: 'code', label: 'Kode', primary: true, render: (report) => <a href={`#/lapangan/kas/laporan/${report.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{report.reportCode}</a> },
                { key: 'date', label: 'Tanggal', render: (report) => <span className="text-xs">{formatDate(report.reportDate)}</span> },
                { key: 'total', label: 'Total', align: 'right', render: (report) => <span className="font-mono text-xs font-semibold">{formatCurrency(report.totalAmount)}</span> },
                { key: 'status', label: 'Status', align: 'center', render: (report) => <StatusBadge status={report.status} map={PROOF_STATUS} /> },
              ]}
              rows={row.reports}
              rowKey={(report) => report.id}
              empty="Belum ada laporan realisasi."
            />
          </section>
        </div>
        <aside>
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
