import { useState } from 'react';
import { Notice } from '../../admin/project/components/ProjectUi.jsx';
import { RejectReasonForm } from '../../admin/approvals/components/ApprovalUi.jsx';
import { actorName, formatDateTime } from '../../admin/project/utils/projectFormat.js';
import { openFileInNewTab } from '../../admin/files/services/projectFiles.js';

// Komponen yang dipakai berulang di modul Divisi Lapangan.

export function StageSelect({ id = 'subProjectId', stages, value, onChange, disabled = false }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="input-control text-sm disabled:bg-slate-100">
      <option value="">{stages ? '- Pilih tahapan aktif -' : 'Memuat tahapan...'}</option>
      {(stages || []).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
    </select>
  );
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Pilih berkas bukti: PDF/JPG/PNG/WebP, maks 10 MB per file (aturan `evidence`
 * backend). Pilihan baru ditambahkan ke yang sudah ada, supaya foto dari kamera
 * HP bisa diambil satu per satu.
 */
export function FilePicker({ id, files, onChange, max = 1 }) {
  const [error, setError] = useState('');
  const handle = (event) => {
    const picked = [...event.target.files];
    event.target.value = '';
    const invalid = picked.find((file) => file.size > MAX_BYTES || !/\.(pdf|jpe?g|png|webp)$/i.test(file.name));
    if (invalid) { setError(`${invalid.name}: hanya PDF, JPG, PNG, atau WebP, maksimal 10 MB. Foto HEIC iPhone perlu diubah ke JPG dulu.`); return; }
    const next = max === 1 ? picked.slice(0, 1) : [...files, ...picked];
    if (next.length > max) { setError(`Maksimal ${max} berkas.`); return; }
    setError('');
    onChange(next);
  };
  return (
    <div>
      <input id={id} type="file" accept={ACCEPT} multiple={max > 1} onChange={handle} className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700" />
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              <span className="truncate">📎 {file.name}</span>
              <button type="button" onClick={() => onChange(files.filter((_, n) => n !== index))} className="shrink-0 font-bold text-slate-400 hover:text-red-600" aria-label={`Hapus ${file.name}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Daftar berkas tersimpan. URL-nya berlaku singkat, jadi diminta saat diklik. */
export function FileLinks({ files = [], label = 'Berkas' }) {
  const [error, setError] = useState('');
  return (
    <section className="card-panel p-4" aria-label={label}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">📎 {label} ({files.length})</p>
      {error && <div className="mt-2"><Notice tone="error" onDismiss={() => setError('')}>{error}</Notice></div>}
      <ul className="mt-2 space-y-1">
        {files.map((file) => {
          const fileId = file.fileId ?? file.id;
          return (
            <li key={fileId}>
              <button type="button" onClick={() => openFileInNewTab(fileId).catch((requestError) => setError(requestError.message))} className="w-full truncate text-left text-xs font-semibold text-brand-700 hover:underline">
                {file.originalName || file.fileName || `Berkas ${fileId}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Jejak keputusan: siapa, kapan, alasannya — supaya pengaju tahu yang harus diperbaiki. */
export function DecisionTrail({ entries }) {
  const shown = entries.filter((entry) => entry.at);
  return (
    <section className="card-panel p-4" aria-label="Riwayat keputusan">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Riwayat Keputusan</p>
      {shown.length === 0 ? <p className="mt-2 text-xs text-slate-500">Belum ada keputusan.</p> : (
        <ol className="mt-2 space-y-3">
          {shown.map((entry) => (
            <li key={entry.title} className="text-xs">
              <p className="font-semibold text-slate-800">{entry.title}</p>
              <p className="text-[11px] text-slate-500">{actorName(entry.by)} · {formatDateTime(entry.at)}</p>
              {entry.notes && <p className="mt-1 rounded bg-slate-50 p-2 text-slate-700">{entry.notes}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function InfoGrid({ rows }) {
  return (
    <dl className="card-panel grid gap-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {rows.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words font-medium text-slate-900">{value || '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Kerangka ringkas halaman daftar: kartu berisi filter, tabel, dan pager. */
export function ListCard({ filters, children }) {
  return (
    <section className="card-panel overflow-hidden">
      {filters && <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">{filters}</div>}
      {children}
    </section>
  );
}

/** Tab daftar Kas Lapangan: pengajuan dana & laporan realisasi. */
export function CashTabs({ active }) {
  const tabs = [
    { key: 'pengajuan', label: 'Pengajuan Dana', href: '#/lapangan/kas' },
    { key: 'laporan', label: 'Laporan Realisasi', href: '#/lapangan/kas/laporan' },
  ];
  return (
    <nav className="mb-4 flex gap-2" aria-label="Kas lapangan">
      {tabs.map((tab) => (
        <a key={tab.key} href={tab.href} aria-current={active === tab.key ? 'page' : undefined} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${active === tab.key ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

/** Tombol batal + isian alasan. `reason` null bila backend tidak memintanya. */
export function CancelAction({ label = 'Batalkan', needsReason = true, confirmText, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  if (!needsReason) {
    const run = async () => {
      if (!window.confirm(confirmText)) return;
      setError('');
      try {
        await onConfirm(null);
      } catch (requestError) {
        setError(requestError.message);
      }
    };
    return (
      <>
        <button type="button" onClick={run} className="btn btn-secondary text-xs text-red-600">{label}</button>
        {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
      </>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary text-xs text-red-600">{label}</button>;
  return (
    <div className="w-full">
      <RejectReasonForm
        label="Alasan pembatalan"
        submitLabel={label}
        requiredMessage="Alasan pembatalan wajib diisi."
        placeholder="Contoh: Salah input tanggal"
        onSubmit={onConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
