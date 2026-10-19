import { Fragment, useEffect, useState } from 'react';
import { Breadcrumb, GuardedLink, Notice, ProgressBar, ProgressRing, StatusBadge } from '../components/ProjectUi.jsx';
import FieldConditionModal from '../components/FieldConditionModal.jsx';
import { RejectReasonForm } from '../../approvals/components/ApprovalUi.jsx';
import { listProgressLogs, setProgressValidation } from '../services/projectService.js';
import {
  PROGRESS_STATUS, PROJECT_STATUS, formatCurrency, formatDate, formatNumber, formatVolume,
  stageCrumbs, subProjectTypeLabel, unitLabel,
} from '../utils/projectFormat.js';

const PAGE_SIZE = 10;
const STATUS_TABS = [
  { value: '', label: 'Semua' },
  { value: 'submitted', label: 'Menunggu Validasi' },
  { value: 'validated', label: 'Tervalidasi' },
  { value: 'rejected', label: 'Ditolak' },
];

const VALIDATION_ACTIONS = {
  validated: { label: 'Validasi', tone: 'text-emerald-700 hover:bg-emerald-50', confirm: 'Validasi progress ini? Volumenya akan menjadi dasar tagihan klien.' },
  // Tolak tidak memakai confirm: isian alasan (wajib) sudah menjadi konfirmasinya.
  rejected: { label: 'Tolak', tone: 'text-red-600 hover:bg-red-50' },
  submitted: { label: 'Buka Kembali', tone: 'text-slate-600 hover:bg-slate-100', confirm: 'Kembalikan catatan ini ke "menunggu validasi"? Untuk baris tervalidasi, nilai tagihannya akan berkurang sampai divalidasi ulang.' },
};

const NEXT_VALIDATION = { submitted: ['validated', 'rejected'], validated: ['submitted'], rejected: ['submitted'] };

