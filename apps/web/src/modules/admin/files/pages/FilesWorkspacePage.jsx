import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout.jsx';
import FolderManagerPage from './FolderManagerPage.jsx';
import FolderFormPage from './FolderFormPage.jsx';
import FolderDetailPage from './FolderDetailPage.jsx';
import UploadPage from './UploadPage.jsx';
import FilePage from './FilePage.jsx';
import { parseFilesRoute } from '../utils/filesRoute.js';

/** Menu Files Divisi Admin: folder proyek, isi folder, upload, dan pratinjau. */
export default function FilesWorkspacePage({ route, onNavigate, onBackToModules, onSignOut }) {
  const selection = parseFilesRoute(route) || { view: 'folders' };
  const [flash, setFlash] = useState({ route: '', text: '' });
  const flashFor = (target) => (flash.route === target ? flash.text : '');
  const goWithNotice = (target, text) => { setFlash({ route: target, text }); onNavigate(target); };
  const folderRoute = `admin/files/${selection.folderId}`;

  let content;
  switch (selection.view) {
    case 'folder-new':
      content = <FolderFormPage key={route} onCancel={() => onNavigate('admin/files')} onSaved={(folder) => goWithNotice(`admin/files/${folder.id}`, `Folder ${folder.name} dibuat. Unggah berkas pertamanya.`)} />;
      break;
    case 'folder':
      content = <FolderDetailPage key={route} folderId={selection.folderId} initialNotice={flashFor(route)} />;
      break;
    case 'upload':
      content = <UploadPage key={route} folderId={selection.folderId} onCancel={() => onNavigate(folderRoute)} onSaved={(file) => goWithNotice(folderRoute, `${file.name} berhasil diunggah.`)} />;
      break;
    case 'file':
      content = <FilePage key={route} folderId={selection.folderId} fileId={selection.fileId} onDeleted={(text) => goWithNotice(folderRoute, text)} />;
      break;
    default:
      content = <FolderManagerPage key={route} initialNotice={flashFor(route)} />;
  }

  return (
    <AdminLayout active="files" onNavigate={onNavigate} onBackToModules={onBackToModules} onSignOut={onSignOut}>
      {content}
    </AdminLayout>
  );
}
