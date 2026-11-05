import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { EmptyPanel, LoadingPanel } from '../../project/components/ProjectUi.jsx';
import ProjectListPage from './ProjectListPage.jsx';
import ProjectDirectoryPage from './ProjectDirectoryPage.jsx';
import FolderFormPage from './FolderFormPage.jsx';
import FolderDetailPage from './FolderDetailPage.jsx';
import SystemFolderPage from './SystemFolderPage.jsx';
import TrashPage from './TrashPage.jsx';
import UploadPage from './UploadPage.jsx';
import FilePage from './FilePage.jsx';
import { getDirectory } from '../services/projectFiles.js';
import { filesHref, parseFilesRoute } from '../utils/filesRoute.js';

const toRoute = (href) => href.replace(/^#\//, '');

/**
 * Menu Files Divisi Admin. Direktori satu project dimuat sekali dan dipakai
 * bersama semua halaman di bawahnya (folder, unggah, berkas, sampah) supaya
 * breadcrumb & nama tahapan tidak dimuat ulang tiap pindah halaman.
 */
export default function FilesWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseFilesRoute(route) || { view: 'projects' };
  const projectKey = selection.type ? `${selection.type}:${selection.projectId}` : null;
  const [directory, setDirectory] = useState({ key: null, data: null, error: '' });
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState({ route: '', text: '' });
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const goWithNotice = (href, text) => { const target = toRoute(href); setFlash({ route: target, text }); onNavigate(target); };
  const reloadDirectory = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!projectKey) return undefined;
    let cancelled = false;
    getDirectory(selection.type, selection.projectId)
      .then((data) => { if (!cancelled) setDirectory({ key: projectKey, data, error: '' }); })
      .catch((error) => { if (!cancelled) setDirectory({ key: projectKey, data: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [projectKey, selection.type, selection.projectId, reloadKey]);

  let content;
  if (selection.view === 'projects') {
    content = <ProjectListPage key={route} />;
  } else if (directory.key !== projectKey) {
    content = <LoadingPanel>Memuat direktori project...</LoadingPanel>;
  } else if (directory.error) {
    content = <EmptyPanel icon="🔎" title="Project tidak ditemukan" action={<a href={filesHref.projects()} className="btn btn-secondary text-xs">← Kembali</a>}>{directory.error}</EmptyPanel>;
  } else {
    const { type, projectId } = selection;
    const dir = directory.data;
    const folderHref = filesHref.folder(type, projectId, selection.folderId);
    const shared = { type, projectId, directory: dir };
    switch (selection.view) {
      case 'folder-new':
        content = <FolderFormPage key={route} {...shared} subProjectId={selection.subProjectId} onCancel={() => onNavigate(toRoute(filesHref.project(type, projectId)))} onSaved={(folder) => { reloadDirectory(); goWithNotice(filesHref.folder(type, projectId, folder.id), `Folder ${folder.name} dibuat. Unggah berkas pertamanya.`); }} />;
        break;
      case 'system':
        content = <SystemFolderPage key={route} {...shared} systemKey={selection.systemKey} subProjectId={selection.subProjectId} />;
        break;
      case 'trash':
        content = <TrashPage key={route} {...shared} onChanged={reloadDirectory} />;
        break;
      case 'folder':
        content = <FolderDetailPage key={route} {...shared} folderId={selection.folderId} initialNotice={flashFor(route)} onChanged={reloadDirectory} onDeleted={(text) => { reloadDirectory(); goWithNotice(filesHref.project(type, projectId), text); }} />;
        break;
      case 'upload':
        content = <UploadPage key={route} {...shared} folderId={selection.folderId} onCancel={() => onNavigate(toRoute(folderHref))} onSaved={(file) => { reloadDirectory(); goWithNotice(folderHref, `${file.name} berhasil diunggah.`); }} />;
        break;
      case 'file':
        content = <FilePage key={route} {...shared} folderId={selection.folderId} fileId={selection.fileId} onDeleted={(text) => { reloadDirectory(); goWithNotice(folderHref, text); }} onMoved={(file) => { reloadDirectory(); goWithNotice(filesHref.file(type, projectId, file.folderId, file.id), `${file.name} dipindahkan ke folder ${file.folderName}.`); }} />;
        break;
      default:
        content = <ProjectDirectoryPage key={route} {...shared} initialNotice={flashFor(route)} />;
    }
  }

  return (
    <AdminLayout active="files" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {content}
    </AdminLayout>
  );
}
