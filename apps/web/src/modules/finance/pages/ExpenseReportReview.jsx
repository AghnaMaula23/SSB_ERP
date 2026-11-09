import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatCurrency, formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { DecisionTrail, FileLinks, InfoGrid } from '../../lapangan/components/FieldUi.jsx';
import { useRecord } from '../../lapangan/hooks/useFieldData.js';
import { getExpenseReport } from '../../lapangan/services/fieldService.js';
import { PROOF_STATUS, stageLabel } from '../../lapangan/utils/fieldFormat.js';
import DecisionPanel from '../components/DecisionPanel.jsx';
import { rejectExpenseReport, validateExpenseReport } from '../services/financeService.js';
import { blockedReasonFor } from '../utils/financeFormat.js';

/**
 * Laporan realisasi + nota di meja Finance (tanpa tahap Admin). Tervalidasi =
 * pengeluaran resmi lapangan; harga nota boleh melebihi pengajuan — Finance yang menilai.
 */
export default function ExpenseReportReview({ recordId, onDone }) {
  const { data: row, error, reload } = useRecord(() => getExpenseReport(recordId), recordId);
  if (error && !row) return <EmptyPanel icon="🔎" title="Laporan tidak ditemukan" action={<a href="#/finance/approvals/laporan" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!row) return <LoadingPanel>Memuat laporan...</LoadingPanel>;

  const blockedReason = blockedReasonFor({ status: row.status, expectedStatus: 'submitted', permission: 'field-cash:approve', ownId: row.submittedBy?.id });
  const over = row.request ? row.totalAmount - row.request.requestedAmount : 0;

  return (
    <>
      <Breadcrumb items={[{ label: 'Approvals', href: '#/finance/approvals/laporan' }, { label: 'Laporan Realisasi', href: '#/finance/approvals/laporan' }, { label: row.reportCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-leaf-800">{row.reportCode}</h1>
        <StatusBadge status={row.status} map={PROOF_STATUS} />
        {row.isUrgent && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Mendesak · tanpa pengajuan</span>}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label="Total Nota" value={formatCurrency(row.totalAmount)} accent />
        <MetricCard label="Perkiraan Pengajuan" value={row.request ? formatCurrency(row.request.requestedAmount) : '-'} hint={row.request?.requestCode || 'Tanpa pengajuan'} />
        <MetricCard label="Selisih" value={row.request ? formatCurrency(over) : '-'} tone={over > 0 ? 'red' : 'slate'} hint={over > 0 ? 'Realisasi melebihi perkiraan' : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tahapan', stageLabel(row.subProject)],
            ['Tanggal Laporan', formatDate(row.reportDate)],
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
          <DecisionPanel
            blockedReason={blockedReason}
            approveLabel="Validasi"
            approveConfirm={`Validasi ${row.reportCode} senilai ${formatCurrency(row.totalAmount)} sebagai pengeluaran resmi?`}
            onApprove={async (notes) => { await validateExpenseReport(row.id, notes); onDone(`${row.reportCode} divalidasi.`); }}
            onReject={async (notes) => { await rejectExpenseReport(row.id, notes); onDone(`${row.reportCode} ditolak. Lapangan bisa melapor ulang.`); }}
            onConflict={reload}
          />
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
