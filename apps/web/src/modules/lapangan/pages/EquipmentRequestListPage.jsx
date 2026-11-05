import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, Notice, PageHeader, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { FilterChips, Pager } from '../../admin/approvals/components/ApprovalUi.jsx';
import { formatDate } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { ListCard } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { listEquipmentRequests } from '../services/fieldService.js';
import { EQUIPMENT_STATUS, stageLabel, statusOptions } from '../utils/fieldFormat.js';

export default function EquipmentRequestListPage({ initialNotice }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useRecord(() => listEquipmentRequests({ status, page }), `${status}|${page}`);

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Lapangan' }, { label: 'Request Alat' }]} />
      <PageHeader
        title="Request Alat"
        subtitle="Ajukan alat untuk tahapan yang berjalan. Admin meneruskan, Divisi Alat memutuskan unitnya."
        actions={hasPermission('equipment-request:create') ? <a href="#/lapangan/alat/new" className="btn btn-primary text-xs">+ Ajukan Alat</a> : null}
      />
      <Notice tone="success">{initialNotice}</Notice>
      <ListCard filters={<FilterChips options={statusOptions(EQUIPMENT_STATUS)} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <ResponsiveTable
          columns={[
            { key: 'code', label: 'Kode', primary: true, render: (row) => <a href={`#/lapangan/alat/${row.id}`} className="font-mono text-sm font-bold text-leaf-700 hover:underline">{row.requestCode}</a> },
            { key: 'stage', label: 'Tahapan', render: (row) => <span className="text-xs text-slate-700">{stageLabel(row.subProject)}</span> },
            { key: 'needed', label: 'Dibutuhkan', render: (row) => <span className="whitespace-nowrap text-xs">{row.neededDate ? formatDate(row.neededDate) : '-'}</span> },
            { key: 'by', label: 'Pengaju', render: (row) => <span className="text-xs">{row.requestedBy?.fullName || '-'}</span> },
            { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} map={EQUIPMENT_STATUS} /> },
          ]}
          rows={data?.data || []}
          rowKey={(row) => row.id}
          loading={!data && !error}
          error={error}
          empty="Belum ada request alat."
        />
        {data?.total > 0 && <Pager page={page} totalPages={Math.max(1, data.totalPages || 1)} total={data.total} shown={data.data.length} onChange={setPage} label="request" />}
      </ListCard>
    </>
  );
}
