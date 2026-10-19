import { formatDate } from '../../project/utils/projectFormat.js';
import { SYSTEM_FOLDERS, getSystemFileUrl } from '../services/systemFiles.js';
import { formatBytes } from '../utils/filesFormat.js';

/** Isi satu folder sistem (L7) — baca-saja, dari API modul sumbernya. */
export default function SystemFileList({ kind, system, onError }) {
  const meta = SYSTEM_FOLDERS[kind];

  // URL berlaku 5 menit — tab dibuka dulu (masih di dalam klik) agar tidak diblokir popup.
  const open = async (row) => {
    const tab = window.open('', '_blank');
    try {
      const url = await getSystemFileUrl(row.fileId);
      if (tab) { tab.opener = null; tab.location.href = url; } else { window.location.assign(url); }
    } catch (error) {
      tab?.close();
      onError(`${row.title} tidak bisa dibuka: ${error.message}`);
    }
  };

  if (system.loading) return <p className="py-12 text-center text-sm text-slate-500">Memuat {meta.label.toLowerCase()}...</p>;
  if (system.error) return <p className="py-12 text-center text-sm text-red-600">{system.error}</p>;
  if (!system.data?.available) return <p className="mx-auto max-w-md py-12 text-center text-sm text-slate-500">{system.data?.reason}</p>;

  const rows = system.data[kind];
  if (!rows.length) return <p className="py-12 text-center text-sm text-slate-500">Belum ada {meta.label.toLowerCase()} untuk project ini.</p>;

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => (
        <li key={row.key} className={`flex items-center gap-3 px-5 py-3 ${row.isCancelled ? 'opacity-60' : ''}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg" aria-hidden="true">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {row.title}
              {row.isCancelled && <span className="ml-2 rounded bg-red-50 px-1 py-0.5 text-[10px] font-bold uppercase text-red-600">Dibatalkan</span>}
            </p>
            <p className="truncate text-[11px] text-slate-500">{row.subtitle}</p>
          </div>
          <span className="hidden whitespace-nowrap text-xs text-slate-500 sm:block">{formatDate(row.date)}{row.size ? ` · ${formatBytes(row.size)}` : ''}</span>
          <button type="button" onClick={() => open(row)} className="rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-800 hover:border-teal-600 hover:text-teal-700">Buka ↗</button>
        </li>
      ))}
    </ul>
  );
}
