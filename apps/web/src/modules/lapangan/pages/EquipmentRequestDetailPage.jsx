import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { hasPermission } from '../../../services/permissions.js';
import { CancelAction, DecisionTrail, InfoGrid } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { cancelEquipmentRequest, getEquipmentRequest } from '../services/fieldService.js';
import { EQUIPMENT_STATUS, currentUserId, stageLabel } from '../utils/fieldFormat.js';

export default function EquipmentRequestDetailPage({ recordId, initialNotice }) {
  const { data: request, error, reload } = useRecord(() => getEquipmentRequest(recordId), recordId);
  const [notice, setNotice] = useState(initialNotice || '');

  if (error && !request) return <EmptyPanel icon="🔎" title="Request alat tidak ditemukan" action={<a href="#/lapangan/alat" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!request) return <LoadingPanel>Memuat request alat...</LoadingPanel>;

  const canCancel = ['submitted', 'equipment_review'].includes(request.status) && request.requestedBy?.id === currentUserId() && hasPermission('equipment-request:create');

  return (
    <>
      <Breadcrumb items={[{ label: 'Request Alat', href: '#/lapangan/alat' }, { label: request.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{request.requestCode}</h1>
          <StatusBadge status={request.status} map={EQUIPMENT_STATUS} />
        </div>
        <div className="flex flex-wrap gap-2">
        {canCancel && request.status === 'submitted' && <a href={`#/lapangan/alat/${request.id}/edit`} className="btn btn-secondary text-xs">✎ Ubah</a>}
        {canCancel && (
          <CancelAction
            needsReason={false}
            label="Batalkan Request"
            confirmText={`Batalkan ${request.requestCode}?`}
            onConfirm={async () => { await cancelEquipmentRequest(request.id); setNotice(`${request.requestCode} dibatalkan.`); reload(); }}
          />
        )}
        </div>
      </div>
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tahapan', stageLabel(request.subProject)],
            ['Tanggal', formatDate(request.requestDate)],
            ['Dibutuhkan', request.neededDate ? formatDate(request.neededDate) : '-'],
            ['Lokasi', request.locationDetail],
            ['Pengaju', request.requestedBy?.fullName],
            request.requestNotes && ['Catatan', request.requestNotes],
          ]} />
          <section className="table-container" aria-label="Alat diminta">
            <ResponsiveTable
              columns={[
                { key: 'type', label: 'Jenis Alat', primary: true, render: (item) => <span className="font-semibold text-slate-900">{item.equipmentType?.typeName}</span> },
                { key: 'requested', label: 'Diminta', align: 'right', render: (item) => <span className="font-mono text-xs">{item.requestedQuantity}</span> },
                { key: 'approved', label: 'Dipenuhi', align: 'right', render: (item) => <span className="font-mono text-xs font-semibold">{item.approvedQuantity ?? '-'}</span> },
                { key: 'hours', label: 'Est. Jam', align: 'right', render: (item) => <span className="font-mono text-xs">{item.estimatedWorkhours === null ? '-' : formatNumber(item.estimatedWorkhours)}</span> },
                { key: 'notes', label: 'Catatan Divisi Alat', render: (item) => <span className="text-xs text-slate-600">{item.decisionNotes || '-'}</span> },
              ]}
              rows={request.items}
              rowKey={(item) => item.id}
            />
          </section>
        </div>
        <aside>
          <DecisionTrail entries={[
            { title: request.rejectedBy === 'admin' ? 'Ditolak Admin' : 'Diteruskan Admin', by: request.adminReviewedBy, at: request.adminReviewedAt, notes: request.adminNotes },
            { title: request.rejectedBy === 'equipment_division' ? 'Ditolak Divisi Alat' : 'Diputuskan Divisi Alat', by: request.equipmentReviewedBy, at: request.equipmentReviewedAt, notes: request.equipmentNotes },
            { title: 'Dibatalkan', by: request.cancelledBy, at: request.cancelledAt },
          ]} />
        </aside>
      </div>
    </>
  );
}
