import { useState } from 'react';
import { StatusBadge } from './ProjectUi.jsx';
import { PROJECT_STATUS, subProjectTypeLabel } from '../utils/projectFormat.js';
import { SUB_PAGES } from '../utils/projectRoute.js';

const STATUS_DOT = {
  planned: 'bg-slate-300',
  active: 'bg-teal-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
};

function Toggle({ open, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      aria-expanded={open}
      aria-label={`${open ? 'Ciutkan' : 'Bentangkan'} ${label}`}
    >
      {open ? '−' : '+'}
    </button>
  );
}

/**
 * Navigasi di dalam SATU project yang sedang dibuka: ringkasan project lalu
 * tahapan beserta halamannya. Project lain dipilih dari dashboard Project.
 */
export default function ProjectTree({ project, stagesEntry, selection, canCreateSubProject }) {
  // Tahapan yang dibuka manual; tahapan yang sedang aktif selalu terbuka
  // kecuali sengaja diciutkan.
  const [openSubs, setOpenSubs] = useState(() => new Set());
  const [collapsedActive, setCollapsedActive] = useState(null);

  const stages = stagesEntry?.data || [];
  const isFinal = ['completed', 'cancelled'].includes(project.status);
  const canAddStage = canCreateSubProject && !isFinal && stagesEntry && !stagesEntry.loading && stages.length < 4;
  const overviewActive = selection.projectPage === 'overview' && !selection.form;
  const poolActive = selection.projectPage === 'pool';

  const isSubOpen = (id) => openSubs.has(id) || (selection.subProjectId === id && collapsedActive !== id);

  const toggleSub = (id) => {
    if (isSubOpen(id)) {
      setOpenSubs((current) => { const next = new Set(current); next.delete(id); return next; });
      if (selection.subProjectId === id) setCollapsedActive(id);
    } else {
      setOpenSubs((current) => new Set(current).add(id));
      if (collapsedActive === id) setCollapsedActive(null);
    }
  };

  const linkClass = (active) => `min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] transition ${
    active ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
  }`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-4">
        <a href="#/admin/projects" className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-teal-700">
          ← Semua Project
        </a>
        <p className="mt-3 font-mono text-[11px] font-semibold text-slate-400">{project.projectCode}</p>
        <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900" title={project.projectName}>{project.projectName}</p>
        <div className="mt-2"><StatusBadge status={project.status} map={PROJECT_STATUS} /></div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Navigasi project">
        <a
          href={`#/admin/projects/${project.id}`}
          className={`flex items-center gap-2 ${linkClass(overviewActive)}`}
          aria-current={overviewActive ? 'page' : undefined}
        >
          <span className="text-xs" aria-hidden="true">📊</span>
          Ringkasan Project
        </a>
        <a
          href={`#/admin/projects/${project.id}/pool`}
          className={`mt-0.5 flex items-center gap-2 ${linkClass(poolActive)}`}
          aria-current={poolActive ? 'page' : undefined}
        >
          <span className="text-xs" aria-hidden="true">🧰</span>
          Equipment Pool
        </a>

        <p className="mb-1 mt-4 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sub-Project</p>
        <ul className="space-y-0.5">
          {(!stagesEntry || stagesEntry.loading) && <li className="px-2 py-1.5 text-[11px] text-slate-400">Memuat tahapan...</li>}
          {stagesEntry?.error && <li className="px-2 py-1.5 text-[11px] text-red-600">{stagesEntry.error}</li>}
          {stagesEntry && !stagesEntry.loading && !stagesEntry.error && stages.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-slate-400">Belum ada sub-project.</li>
          )}

          {stages.map((stage) => {
            const open = isSubOpen(stage.id);
            const label = subProjectTypeLabel(stage.subProjectType);
            return (
              <li key={stage.id}>
                <div className="flex items-center gap-1">
                  <Toggle open={open} onClick={() => toggleSub(stage.id)} label={label} />
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[stage.status] || STATUS_DOT.planned}`} title={stage.status} aria-hidden="true" />
                  <a href={`#/admin/projects/${project.id}/sub/${stage.id}/volume`} className={`${linkClass(false)} font-medium`}>{label}</a>
                </div>
                {open && (
                  <ul className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
                    {SUB_PAGES.map((page) => {
                      const active = selection.subProjectId === stage.id && selection.subPage === page.key;
                      return (
                        <li key={page.key}>
                          <a
                            href={`#/admin/projects/${project.id}/sub/${stage.id}/${page.key}`}
                            className={`flex items-center gap-2 border-l-2 ${active ? 'border-teal-600' : 'border-transparent'} ${linkClass(active)}`}
                            aria-current={active ? 'page' : undefined}
                          >
                            <span className="text-xs" aria-hidden="true">{page.icon}</span>
                            <span className="truncate">{page.label}</span>
                            {page.mock && <span className="ml-auto rounded bg-violet-50 px-1 text-[9px] font-bold uppercase text-violet-600" title="Data contoh, belum tersambung API">Contoh</span>}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}

          {canAddStage && (
            <li>
              <a
                href={`#/admin/projects/${project.id}/sub/new`}
                className={`flex items-center gap-1 rounded-md px-1 py-1.5 text-[13px] font-medium transition ${
                  selection.form === 'sub-new' ? 'bg-teal-50 text-teal-800' : 'text-teal-700 hover:bg-teal-50'
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center font-bold">+</span>
                New Sub Project
              </a>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
