import { StatusBadge } from '../../project/components/ProjectUi.jsx';
import { filesHref } from '../utils/filesRoute.js';
import { PROJECT_KINDS, PROJECT_STATUS, SYSTEM_FOLDERS, formatBytes, timeAgo } from '../utils/filesFormat.js';

/** Judul halaman yang menyebut project-nya — dipakai di semua halaman dalam satu project. */
export function ProjectTitle({ type, directory, title, subtitle, actions }) {
  const { project } = directory;
  return (
    <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-600">{project.code}</span> · {PROJECT_KINDS[type]?.icon} {PROJECT_KINDS[type]?.label}{project.clientName ? ` · ${project.clientName}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <StatusBadge status={project.status} map={PROJECT_STATUS} />
        </div>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:min-h-10 [&>*]:flex-1 sm:[&>*]:min-h-0 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

/** Kartu satu folder — user maupun sistem. */
export function FolderCard({ type, projectId, folder }) {
  const system = folder.kind === 'system';
  const meta = system ? SYSTEM_FOLDERS[folder.key] : null;
  const href = system
    ? filesHref.system(type, projectId, folder.key, folder.subProjectId)
    : filesHref.folder(type, projectId, folder.id);
  return (
    <a href={href} className={`card-panel group flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md ${system ? 'bg-slate-50/70' : ''}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${system ? 'bg-white ring-1 ring-slate-200' : 'bg-brand-50'}`} aria-hidden="true">{meta?.icon || '📂'}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-slate-900 group-hover:text-brand-700">{folder.name}</span>
          {system && <span className="shrink-0 rounded bg-slate-200/70 px-1 text-[9px] font-bold uppercase text-slate-500">Sistem</span>}
        </span>
        <span className="mt-0.5 block text-[11px] text-slate-500">
          {folder.fileCount} berkas · {formatBytes(folder.totalSize)}
        </span>
        <span className="block text-[11px] text-slate-400">{folder.lastUploadAt ? `Diperbarui ${timeAgo(folder.lastUploadAt)}` : 'Belum ada berkas'}</span>
      </span>
    </a>
  );
}
