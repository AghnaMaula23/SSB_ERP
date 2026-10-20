import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { actorName, formatDate, formatDateTime, formatNumber, subProjectTypeLabel } from '../../project/utils/projectFormat.js';
import { RejectReasonForm } from '../components/ApprovalUi.jsx';
import { getEquipmentRequest, reviewEquipmentRequest } from '../services/approvalService.js';
import { EQUIPMENT_REQUEST_STATUS, currentUserId } from '../utils/approvalFormat.js';
import { hasPermission } from '../../../../services/permissions.js';

/**
 * Review Admin atas Request Alat internal_project: teruskan ke Divisi Alat
 * atau tolak (alasan wajib). Jumlah unit & unit fisiknya diputuskan Divisi Alat.
 */
export default function EquipmentRequestReview({ recordId, onDone }) {
  const [request, setRequest] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const canReview = hasPermission('equipment-request:review');

  useEffect(() => {
    let cancelled = false;
    getEquipmentRequest(recordId)
      .then((row) => { if (!cancelled) setRequest(row); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [recordId, reloadKey]);

  if (loadError) return <EmptyPanel icon="🔎" title="Request alat tidak ditemukan" action={<a href="#/admin/approvals/antrean" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!request) return <LoadingPanel>Memuat request alat...</LoadingPanel>;

  const own = request.requestedBy?.id === currentUserId();
  const pending = request.status === 'submitted' && request.requestType === 'internal_project';
  // 409 = sudah diproses user lain: tampilkan pesannya dan muat ulang statusnya.
  const showError = (error) => {
    setNotice(error.message);
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const forward = async () => {
    if (!window.confirm(`Teruskan ${request.requestCode} ke Divisi Alat?`)) return;
    setBusy(true);
    try {
      await reviewEquipmentRequest(request.id, 'forward', notes);
      onDone(`${request.requestCode} diteruskan ke Divisi Alat.`);
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  };

  const reject = async (reason) => {
    try {
      await reviewEquipmentRequest(request.id, 'reject', reason);
    } catch (error) {
      if (error.status !== 409) throw error;
      setRejecting(false);
      showError(error);
      return;
    }
    onDone(`${request.requestCode} ditolak. Alasannya terlihat oleh Lapangan.`);
  };

  const stage = request.subProject;

  return (
    <>
      <Breadcrumb items={[{ label: 'Approval Center', href: '#/admin/approvals/antrean' }, { label: 'Request Alat' }, { label: request.requestCode }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold text-emerald-800">{request.requestCode}</h1>
            <StatusBadge status={request.status} map={EQUIPMENT_REQUEST_STATUS} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Diajukan {formatDate(request.requestDate)} oleh {actorName(request.requestedBy)}
            {stage && <> · <a href={`#/admin/projects/${stage.constructionProjectId}/sub/${stage.id}/alat`} className="font-semibold text-teal-700 hover:underline">{subProjectTypeLabel(stage.subProjectType)}</a></>}
          </p>
        </div>
      </div>

      {notice && <Notice tone="error" onDismiss={() => setNotice('')}>{notice}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card-panel self-start overflow-hidden" aria-label="Item request">
          <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Alat yang Diminta</p>
          <div className="table-scroll-mobile overflow-x-auto">
            <table className="table-modern">
              <thead><tr><th>Jenis Alat</th><th className="text-right">Jumlah</th><th className="text-right">Estimasi Jam</th><th>Catatan</th></tr></thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold text-slate-900">{item.equipmentType?.typeName || '-'}</td>
                    <td className="text-right font-mono font-bold">{formatNumber(item.requestedQuantity)} unit</td>
                    <td className="text-right font-mono text-xs">{item.estimatedWorkhours ? `${formatNumber(item.estimatedWorkhours)} jam` : '-'}</td>
                    <td className="text-xs text-slate-600">{item.itemNotes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid gap-4 border-t border-slate-200 p-5 text-xs sm:grid-cols-3">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dibutuhkan</dt><dd className="mt-0.5 text-slate-800">{request.neededDate ? formatDate(request.neededDate) : '-'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lokasi</dt><dd className="mt-0.5 text-slate-800">{request.locationDetail || '-'}</dd></div>
            {request.requestNotes && <div className="sm:col-span-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catatan Pengaju</dt><dd className="mt-0.5 whitespace-pre-line text-slate-800">{request.requestNotes}</dd></div>}
          </dl>
        </section>

        <aside className="space-y-4">
          {pending && canReview && !own ? (
            <div className="card-panel space-y-3 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Keputusan Admin</p>
              {rejecting ? (
                <RejectReasonForm
                  label="Alasan penolakan"
                  submitLabel="Tolak Request"
                  placeholder="Contoh: Alat sejenis masih menganggur di tahapan ini"
                  onSubmit={reject}
                  onCancel={() => setRejecting(false)}
                />
              ) : (
                <>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-600">Catatan untuk Divisi Alat (opsional)</span>
                    <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control mt-1 h-auto resize-y text-sm" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={forward} className="btn btn-primary flex-1 text-xs">{busy ? 'Menyimpan...' : 'Teruskan ke Divisi Alat'}</button>
                    <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="btn btn-secondary text-xs text-red-600">Tolak</button>
                  </div>
                </>
              )}
            </div>
          ) : pending && (
            <Notice tone="warning">{own ? 'Request ini Anda ajukan sendiri — harus direview orang lain.' : 'Akun ini tidak memegang equipment-request:review.'}</Notice>
          )}
          {request.adminReviewedAt && (
            <div className="card-panel p-4 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Review Admin</p>
              <p className="mt-1 text-slate-700">{formatDateTime(request.adminReviewedAt)} · {actorName(request.adminReviewedBy)}</p>
              {request.adminNotes && <p className="mt-2 rounded-md bg-slate-100 px-2 py-1 text-slate-700">“{request.adminNotes}”</p>}
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            Diteruskan = masuk antrean Divisi Alat, yang memutuskan jumlah unit disetujui dan unit fisiknya.
          </div>
        </aside>
      </div>
    </>
  );
}
