import { useEffect, useState } from 'react';
import { Breadcrumb, EmptyPanel, LoadingPanel, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDate, subProjectTypeLabel } from '../../project/utils/projectFormat.js';
import { ProjectTitle } from '../components/FilesUi.jsx';
import { listSystemFolder, openFileInNewTab } from '../services/projectFiles.js';
import { filesHref } from '../utils/filesRoute.js';
import { SYSTEM_FOLDERS, fileKind, formatBytes, projectCrumbs, stageLabel } from '../utils/filesFormat.js';

const ARCHIVE_LABEL = {
  'stage-progress': 'Progress harian',
  'stage-equipment': 'Alokasi alat',
  'stage-material': 'Material',
  'stage-labor': 'Tenaga kerja',
  'project-summary': 'Rekap tahapan',
  'supply-deliveries': 'Surat jalan supply',
  'rental-timesheet': 'Timesheet unit',
};

function describe(row, key) {
  if (key === 'closing-archive') {
    return {
      title: row.originalName,
      subtitle: [ARCHIVE_LABEL[row.archiveKey] || row.archiveKey, row.closedStatus === 'cancelled' ? 'ditutup batal' : 'ditutup selesai'].filter(Boolean).join(' · '),
    };
  }
  const source = row.source || {};
  return {
    title: source.deliveryNoteNumber ? `SJ ${source.deliveryNoteNumber}` : row.originalName,
    subtitle: [source.code, source.materialName, source.subProjectType ? subProjectTypeLabel(source.subProjectType) : null, row.originalName].filter(Boolean).join(' · '),
  };
}

/** Folder sistem baca-saja (L7/L8): surat jalan, bukti penerimaan, arsip penutupan. */
export default function SystemFolderPage({ type, projectId, directory, systemKey, subProjectId }) {
  const meta = SYSTEM_FOLDERS[systemKey];
  const stage = subProjectId ? (directory.stages || []).find((row) => row.subProjectId === subProjectId) : null;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    listSystemFolder(type, projectId, systemKey, subProjectId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((requestError) => { if (!cancelled) { setRows([]); setError(requestError.message); } });
    return () => { cancelled = true; };
  }, [type, projectId, systemKey, subProjectId]);

  const open = async (row) => {
    try {
      await openFileInNewTab(row.fileId);
    } catch (requestError) {
      setNotice(`${row.originalName} tidak bisa dibuka: ${requestError.message}`);
    }
  };

  return (
    <>
      <Breadcrumb items={projectCrumbs(type, directory, ...(stage ? [{ label: stageLabel(stage) }] : []), { label: meta.label })} />
      <ProjectTitle type={type} directory={directory} title={`${meta.icon} ${meta.label}`} subtitle={`${stageLabel(stage)} · folder sistem, baca-saja`} actions={<a href={filesHref.project(type, projectId)} className="btn btn-secondary text-xs">← Kembali</a>} />
      <Notice tone="error" onDismiss={() => setNotice('')}>{notice}</Notice>

      {!rows ? <LoadingPanel>Memuat {meta.label.toLowerCase()}...</LoadingPanel> : error ? (
        <EmptyPanel icon="⚠️" title={`${meta.label} gagal dimuat`}>{error}</EmptyPanel>
      ) : (
        <section className="card-panel overflow-hidden" aria-label={meta.label}>
          <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
            <b className="text-slate-800">Folder sistem.</b> {meta.hint} — tampil langsung dari datanya, tidak perlu diunggah ulang.
          </p>
          {rows.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">Belum ada {meta.label.toLowerCase()} di sini.</p> : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => {
                const kind = fileKind({ kind: row.kind, fileName: row.originalName, mimeType: row.mimeType });
                const { title, subtitle } = describe(row, systemKey);
                return (
                  <li key={row.fileId} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${row.cancelled ? 'opacity-60' : ''}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${kind.tone}`} aria-hidden="true">{kind.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {title}
                        {row.cancelled && <span className="ml-2 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold uppercase text-red-600">Dibatalkan</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
                      <p className="text-[11px] text-slate-400 sm:hidden">{formatDate(row.uploadedAt)} · {formatBytes(row.sizeBytes)}</p>
                    </div>
                    <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:block">{formatDate(row.uploadedAt)} · {formatBytes(row.sizeBytes)}</span>
                    <button type="button" onClick={() => open(row)} className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-brand-600 hover:text-brand-700">Buka ↗</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
