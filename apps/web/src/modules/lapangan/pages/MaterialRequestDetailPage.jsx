import { useState } from 'react';
import ResponsiveTable from '../../../components/ResponsiveTable.jsx';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../admin/project/components/ProjectUi.jsx';
import { formatDate, formatNumber } from '../../admin/project/utils/projectFormat.js';
import { openFileInNewTab } from '../../admin/files/services/projectFiles.js';
import { hasPermission } from '../../../services/permissions.js';
import { CancelAction, DecisionTrail, InfoGrid } from '../components/FieldUi.jsx';
import { useRecord } from '../hooks/useFieldData.js';
import { cancelDelivery, cancelMaterialRequest, getMaterialRequest, listDeliveries } from '../services/fieldService.js';
import { CANCELLABLE_REQUEST, REQUEST_STATUS, currentUserId, stageLabel } from '../utils/fieldFormat.js';

/** Detail request material + surat jalan + penerimaannya. */
export default function MaterialRequestDetailPage({ recordId, initialNotice }) {
  const { data, error, reload } = useRecord(async () => {
    const [request, deliveries] = await Promise.all([getMaterialRequest(recordId), listDeliveries(recordId)]);
    return { request, deliveries: deliveries.data || [] };
  }, recordId);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });

  if (error && !data) return <EmptyPanel icon="🔎" title="Request material tidak ditemukan" action={<a href="#/lapangan/material" className="btn btn-secondary text-xs">← Kembali</a>}>{error}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat request material...</LoadingPanel>;

  const { request, deliveries } = data;
  const base = `#/lapangan/material/${request.id}`;
  const canDeliver = request.status === 'approved' && hasPermission('material-delivery:create');
  const canReceive = hasPermission('material-receipt:create');
  const isOwn = request.requestedBy?.id === currentUserId();

  // 409 = keadaan dokumen sudah berubah: tampilkan pesannya dan muat ulang.
  const showError = (requestError) => {
    setNotice({ tone: 'error', text: requestError.message });
    if (requestError.status === 409) reload();
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Request Material', href: '#/lapangan/material' }, { label: request.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{request.requestCode}</h1>
          <StatusBadge status={request.status} map={REQUEST_STATUS} />
        </div>
        {isOwn && CANCELLABLE_REQUEST.includes(request.status) && hasPermission('material-request:create') && (
          <CancelAction
            needsReason={false}
            label="Batalkan Request"
            confirmText={`Batalkan ${request.requestCode}?`}
            onConfirm={async () => { await cancelMaterialRequest(request.id); setNotice({ tone: 'success', text: `${request.requestCode} dibatalkan.` }); reload(); }}
          />
        )}
      </div>
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <InfoGrid rows={[
            ['Tujuan', request.requestType === 'external_supply' ? `Supply · ${request.externalSupplyProject?.projectName || request.externalSupplyProject?.supplyProjectName || '-'}` : stageLabel(request.subProject)],
            ['Tanggal', formatDate(request.requestDate)],
            ['Dibutuhkan', request.neededDate ? formatDate(request.neededDate) : '-'],
            ['Pengaju', request.requestedBy?.fullName],
            request.requestNotes && ['Catatan', request.requestNotes],
          ]} />

          <section className="table-container" aria-label="Material diminta">
            <ResponsiveTable
              columns={[
                { key: 'name', label: 'Material', primary: true, render: (item) => <span className="font-semibold text-slate-900">{item.materialType?.materialName}</span> },
                { key: 'requested', label: 'Diminta', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs">{formatNumber(item.requestedQuantity)} {item.unit}</span> },
                { key: 'effective', label: 'Berlaku', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{formatNumber(item.effectiveQuantity)} {item.unit}</span> },
                { key: 'delivered', label: 'Terkirim', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs">{formatNumber(item.deliveredQuantity)} {item.unit}</span> },
                { key: 'accepted', label: 'Diterima', align: 'right', render: (item) => <span className="whitespace-nowrap font-mono text-xs text-leaf-700">{formatNumber(item.acceptedQuantity)} {item.unit}</span> },
                { key: 'notes', label: 'Catatan Admin', render: (item) => <span className="text-xs text-slate-600">{item.adminNotes || '-'}</span> },
              ]}
              rows={request.items}
              rowKey={(item) => item.id}
            />
          </section>

          <section className="table-container" aria-label="Surat jalan">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">Surat Jalan & Penerimaan</h2>
              {canDeliver && <a href={`${base}/delivery/new`} className="btn btn-primary text-xs">+ Catat Surat Jalan</a>}
            </div>
            <ResponsiveTable
              columns={[
                { key: 'note', label: 'Surat Jalan', primary: true, render: (row) => <span className="font-mono text-xs font-bold">{row.deliveryNoteNumber}</span>, },
                { key: 'material', label: 'Material', render: (row) => <span className="text-xs">{row.materialType?.materialName} · {formatNumber(row.deliveredQuantity)} {row.unit}</span> },
                { key: 'vehicle', label: 'Kendaraan', render: (row) => <span className="text-xs">{row.vehicleNumber} · {row.driverName}</span> },
                { key: 'date', label: 'Tanggal', render: (row) => <span className="whitespace-nowrap text-xs">{formatDate(row.deliveryNoteDate)}</span> },
                {
                  key: 'state',
                  label: 'Status',
                  render: (row) => {
                    if (row.isCancelled) return <span className="text-xs font-semibold text-slate-500" title={row.cancelReason}>Dibatalkan</span>;
                    if (row.receipt) return <span className="text-xs font-semibold text-leaf-700">Diterima {formatNumber(row.receipt.acceptedQuantity)} {row.unit}</span>;
                    return <span className="text-xs font-semibold text-amber-700">Belum diterima</span>;
                  },
                },
                {
                  key: 'action',
                  label: 'Aksi',
                  align: 'right',
                  render: (row) => (
                    <div className="flex flex-wrap justify-end gap-1">
                      {row.deliveryNoteFile?.id && <button type="button" onClick={() => openFileInNewTab(row.deliveryNoteFile.id).catch(showError)} className="btn btn-ghost px-2 py-1 text-[11px]">📎 Berkas</button>}
                      {!row.isCancelled && !row.receipt && canReceive && <a href={`${base}/delivery/${row.id}/receipt`} className="btn btn-secondary px-2 py-1 text-[11px]">Terima</a>}
                      {!row.isCancelled && !row.receipt && row.createdBy?.id === currentUserId() && (
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                          onClick={() => {
                            const reason = window.prompt(`Alasan membatalkan surat jalan ${row.deliveryNoteNumber}:`);
                            if (!reason?.trim()) return;
                            cancelDelivery(row.id, reason).then(() => { setNotice({ tone: 'success', text: `Surat jalan ${row.deliveryNoteNumber} dibatalkan.` }); reload(); }).catch(showError);
                          }}
                        >
                          Batalkan
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={deliveries}
              rowKey={(row) => row.id}
              empty={request.status === 'approved' ? 'Belum ada surat jalan.' : 'Surat jalan dicatat setelah request disetujui.'}
            />
          </section>
        </div>

        <aside>
          <DecisionTrail entries={[
            { title: request.status === 'rejected' && request.rejectedBy === 'admin' ? 'Ditolak Admin' : 'Diperiksa Admin', by: request.adminReviewedBy, at: request.adminReviewedAt, notes: request.adminNotes },
            { title: request.status === 'rejected' && request.rejectedBy === 'finance' ? 'Ditolak Finance' : 'Disetujui Finance', by: request.financeReviewedBy, at: request.financeReviewedAt, notes: request.financeNotes },
            { title: 'Dibatalkan', by: request.cancelledBy, at: request.cancelledAt },
          ]} />
        </aside>
      </div>
    </>
  );
}
