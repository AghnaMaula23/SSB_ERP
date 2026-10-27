import { useState } from 'react';
import { Breadcrumb, Notice, StatusBadge } from '../../project/components/ProjectUi.jsx';
import { hasPermission } from '../../../../services/permissions.js';
import { FolderCard, ProjectTitle } from '../components/FilesUi.jsx';
import { filesHref } from '../utils/filesRoute.js';
import { PROJECT_STATUS, formatBytes, projectCrumbs, stageLabel } from '../utils/filesFormat.js';

function FolderGrid({ type, projectId, folders, newHref, canCreate }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => <FolderCard key={folder.kind === 'system' ? `${folder.key}-${folder.subProjectId}` : folder.id} type={type} projectId={projectId} folder={folder} />)}
      {canCreate && (
        <a href={newHref} className="flex min-h-20 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-600 transition hover:border-brand-500 hover:bg-brand-50/40 hover:text-brand-700">
          <span aria-hidden="true">+</span> Folder baru
        </a>
      )}
      {!folders.length && !canCreate && <p className="text-xs text-slate-500">Belum ada folder.</p>}
    </div>
  );
}

/** Isi satu project: folder tingkat project, lalu folder per tahapan (konstruksi). */
export default function ProjectDirectoryPage({ type, projectId, directory, initialNotice }) {
  const [notice, setNotice] = useState(initialNotice || '');
  const canCreate = hasPermission('project-file:create');
  const stages = directory.stages || [];
  const allFolders = [...directory.folders, ...stages.flatMap((stage) => stage.folders)];
  const userFolders = allFolders.filter((folder) => folder.kind === 'user');
  const totalFiles = allFolders.reduce((sum, folder) => sum + (folder.fileCount || 0), 0);
  const totalSize = userFolders.reduce((sum, folder) => sum + (folder.totalSize || 0), 0);

  return (
    <>
      <Breadcrumb items={projectCrumbs(type, directory)} />
      <ProjectTitle
        type={type}
        directory={directory}
        title={directory.project.name}
        subtitle={`${userFolders.length} folder · ${totalFiles} berkas · ${formatBytes(totalSize)} diunggah user`}
        actions={<a href={filesHref.trash(type, projectId)} className="btn btn-secondary text-xs">🗑 Sampah</a>}
      />
      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>

      <section className="mb-8" aria-labelledby="project-folders">
        <h2 id="project-folders" className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Tingkat Project</h2>
        <FolderGrid type={type} projectId={projectId} folders={directory.folders} newHref={filesHref.newFolder(type, projectId)} canCreate={canCreate} />
      </section>

      {stages.map((stage) => (
        <section key={stage.subProjectId} className="mb-8" aria-labelledby={`stage-${stage.subProjectId}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id={`stage-${stage.subProjectId}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{stageLabel(stage)}</h2>
            <StatusBadge status={stage.status} map={PROJECT_STATUS} />
          </div>
          <FolderGrid type={type} projectId={projectId} folders={stage.folders} newHref={filesHref.newFolder(type, projectId, stage.subProjectId)} canCreate={canCreate} />
        </section>
      ))}

      <p className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
        Folder <b>Sistem</b> baca-saja — isinya tampil langsung dari modul sumbernya (pengiriman, penerimaan material, arsip penutupan), tidak perlu diunggah ulang.
      </p>
    </>
  );
}
