import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatCurrency, formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { ListCard } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { listWageClaims } from '../services/fieldService.js';
import { PROOF_STATUS, REQUEST_STATUS, stageLabel, statusOptions } from '../utils/fieldFormat.js';

export default function WageClaimListPage({ initialNotice }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useRecord(() => listWageClaims({ status, page }), `${status}|${page}`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Lapangan' }, { label: 'Upah Pekerja' }]} />
      <PageHeader
        title="Klaim Upah Pekerja"
        subtitle="Klaim per periode dari log harian. Setelah disetujui, bayar pekerja lalu unggah buktinya."
        actions={hasPermission('labor-claim:create') ? <a href="#/lapangan/upah/new" className="btn btn-primary text-xs">+ Ajukan Klaim</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>
      <ListCard filters={<FilterChips options={statusOptions(REQUEST_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <ResponsiveTable
          columns={[
            { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/lapangan/upah/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.claimCode}</a> },
            { key: 'stage', label: 'Tahapan', render: (row) => <span className="text-xs text-slate-700">{stageLabel(row.subProject)}</span> },
            { key: 'period', label: 'Periode', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.periodStart)} – {formatDate(row.periodEnd)}</span> },
            { key: 'people', label: 'Orang / Hari', align: 'right', render: (row) => <span className="text-xs">{row.workerCount} / {row.manDays}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-mono text-xs font-semibold">{formatCurrency(row.totalAmount)}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={REQUEST_STATUS} /> },
            { key: 'payment', label: 'Pembayaran', align: 'center', render: (row) => (row.payment ? <StatusBadge status={row.payment.status} map={PROOF_STATUS} /> : <span className="text-xs text-slate-400">{row.status === 'approved' ? 'Belum ada bukti' : '-'}</span>) },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Belum ada klaim upah."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="klaim" />}
      </ListCard>
    </>
  );
}