function SummaryCard({ stage }) {
  const progress = stage.progress || {};
  const unit = stage.volumeUnit;
  const pct = progress.billableProgress || 0;

  return (
    <section className="card-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_16rem] lg:items-center" aria-label="Ringkasan kontrak volume">
      <div className="flex flex-col items-center gap-3">
        <StatusBadge status={stage.status} map={PROJECT_STATUS} />
        <ProgressRing value={pct} size={128} stroke={12} tone={stage.status === 'completed' ? 'emerald' : 'teal'} label={`${pct.toFixed(0)}%`} sublabel="Done" />
      </div>

      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Penyelesaian Tahapan</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {formatVolume(progress.validatedVolume, unit)} dari {formatVolume(stage.targetVolume, unit)} sudah divalidasi Admin
          {progress.pendingVolume > 0 && <>, dan <span className="font-semibold text-amber-700">{formatVolume(progress.pendingVolume, unit)}</span> masih menunggu validasi</>}.
        </p>
        <div className="mt-3">
          <ProgressBar value={pct} secondary={progress.pendingProgress || 0} label="Progress tervalidasi" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Target</dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900">{formatVolume(stage.targetVolume, unit)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Harian</dt>
            <dd className="mt-0.5 text-base font-bold text-teal-700">{stage.dailyTargetVolume ? formatVolume(stage.dailyTargetVolume, unit) : '-'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nilai Kontrak</dt>
            <dd className="mt-0.5 text-base font-bold text-slate-900">{formatCurrency(stage.contractValue)}</dd>
          </div>
        </dl>
      </div>

      <ul className="space-y-3 border-t border-slate-200 pt-4 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <div><p className="font-bold text-emerald-700">{formatVolume(progress.validatedVolume, unit)}</p><p className="text-xs text-slate-500">Realized</p></div>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          <div><p className="font-bold text-slate-900">{formatVolume(progress.remainingVolume, unit)}</p><p className="text-xs text-slate-500">Remaining</p></div>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600" />
          <div><p className="font-bold text-teal-700">{formatCurrency(progress.billableAmount)}</p><p className="text-xs text-slate-500">Siap ditagih</p></div>
        </li>
      </ul>
    </section>
  );
}

export default function SubProjectVolumePage({ project, stage, canValidate, canRecord, initialNotice, onStageChanged }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  // Hasil terakhir diberi kunci permintaan; "loading" = kunci belum cocok.
  // Dengan begitu effect tidak perlu menyetel state secara sinkron.
  const [result, setResult] = useState({ key: null, data: [], total: 0, totalPages: 1, error: '' });
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });
  const [busyId, setBusyId] = useState(null);
  const [conditionLog, setConditionLog] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const unit = stage.volumeUnit;
  const requestKey = `${stage.id}|${page}|${statusFilter}|${reloadKey}`;
  const loading = result.key !== requestKey;
  const loadError = loading ? '' : result.error;

  useEffect(() => {
    let cancelled = false;
    listProgressLogs(stage.id, { page, limit: PAGE_SIZE, status: statusFilter })
      .then((response) => {
        if (!cancelled) setResult({ key: requestKey, data: response.data || [], total: response.total || 0, totalPages: Math.max(1, response.totalPages || 1), error: '' });
      })
      .catch((error) => {
        if (!cancelled) setResult((current) => ({ ...current, key: requestKey, error: error.message }));
      });
    return () => { cancelled = true; };
  }, [page, requestKey, stage.id, statusFilter]);

  const applyValidation = async (log, status, notes) => {
    const updated = await setProgressValidation(stage.id, log.id, status, notes);
    // Backend mengirim progress tahapan terbaru — pakai langsung tanpa memuat ulang.
    if (updated.subProjectProgress) onStageChanged({ ...stage, progress: updated.subProjectProgress });
    setNotice({ tone: 'success', text: `Progress ${formatDate(log.progressDate)} kini "${PROGRESS_STATUS[status].label}".` });
    setReloadKey((key) => key + 1);
  };

  // 409 = catatan sudah diputuskan user lain: tampilkan pesannya lalu muat ulang.
  const showError = (error) => {
    setNotice({ tone: 'error', text: error.message });
    if (error.status === 409) setReloadKey((key) => key + 1);
  };

  const handleValidation = async (log, status) => {
    if (status === 'rejected') { setRejectingId(log.id); return; }
    if (!window.confirm(VALIDATION_ACTIONS[status].confirm)) return;
    setBusyId(log.id);
    setNotice({ tone: 'success', text: '' });
    try {
      await applyValidation(log, status);
    } catch (error) {
      showError(error);
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async (log, notes) => {
    try {
      await applyValidation(log, 'rejected', notes);
    } catch (error) {
      if (error.status !== 409) throw error;
      showError(error);
    }
    setRejectingId(null);
  };

  const changeFilter = (value) => { setStatusFilter(value); setPage(1); };
  const firstRow = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, result.total);
  const pendingCount = stage.progress?.logCount?.submitted || 0;
  const showActions = canValidate || canRecord;

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Kontrak Volume' })} />
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contract Volume Tracking</h1>
          <p className="mt-1 text-xs text-slate-500">
            {subProjectTypeLabel(stage.subProjectType)}{stage.contractNo ? ` · Kontrak ${stage.contractNo}` : ''}
            {stage.contractStartDate && ` · ${formatDate(stage.contractStartDate)} – ${formatDate(stage.contractEndDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canValidate && pendingCount > 0 && (
            <button type="button" onClick={() => changeFilter('submitted')} className="btn btn-secondary text-xs">
              <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">{pendingCount}</span> menunggu validasi
            </button>
          )}
          <GuardedLink
            href={`#/admin/projects/${project.id}/sub/${stage.id}/volume/new`}
            allowed={canRecord && stage.status === 'active'}
            reason={!canRecord ? 'Pencatatan progress milik role Lapangan (progress:create).' : 'Progress hanya bisa dicatat pada tahapan berstatus Active.'}
          >
            + Input Progress
          </GuardedLink>
        </div>
      </div>

      <SummaryCard stage={stage} />

      <section className="card-panel mt-6 overflow-hidden" aria-label="Rincian progress harian">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Task Breakdown &amp; Progress</h2>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-200/60 p-1" role="tablist" aria-label="Filter status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.value}
                onClick={() => changeFilter(tab.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${statusFilter === tab.value ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pt-4">
          <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>
          {loadError && <Notice tone="error">{loadError}</Notice>}
        </div>

        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Capaian Harian</th>
                <th>Today's Input</th>
                <th>Kondisi Lapangan</th>
                <th>Dicatat</th>
                <th className="text-center">Status</th>
                {showActions && <th className="text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={showActions ? 7 : 6} className="py-12 text-center text-sm text-slate-500">Memuat progress harian...</td></tr>
              ) : result.data.length === 0 ? (
                <tr><td colSpan={showActions ? 7 : 6} className="py-12 text-center text-sm text-slate-500">
                  {statusFilter ? 'Tidak ada progress dengan status ini.' : 'Belum ada progress harian yang dicatat Lapangan.'}
                </td></tr>
              ) : result.data.map((log) => {
                const dailyPct = stage.dailyTargetVolume ? (log.realizedVolume / stage.dailyTargetVolume) * 100 : null;
                const isZero = !log.realizedVolume;
                return (
                  <Fragment key={log.id}>
                  <tr>
                    <td className="whitespace-nowrap font-medium text-slate-900">{formatDate(log.progressDate)}</td>
                    <td className="min-w-[10rem]">
                      {dailyPct === null ? (
                        <span className="text-[11px] text-slate-400">Target harian belum diisi</span>
                      ) : (
                        <>
                          <div className="mb-1 flex justify-between text-[11px]">
                            <span className={`font-bold ${dailyPct >= 100 ? 'text-emerald-700' : 'text-teal-700'}`}>{dailyPct.toFixed(0)}%</span>
                            <span className="text-slate-500">{formatNumber(log.realizedVolume)} / {formatNumber(stage.dailyTargetVolume)}</span>
                          </div>
                          <ProgressBar value={dailyPct} tone={dailyPct >= 100 ? 'emerald' : 'teal'} label="Capaian terhadap target harian" />
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={`text-sm font-bold ${isZero ? 'text-amber-700' : 'text-teal-700'}`}>
                        {isZero ? '⚠ 0' : `+${formatNumber(log.realizedVolume)}`} {unitLabel(unit)}
                      </span>
                    </td>
                    <td>
                      {log.fieldCondition || log.notes ? (
                        <button type="button" onClick={() => setConditionLog(log)} className="text-xs font-semibold text-teal-700 hover:underline">Lihat Catatan</button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Tidak ada catatan</span>
                      )}
                    </td>
                    <td className="text-xs">
                      <p className="font-medium text-slate-700">{log.createdBy?.fullName || log.createdBy?.username || '-'}</p>
                      {log.validatedBy && log.status !== 'submitted' && (
                        <p className="text-[11px] text-slate-400">oleh {log.validatedBy.fullName || log.validatedBy.username}</p>
                      )}
                    </td>
                    <td className="text-center">
                      <StatusBadge status={log.status} map={PROGRESS_STATUS} />
                      {log.validationNotes && log.status !== 'submitted' && (
                        <p className={`mx-auto mt-1 max-w-40 truncate text-[11px] ${log.status === 'rejected' ? 'text-red-600' : 'text-slate-500'}`} title={log.validationNotes}>“{log.validationNotes}”</p>
                      )}
                    </td>
                    {showActions && (
                      <td>
                        <div className="flex justify-end gap-1">
                          {canRecord && log.status !== 'validated' && (
                            <a href={`#/admin/projects/${project.id}/sub/${stage.id}/volume/${log.id}/edit`} className="btn btn-ghost px-2 py-1 text-[11px]" title="Perbaiki catatan">✎ Ubah</a>
                          )}
                          {canValidate && (NEXT_VALIDATION[log.status] || []).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={busyId !== null || rejectingId !== null}
                              onClick={() => handleValidation(log, status)}
                              className={`btn btn-ghost px-2 py-1 text-[11px] ${VALIDATION_ACTIONS[status].tone}`}
                            >
                              {busyId === log.id ? '...' : VALIDATION_ACTIONS[status].label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                  {rejectingId === log.id && (
                    <tr className="bg-red-50/60">
                      <td colSpan={showActions ? 7 : 6}>
                        <RejectReasonForm
                          label={`Alasan menolak progress ${formatDate(log.progressDate)}`}
                          submitLabel="Tolak Progress"
                          placeholder="Contoh: Volume tidak sesuai foto lapangan"
                          onSubmit={(notes) => submitReject(log, notes)}
                          onCancel={() => setRejectingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span>{loading ? 'Memuat catatan...' : `Menampilkan ${firstRow}–${lastRow} dari ${result.total} catatan`}</span>
          <div className="flex items-center gap-1" aria-label="Pagination">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="btn btn-secondary px-2.5 py-1 text-xs" aria-label="Halaman sebelumnya">‹</button>
            <span className="px-2 font-medium">Hal {page} / {result.totalPages}</span>
            <button type="button" disabled={page >= result.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="btn btn-secondary px-2.5 py-1 text-xs" aria-label="Halaman berikutnya">›</button>
          </div>
        </footer>
      </section>

      {conditionLog && <FieldConditionModal log={conditionLog} unit={unit} onClose={() => setConditionLog(null)} />}
    </>
  );
}
