import { useState } from 'react';
import { Breadcrumb, MetricCard, Notice, ProgressBar, ProgressRing, StatusBadge } from '../components/ProjectUi.jsx';
import { changeProjectStatus, changeSubProjectStatus } from '../services/projectService.js';
import {
  PROJECT_STATUS, STATUS_TRANSITIONS, formatCurrency, formatDate, formatVolume,
  overallProgress, projectSchedule, subProjectTypeLabel,
} from '../utils/projectFormat.js';

const STAGE_ACTIONS = {
  active: { label: 'Aktifkan', confirm: 'Aktifkan tahapan ini? Lapangan bisa mulai mencatat progress harian.' },
  planned: { label: 'Tunda', confirm: 'Kembalikan tahapan ini ke status planned?' },
  completed: { label: 'Selesai', confirm: 'Tandai tahapan selesai? Kontrak dan targetnya tidak bisa diubah lagi.' },
  cancelled: { label: 'Batalkan', confirm: 'Batalkan tahapan ini? Status final dan tidak bisa dikembalikan.' },
};

function ScheduleCard({ project, progress }) {
  const schedule = projectSchedule(project);
  return (
    <section className="card-panel flex flex-col p-5 sm:p-6" aria-label="Jadwal dan progress keseluruhan">
      <div className="flex items-start justify-between gap-3">
        <div>
          {schedule ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-teal-700">
                {schedule.notStarted ? 'Belum mulai' : `Minggu ${schedule.currentWeek}`}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">dari {schedule.totalWeeks} minggu</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tracking-tight text-slate-900">Jadwal belum diisi</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Lengkapi tanggal mulai & selesai untuk menghitung minggu berjalan.</p>
            </>
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700" aria-hidden="true">↗</span>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <ProgressRing value={progress} sublabel="Tervalidasi" />
      </div>

      {schedule && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-[11px] font-medium text-slate-500">
            <span>Waktu berjalan</span>
            <span>{schedule.timeElapsedPct.toFixed(0)}%</span>
          </div>
          <ProgressBar value={schedule.timeElapsedPct} tone={schedule.timeElapsedPct > progress + 10 ? 'amber' : 'slate'} label="Waktu berjalan" />
        </div>
      )}

      <div className="border-t border-slate-200 pt-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{schedule?.overdue ? 'Status jadwal' : 'Hari tersisa'}</p>
        <p className={`mt-1 text-base font-bold ${schedule?.overdue ? 'text-red-600' : 'text-slate-900'}`}>
          {!schedule ? '-' : schedule.overdue ? 'Melewati target' : `${schedule.remainingDays} Hari`}
        </p>
        {schedule && <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(project.startDate)} – {formatDate(project.endDate)}</p>}
      </div>
    </section>
  );
}

