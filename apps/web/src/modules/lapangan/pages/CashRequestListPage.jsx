import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CashTabs, ListCard } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { listCashRequests } from '../services/fieldService.js';
import { REQUEST_STATUS, stageLabel, statusOptions } from '../utils/fieldFormat.js';

export default function CashRequestListPage({ initialNotice }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useRecord(() => listCashRequests({ status, page }), `${status}|${page}`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Lapangan' }, { label: 'Kas Lapangan' }]} />
      <PageHeader
        title="Kas Lapangan"
        subtitle="Ajukan izin belanja dengan nominal perkiraan. Setelah belanja, laporkan realisasinya beserta nota."
        actions={hasPermission('field-cash:create') ? <a href="#/lapangan/kas/new" className="btn btn-primary text-xs">+ Ajukan Dana</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>
      <CashTabs active="pengajuan" />
      <ListCard filters={<FilterChips options={statusOptions(REQUEST_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <ResponsiveTable
          columns={[
            { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/lapangan/kas/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.requestCode}</a> },
            { key: 'stage', label: 'Tahapan', render: (row) => <span className="text-xs text-slate-700">{stageLabel(row.subProject)}</span> },
            { key: 'date', label: 'Tanggal', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.requestDate)}</span> },
            { key: 'requested', label: 'Perkiraan', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.requestedAmount)}</span> },
            { key: 'realized', label: 'Realisasi', align: 'right', render: (row) => <span className="font-mono text-xs">{formatCurrency(row.realizedAmount)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={REQUEST_STATUS} /> },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Belum ada pengajuan dana."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="pengajuan" />}
      </ListCard>
    </>
  );
}
