import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { ListCard } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { listMaterialRequests } from '../services/fieldService.js';
import { REQUEST_STATUS, stageLabel, statusOptions } from '../utils/fieldFormat.js';

export default function MaterialRequestListPage({ initialNotice }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useRecord(() => listMaterialRequests({ status, page }), `${status}|${page}`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Lapangan' }, { label: 'Request Material' }]} />
      <PageHeader
        title="Request Material"
        subtitle="Ajukan material untuk tahapan konstruksi atau kontrak supply, lalu catat surat jalan dan penerimaannya."
        actions={hasPermission('material-request:create') ? <a href="#/lapangan/material/new" className="btn btn-primary text-xs">+ Ajukan Material</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>
      <ListCard filters={<FilterChips options={statusOptions(REQUEST_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <ResponsiveTable
          columns={[
            { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/lapangan/material/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.requestCode}</a> },
            { key: 'context', label: 'Tujuan', render: (row) => <span className="text-xs text-slate-700">{row.requestType === 'external_supply' ? `Supply · ${row.externalSupplyProject?.projectName || row.externalSupplyProject?.supplyProjectName || '-'}` : stageLabel(row.subProject)}</span> },
            { key: 'date', label: 'Tanggal', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.requestDate)}</span> },
            { key: 'by', label: 'Pengaju', render: (row) => <span className="text-xs">{row.requestedBy?.fullName || '-'}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={REQUEST_STATUS} /> },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Belum ada request material."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="request" />}
      </ListCard>
    </>
  );
}
