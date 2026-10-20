import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice, ProgressBar, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { getProgressLog, getSubProject, setProgressValidation } from '../../project/services/projectService.js';
import {
  PROGRESS_STATUS, actorName, formatCurrency, formatDate, formatDateTime, formatNumber, formatVolume, subProjectTypeLabel,
} from '../../project/utils/projectFormat.js';
import { RejectReasonForm } from '../components/ApprovalUi.jsx';
import { hasPermission } from '../../../../services/permissions.js';

const CLOSED = ['completed', 'cancelled'];

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-800">{children || <span className="text-slate-400">-</span>}</dd>
    </div>
  );
}

/**
 * Review satu progress harian dari Approval Center: volume terhadap target,
 * kondisi lapangan, dan dampaknya ke progress tahapan — lalu validasi atau
 * tolak (alasan wajib). Progress tervalidasi menjadi dasar tagihan klien.
 */
export default function ProgressLogReview({ subProjectId, recordId, onDone }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const canValidate = hasPermission('progress:validate');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSubProject(subProjectId), getProgressLog(subProjectId, recordId)])
      .then(([stage, log]) => { if (!cancelled) setData({ stage, log }); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [recordId, reloadKey, subProjectId]);

  if (loadError) return <EmptyPanel icon="🔎" title="Progress harian tidak ditemukan" action={<a href="#/admin/approvals/antrean" className="btn btn-secondary text-xs">← Kembali</a>}>{loadError}</EmptyPanel>;
  if (!data) return <LoadingPanel>Memuat progress harian...</LoadingPanel>;

  const { stage, log } = data;
  const project = stage.constructionProject || {};
  const progress = stage.progress || {};
  const unit = stage.volumeUnit;
  const condition = log.fieldCondition || {};
  // Tahapan/project yang ditutup terkunci (E25) — keputusan akan dibalas 409.
  const locked = CLOSED.includes(stage.status) || CLOSED.includes(project.status);
  const pending = log.status === 'submitted';
  const dailyPct = stage.dailyTargetVolume ? (log.realizedVolume / stage.dailyTargetVolume) * 100 : null;
  // Perkiraan progress tahapan kalau log ini divalidasi.
  const afterPct = stage.targetVolume ? Math.min(100, ((progress.validatedVolume || 0) + (pending ? log.realizedVolume : 0)) / stage.targetVolume * 100) : null;
  const stageHref = `#/admin/projects/${stage.constructionProjectId}/sub/${stage.id}/volume`;

  const showError = (error) => {
    setNotice(error.message);
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const validate = async () => {
    if (!window.confirm(`Validasi progress ${formatDate(log.progressDate)} sebesar ${formatVolume(log.realizedVolume, unit)}? Volumenya menjadi dasar tagihan klien.`)) return;
    setBusy(true);
    setNotice('');
    try {
      await setProgressValidation(stage.id, log.id, 'validated', notes);
      onDone(`Progress ${subProjectTypeLabel(stage.subProjectType)} ${formatDate(log.progressDate)} divalidasi.`);
    } catch (error) {
      showError(error);
      setBusy(false);
    }
  };

  const reject = async (reason) => {
    try {
      await setProgressValidation(stage.id, log.id, 'rejected', reason);
    } catch (error) {
      if (error.status !== 409) throw error;
      setRejecting(false);
      showError(error);
      return;
    }
    onDone(`Progress ${formatDate(log.progressDate)} ditolak. Alasannya terlihat oleh Lapangan.`);
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Approval Center', href: '#/admin/approvals/antrean' }, { label: 'Progress Harian' }, { label: formatDate(log.progressDate) }]} />
      <div className="mb-5 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Progress {subProjectTypeLabel(stage.subProjectType)} · {formatDate(log.progressDate)}</h1>
          <StatusBadge status={log.status} map={PROGRESS_STATUS} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{project.projectCode}</span> {project.projectName} ·{' '}
          <a href={stageHref} className="font-semibold text-teal-700 hover:underline">buka Kontrak Volume tahapan</a>
        </p>
      </div>

      {notice && <Notice tone="error" onDismiss={() => setNotice('')}>{notice}</Notice>}
      {locked && <Notice tone="warning">Tahapan atau project ini sudah ditutup, jadi datanya terkunci — progress tidak bisa divalidasi atau ditolak lagi.</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <section className="card-panel p-5" aria-label="Realisasi">
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Realisasi Hari Ini</p>
                <p className={`mt-1 text-3xl font-bold ${log.realizedVolume ? 'text-teal-700' : 'text-amber-700'}`}>{formatVolume(log.realizedVolume, unit)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Target Harian</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{stage.dailyTargetVolume ? formatVolume(stage.dailyTargetVolume, unit) : '-'}</p>
                {dailyPct !== null && <p className={`text-xs font-semibold ${dailyPct >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatNumber(dailyPct)}% dari target</p>}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Nilai per {unit}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{stage.targetVolume ? formatCurrency(stage.contractValue / stage.targetVolume) : '-'}</p>
                {stage.targetVolume > 0 && <p className="text-xs text-slate-500">≈ {formatCurrency((stage.contractValue / stage.targetVolume) * log.realizedVolume)} hari ini</p>}
              </div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Progress tahapan tervalidasi</span>
                <span className="text-slate-500">
                  {formatNumber(progress.billableProgress || 0)}%
                  {pending && afterPct !== null && <> → <b className="text-teal-700">{formatNumber(afterPct)}%</b> bila divalidasi</>}
                </span>
              </div>
              <ProgressBar value={progress.billableProgress || 0} secondary={progress.pendingProgress || 0} label="Progress tahapan" />
              <p className="mt-1.5 text-[11px] text-slate-500">
                {formatVolume(progress.validatedVolume, unit)} tervalidasi dari {formatVolume(stage.targetVolume, unit)} · {formatVolume(progress.pendingVolume, unit)} masih menunggu validasi
              </p>
            </div>
          </section>

          <section className="card-panel p-5" aria-label="Kondisi lapangan">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-teal-700">Kondisi Lapangan</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Cuaca Pagi">{condition.weatherMorning}</Fact>
              <Fact label="Cuaca Siang">{condition.weatherAfternoon}</Fact>
              <Fact label="Catatan Kondisi Lapangan">{condition.fieldConditionNotes}</Fact>
              <Fact label="Insiden">{condition.incidentNotes}</Fact>
              <div className="sm:col-span-2"><Fact label="Catatan Progress">{log.notes}</Fact></div>
            </dl>
          </section>
        </div>

        <aside className="space-y-4">
          {pending && canValidate && !locked && (
            <div className="card-panel space-y-3 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Keputusan Admin</p>
              {rejecting ? (
                <RejectReasonForm label="Alasan penolakan" submitLabel="Tolak Progress" placeholder="Contoh: Volume tidak sesuai foto lapangan" onSubmit={reject} onCancel={() => setRejecting(false)} />
              ) : (
                <>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-600">Catatan validasi (opsional)</span>
                    <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="input-control mt-1 h-auto resize-y text-sm" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={validate} className="btn btn-primary flex-1 text-xs">{busy ? 'Menyimpan...' : '✓ Validasi'}</button>
                    <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="btn btn-secondary text-xs text-red-600">Tolak</button>
                  </div>
                </>
              )}
            </div>
          )}
          {pending && !canValidate && <Notice tone="warning">Akun ini tidak memegang progress:validate.</Notice>}
          <div className="card-panel p-4 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Riwayat</p>
            <ul className="mt-2 space-y-2 text-slate-700">
              <li>Dicatat {actorName(log.createdBy)} · {formatDateTime(log.createdAt)}</li>
              {log.updatedAt && log.updatedAt !== log.createdAt && <li>Diperbarui {formatDateTime(log.updatedAt)}</li>}
              {log.validatedAt && log.status !== 'submitted' && (
                <li>
                  {PROGRESS_STATUS[log.status]?.label} oleh {actorName(log.validatedBy)} · {formatDateTime(log.validatedAt)}
                  {log.validationNotes && <p className={`mt-1 rounded-md px-2 py-1 ${log.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-slate-100'}`}>“{log.validationNotes}”</p>}
                </li>
              )}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            Progress tervalidasi menjadi dasar tagihan klien. Menolak wajib disertai alasan; Lapangan memperbaiki lalu mengajukan ulang.
          </div>
        </aside>
      </div>
    </>
  );
}
