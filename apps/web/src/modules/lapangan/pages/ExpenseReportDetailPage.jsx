import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CancelAction, DecisionTrail, FileLinks, InfoGrid } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { cancelExpenseReport, getExpenseReport } from '../services/fieldService.js';
import { PROOF_STATUS, currentUserId, stageLabel } from '../utils/fieldFormat.js';

export default function ExpenseReportDetailPage({ recordId, initialNotice }) {
  const { data: row, error, reload } = useRecord(() => getExpenseReport(recordId), recordId);
  const [notice, setNotice] = useState(initialNotice || '');

  if (error && !row) return <EmptyPanel icon="🔎" title="Laporan tidak ditemukan" action={<a href="#/lapangan/kas/laporan" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!row) return <LoadingPanel>Memuat laporan...</LoadingPanel>;

  const canCancel = row.status === 'submitted' && row.submittedBy?.id === currentUserId() && hasPermission('field-cash:create');

  return (
    <>
      <Breadcrumb items={[{ label: 'Kas Lapangan', href: '#/lapangan/kas' }, { label: 'Laporan Realisasi', href: '#/lapangan/kas/laporan' }, { label: row.reportCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{row.reportCode}</h1>
          <StatusBadge status={row.status} map={PROOF_STATUS} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canCancel && <a href={`#/lapangan/kas/laporan/${row.id}/edit`} className="btn btn-secondary text-xs">✎ Ubah</a>}
          {canCancel && <CancelAction label="Batalkan Laporan" onConfirm={async (reason) => { await cancelExpenseReport(row.id, reason); setNotice(`${row.reportCode} dibatalkan.`); reload(); }} />}
        </div>
      </div>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tahapan', stageLabel(row.subProject)],
            ['Dasar', row.isUrgent ? 'Mendesak · tanpa pengajuan' : <a key="request" href={`#/lapangan/kas/${row.request.id}`} className="font-mono text-brand-700 hover:underline">{row.request.requestCode}</a>],
            ['Tanggal', formatDate(row.reportDate)],
            ['Total Nota', formatCurrency(row.totalAmount)],
            row.request && ['Perkiraan Pengajuan', formatCurrency(row.request.requestedAmount)],
            ['Pelapor', row.submittedBy?.fullName],
            row.urgentReason && ['Alasan Mendesak', row.urgentReason],
            row.notes && ['Catatan', row.notes],
          ]} />
          <section className="table-container" aria-label="Rincian belanja">
            <ResponsiveTable
              columns={[
                { key: 'name', label: 'Belanja', primary: true, render: (item) => <span className="font-semibold text-slate-900">{item.itemName}</span> },
                { key: 'category', label: 'Kategori', render: (item) => <span className="text-xs">{item.category?.categoryName}</span> },
                { key: 'date', label: 'Tanggal', render: (item) => <span className="whitespace-nowrap text-xs">{formatDate(item.expenseDate)}</span> },
                { key: 'vendor', label: 'Vendor', render: (item) => <span className="text-xs">{item.vendorName || '-'}</span> },
                { key: 'qty', label: 'Jumlah', align: 'right', render: (item) => <span className="whitespace-nowrap text-xs">{formatNumber(item.quantity)} {item.unit}</span> },
                { key: 'total', label: 'Total', align: 'right', render: (item) => <span className="font-mono text-xs font-semibold">{formatCurrency(item.totalPrice)}</span> },
              ]}
              rows={row.items}
              rowKey={(item) => item.id}
            />
          </section>
        </div>
        <aside className="space-y-4">
          <FileLinks files={row.receipts} label="Nota" />
          <DecisionTrail entries={[
            { title: row.status === 'rejected' ? 'Ditolak Finance' : 'Divalidasi Finance', by: row.validatedBy, at: row.validatedAt, notes: row.financeNotes },
            { title: 'Dibatalkan', by: row.cancelledBy, at: row.cancelledAt, notes: row.cancelReason },
          ]} />
        </aside>
      </div>
    </>
  );
}
