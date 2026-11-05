import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CashTabs, ListCard } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { listExpenseReports } from '../services/fieldService.js';
import { PROOF_STATUS, stageLabel, statusOptions } from '../utils/fieldFormat.js';

export default function ExpenseReportListPage({ initialNotice }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useRecord(() => listExpenseReports({ status, page }), `${status}|${page}`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Kas Lapangan', href: '#/lapangan/kas' }, { label: 'Laporan Realisasi' }]} />
      <PageHeader
        title="Kas Lapangan"
        subtitle="Laporan belanja yang sudah terjadi, diperiksa Finance terhadap nota."
        actions={hasPermission('field-cash:create') ? <a href="#/lapangan/kas/laporan/new" className="btn btn-secondary text-xs">+ Laporan Mendesak</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>
      <CashTabs active="laporan" />
      <ListCard filters={<FilterChips options={statusOptions(PROOF_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <ResponsiveTable
          columns={[
            { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/lapangan/kas/laporan/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.reportCode}</a> },
            { key: 'source', label: 'Dasar', render: (row) => (row.isUrgent ? <span className="text-xs font-semibold text-amber-700">Mendesak · tanpa pengajuan</span> : <span className="font-mono text-xs">{row.request?.requestCode}</span>) },
            { key: 'stage', label: 'Tahapan', render: (row) => <span className="text-xs text-slate-700">{stageLabel(row.subProject)}</span> },
            { key: 'date', label: 'Tanggal', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.reportDate)}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.totalAmount)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={PROOF_STATUS} /> },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Belum ada laporan realisasi."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="laporan" />}
      </ListCard>
    </>
  );
}