function StageRow({ project, stage, canUpdate, busy, onChangeStatus, onEdit }) {
  const progress = stage.progress || {};
  const transitions = canUpdate && !['completed', 'cancelled'].includes(project.status) ? STATUS_TRANSITIONS[stage.status] || [] : [];
  const volumeHref = `#/admin/projects/${project.id}/sub/${stage.id}/volume`;

  return (
    <tr>
      <td>
        <a href={volumeHref} className="font-semibold text-slate-900 hover:text-teal-700">{subProjectTypeLabel(stage.subProjectType)}</a>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Target {formatVolume(stage.targetVolume, stage.volumeUnit)}{stage.contractNo ? ` · ${stage.contractNo}` : ''}
        </p>
      </td>
      <td><StatusBadge status={stage.status} map={PROJECT_STATUS} /></td>
      <td className="min-w-[11rem]">
        <div className="flex items-center gap-3">
          <ProgressBar value={progress.billableProgress || 0} secondary={progress.pendingProgress || 0} tone={stage.status === 'completed' ? 'emerald' : 'teal'} label={`Progress ${subProjectTypeLabel(stage.subProjectType)}`} />
          <span className="w-14 shrink-0 text-right text-sm font-bold text-slate-900">{(progress.billableProgress || 0).toFixed(1)}%</span>
        </div>
        {progress.pendingVolume > 0 && (
          <p className="mt-1 text-[11px] text-amber-700">+{formatVolume(progress.pendingVolume, stage.volumeUnit)} menunggu validasi</p>
        )}
      </td>
      <td className="whitespace-nowrap text-right text-xs">
        <p className="font-semibold text-slate-900">{formatCurrency(progress.billableAmount)}</p>
        <p className="text-[11px] text-slate-400">dari {formatCurrency(stage.contractValue)}</p>
      </td>
      <td>
        <div className="flex flex-wrap justify-end gap-1">
          {transitions.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy}
              onClick={() => onChangeStatus(stage, status)}
              className={`btn btn-ghost px-2 py-1 text-[11px] ${status === 'cancelled' ? 'text-red-600 hover:bg-red-50' : 'text-teal-700 hover:bg-teal-50'}`}
            >
              {STAGE_ACTIONS[status].label}
            </button>
          ))}
          {canUpdate && !['completed', 'cancelled'].includes(stage.status) && (
            <button type="button" disabled={busy} onClick={() => onEdit(stage)} className="btn btn-ghost px-2 py-1 text-[11px]" title="Ubah kontrak & target">✎ Ubah</button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function ProjectOverview({ project, stagesEntry, permissions, onProjectChanged, onReloadStages, onEditProject, onCreateSubProject, onEditSubProject }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ tone: 'success', text: '' });

  const stages = stagesEntry?.data || [];
  const summary = stagesEntry?.summary;
  const progress = overallProgress(stages, summary);
  const isFinal = ['completed', 'cancelled'].includes(project.status);
  const projectTransitions = permissions.updateProject ? STATUS_TRANSITIONS[project.status] || [] : [];
  const usedTypes = stages.map((stage) => stage.subProjectType);

  const runProjectStatus = async (status, message) => {
    if (!window.confirm(message)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      const updated = await changeProjectStatus(project.id, status);
      onProjectChanged(updated);
      setNotice({ tone: 'success', text: `Status project diubah menjadi "${PROJECT_STATUS[status]?.label || status}".` });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const runStageStatus = async (stage, status) => {
    if (!window.confirm(STAGE_ACTIONS[status].confirm)) return;
    setBusy(true);
    setNotice({ tone: 'success', text: '' });
    try {
      const updated = await changeSubProjectStatus(project.id, stage.id, status);
      await onReloadStages();
      // Backend mengizinkan tahapan aktif di luar urutan, tapi memperingatkan.
      setNotice(updated.sequenceWarning
        ? { tone: 'warning', text: updated.sequenceWarning.message }
        : { tone: 'success', text: `${subProjectTypeLabel(stage.subProjectType)} kini berstatus "${PROJECT_STATUS[status]?.label || status}".` });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Project', href: '#/admin/projects' }, { label: project.projectName }]} />

      <div className="mb-6 mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{project.projectName}</h1>
            <StatusBadge status={project.status} map={PROJECT_STATUS} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{project.projectCode}</span>
            <span>📍 {project.location || 'Lokasi belum diisi'}</span>
            {project.clientName && <span>🏢 {project.clientName}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {permissions.updateProject && !isFinal && (
            <button type="button" onClick={onEditProject} disabled={busy} className="btn btn-secondary text-xs">✎ Ubah</button>
          )}
          {projectTransitions.includes('planned') && (
            <button type="button" disabled={busy} onClick={() => runProjectStatus('planned', 'Tunda project ini kembali ke status planned?')} className="btn btn-secondary text-xs">⏸ Tunda</button>
          )}
          {projectTransitions.includes('cancelled') && (
            <button type="button" disabled={busy} onClick={() => runProjectStatus('cancelled', 'Batalkan project ini? Status final dan tidak bisa dikembalikan.')} className="btn btn-ghost text-xs text-red-600 hover:bg-red-50">Batalkan</button>
          )}
          {projectTransitions.includes('active') && (
            <button type="button" disabled={busy} onClick={() => runProjectStatus('active', 'Mulai project ini? Status berubah menjadi active.')} className="btn btn-primary text-xs">▶ Mulai Project</button>
          )}
          {projectTransitions.includes('completed') && (
            <button type="button" disabled={busy} onClick={() => runProjectStatus('completed', 'Tandai project selesai? Semua tahapan harus sudah selesai atau dibatalkan, dan project tidak bisa diubah lagi.')} className="btn btn-danger text-xs shadow-sm">✓ Selesai</button>
          )}
        </div>
      </div>

      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <ScheduleCard project={project} progress={progress} />

        <section className="card-panel flex min-w-0 flex-col overflow-hidden" aria-label="Sub-project">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Sub-Project Tasks</h2>
              <p className="text-xs text-slate-500">Progress tervalidasi per tahapan pekerjaan</p>
            </div>
            {permissions.createSubProject && !isFinal && usedTypes.length < 4 && stagesEntry && !stagesEntry.loading && (
              <button type="button" onClick={onCreateSubProject} className="btn btn-secondary text-xs">+ Sub-Project</button>
            )}
          </div>

          {stagesEntry?.loading || !stagesEntry ? (
            <p className="p-10 text-center text-sm text-slate-500">Memuat tahapan...</p>
          ) : stagesEntry.error ? (
            <p className="m-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{stagesEntry.error}</p>
          ) : stages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">Belum ada sub-project</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">Tambahkan tahapan (Galian, Timbunan, Line Clearing, Aspal) beserta target volume & nilai kontraknya.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Work Item</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="text-right">Siap Ditagih</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      project={project}
                      stage={stage}
                      busy={busy}
                      canUpdate={permissions.updateSubProject}
                      onChangeStatus={runStageStatus}
                      onEdit={onEditSubProject}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-teal-600" /> Tervalidasi (dasar tagihan)</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-amber-300" /> Menunggu validasi</span>
          </div>
        </section>
      </div>

      {summary && (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Nilai Kontrak" value={formatCurrency(summary.totalContractValue)} hint={`${summary.activeStageCount} tahapan berjalan`} accent />
          <MetricCard label="Siap Ditagih" value={formatCurrency(summary.totalBillableAmount)} tone="teal" hint="Dari progress tervalidasi" />
          <MetricCard label="Sisa Nilai" value={formatCurrency(Math.max(0, summary.totalContractValue - summary.totalBillableAmount))} hint="Belum terealisasi" />
          <MetricCard label="Kontrak Dibatalkan" value={formatCurrency(summary.cancelledContractValue)} tone={summary.cancelledContractValue > 0 ? 'red' : 'slate'} hint="Tidak dihitung ke nilai project" />
        </div>
      )}
    </>
  );
}

