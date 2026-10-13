import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDateTime } from '../../project/utils/projectFormat.js';
import { deleteFile, getFile, getFolder, readBlob } from '../services/fileStore.js';
import { fileKind, formatBytes } from '../utils/filesFormat.js';

/** Pratinjau & detail satu berkas. */
export default function FilePage({ folderId, fileId, onDeleted }) {
  const [state, setState] = useState({ folder: null, file: null, url: '', error: '' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    Promise.all([getFolder(folderId), getFile(fileId)])
      .then(async ([folder, file]) => {
        if (file.folderId !== folder.id) throw new Error('Berkas ini bukan milik folder tersebut.');
        const blob = file.hasBlob ? await readBlob(file.id).catch(() => null) : null;
        objectUrl = blob ? URL.createObjectURL(blob) : '';
        if (!cancelled) setState({ folder, file, url: objectUrl, error: '' });
      })
      .catch((error) => { if (!cancelled) setState({ folder: null, file: null, url: '', error: error.message }); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, folderId]);

  const { folder, file, url, error } = state;
  if (error) return <EmptyPanel icon="🔎" title="Berkas tidak ditemukan" action={<a href={`#/admin/files/${folderId}`} className="btn btn-secondary text-xs">← Kembali ke folder</a>}>{error}</EmptyPanel>;
  if (!file) return <LoadingPanel>Memuat berkas...</LoadingPanel>;

  const kind = fileKind(file);

  const remove = async () => {
    if (!window.confirm(`Hapus berkas ${file.fileName}? Tidak bisa dibatalkan.`)) return;
    try {
      await deleteFile(file.id);
      onDeleted(`${file.name} dihapus.`);
    } catch (requestError) {
      setNotice(requestError.message);
    }
  };

  const preview = () => {
    if (!url) {
      return (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#f8fafc_0_12px,#f1f5f9_12px_24px)] text-center">
          <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${kind.tone}`}>{kind.icon}</span>
          <p className="text-sm font-semibold text-slate-700">{file.isDemo ? 'Berkas contoh — tidak memiliki isi' : 'Isi berkas tidak ditemukan di browser ini'}</p>
          <p className="max-w-sm text-xs text-slate-500">{file.isDemo ? 'Unggah berkas sungguhan untuk melihat pratinjaunya di sini.' : 'Berkas mungkin diunggah dari browser lain atau data browser sudah dibersihkan.'}</p>
        </div>
      );
    }
    if (kind.kind === 'image') return <img src={url} alt={file.name} className="max-h-[70vh] w-full bg-slate-900/5 object-contain" />;
    if (kind.kind === 'pdf') return <iframe src={url} title={file.name} className="h-[70vh] w-full" />;
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 text-center">
        <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${kind.tone}`}>{kind.icon}</span>
        <p className="text-sm font-semibold text-slate-700">Pratinjau tidak tersedia untuk jenis berkas ini</p>
        <a href={url} download={file.fileName} className="btn btn-primary mt-2 text-xs">↓ Unduh untuk membuka</a>
      </div>
    );
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Files', href: '#/admin/files' }, { label: folder.name, href: `#/admin/files/${folder.id}` }, { label: file.name }]} />
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{file.name}</h1>
            <p className="truncate font-mono text-xs text-slate-500">{file.fileName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {url && <a href={url} download={file.fileName} className="btn btn-primary text-xs">↓ Unduh</a>}
          {url && <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs">↗ Buka di tab baru</a>}
          <button type="button" onClick={remove} className="btn btn-ghost text-xs text-red-600 hover:bg-red-50">🗑 Hapus</button>
        </div>
      </div>

      {notice && <Notice tone="error" onDismiss={() => setNotice('')}>{notice}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card-panel overflow-hidden" aria-label="Pratinjau">{preview()}</section>
        <aside className="card-panel h-fit p-4 text-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Detail Berkas</p>
          <dl className="mt-3 space-y-2.5">
            {[
              ['Kategori', file.category],
              ['Ukuran', formatBytes(file.size)],
              ['Jenis', file.mimeType || '-'],
              ['Diunggah', formatDateTime(file.uploadedAt)],
              ['Pengunggah', file.uploadedBy?.fullName || '-'],
              ['Folder', `${folder.name} · ${folder.projectCode}`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                <dd className="mt-0.5 break-words text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          {file.description && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deskripsi</p>
              <p className="mt-1 whitespace-pre-line text-slate-700">{file.description}</p>
            </div>
          )}
          {file.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              {file.tags.map((tag) => <span key={tag} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{tag}</span>)}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
