import { useMemo, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, MetricCard, StatusBadge } from '../components/ProjectUi.jsx';
import { PROJECT_STATUS, formatDate, projectSchedule } from '../utils/projectFormat.js';

const STATUS_FILTERS = ['', 'planned', 'active', 'completed', 'cancelled'];

/** Halaman awal menu Project: ringkasan portofolio + kartu tiap project. */
export default function ProjectListView({ projects, loading, error, canCreate, onCreate }) {
  const [statusFilter, setStatusFilter] = useState('');
  const counts = useMemo(() => projects.reduce((result, project) => {
    result[project.status] = (result[project.status] || 0) + 1;
    return result;
  }, {}), [projects]);
  const visible = statusFilter ? projects.filter((project) => project.status === statusFilter) : projects;

  return (
    <>
      <Breadcrumb items={[{ label: 'Divisi Admin' }, { label: 'Project' }]} />
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project Konstruksi</h1>
          <p className="mt-1 text-xs text-slate-500">Kelola project, tahapan pekerjaan, dan validasi progress lapangan.</p>
        </div>
        {canCreate && <button type="button" onClick={onCreate} className="btn btn-primary text-xs">+ Tambah Proyek</button>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Project" value={projects.length} accent loading={loading} />
        <MetricCard label="Active" value={counts.active || 0} tone="teal" loading={loading} />
        <MetricCard label="Planned" value={counts.planned || 0} loading={loading} />
        <MetricCard label="Completed" value={counts.completed || 0} tone="emerald" loading={loading} />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter status project">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status || 'all'}
            type="button"
            role="tab"
            aria-selected={statusFilter === status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              statusFilter === status ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {status ? PROJECT_STATUS[status].label : 'Semua'} <span className="ml-0.5 text-slate-400">{status ? counts[status] || 0 : projects.length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingPanel>Memuat daftar project...</LoadingPanel>
      ) : projects.length === 0 ? (
        <EmptyPanel
          icon="🏗️"
          title="Belum ada project"
          action={canCreate && <button type="button" onClick={onCreate} className="btn btn-primary text-xs">+ Tambah Proyek Pertama</button>}
        >
          Buat project konstruksi, lalu tambahkan tahapan pekerjaannya (Galian, Timbunan, Line Clearing, Aspal).
        </EmptyPanel>
      ) : visible.length === 0 ? (
        <EmptyPanel icon="🔎" title="Tidak ada project dengan status ini" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((project) => {
            const schedule = projectSchedule(project);
            return (
              <a
                key={project.id}
                href={`#/admin/projects/${project.id}`}
                className="card-panel group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[11px] font-semibold text-slate-400">{project.projectCode}</span>
                  <StatusBadge status={project.status} map={PROJECT_STATUS} />
                </div>
                <h2 className="mt-2 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-teal-800">{project.projectName}</h2>
                <p className="mt-1 truncate text-xs text-slate-500">📍 {project.location || 'Lokasi belum diisi'}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Klien</p>
                    <p className="mt-0.5 truncate font-medium text-slate-700">{project.clientName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sub-Project</p>
                    <p className="mt-0.5 font-medium text-slate-700">{project.subProjectCount ?? 0} tahapan</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jadwal</p>
                    <p className="mt-0.5 font-medium text-slate-700">
                      {schedule ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}` : 'Belum dijadwalkan'}
                      {schedule && project.status === 'active' && (
                        <span className={`ml-1.5 ${schedule.overdue ? 'text-red-600' : 'text-teal-700'}`}>
                          · {schedule.overdue ? 'lewat target' : `${schedule.remainingDays} hari lagi`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
