import { useState } from 'react';

// Komponen tampilan bersama Pusat Approval.

export function StatTile({ label, value, hint, icon, tone = 'slate' }) {
  const valueTone = { slate: 'text-slate-900', amber: 'text-amber-700', teal: 'text-teal-800' };
  return (
    <article className="card-panel relative overflow-hidden p-5">
      <span className="absolute right-4 top-4 text-4xl opacity-15" aria-hidden="true">{icon}</span>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold tracking-tight sm:text-3xl ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </article>
  );
}

export function DecisionButtons({ onApprove, onReject, disabled, approveTitle, rejectTitle, approveLabel = 'Approve', busy }) {
  return (
    <div className="flex justify-end gap-1.5">
      <button type="button" onClick={onApprove} disabled={disabled || !onApprove} title={approveTitle} className="rounded-md bg-emerald-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-xs transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? '...' : approveLabel}
      </button>
      <button type="button" onClick={onReject} disabled={disabled || !onReject} title={rejectTitle} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
        Reject
      </button>
    </div>
  );
}

export function Pager({ page, totalPages, total, shown, onChange, label = 'data' }) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1);
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
      <span>Menampilkan {shown} dari {total} {label}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn btn-secondary h-8 w-8 p-0" aria-label="Sebelumnya">‹</button>
        {pages.map((n, index) => (
          <span key={n} className="flex items-center gap-1">
            {index > 0 && n - pages[index - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
            <button type="button" onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined} className={`h-8 min-w-8 rounded-md border px-2 text-xs font-semibold ${n === page ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{n}</button>
          </span>
        ))}
        <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="btn btn-secondary h-8 w-8 p-0" aria-label="Berikutnya">›</button>
      </div>
    </footer>
  );
}

export function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {options.map((option) => (
        <button
          key={option.value || 'all'}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${value === option.value ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
        >
          {option.label}{option.count !== undefined && <span className="ml-1 text-slate-400">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Isian alasan penolakan — backend mewajibkan `notes` saat menolak (400 tanpa itu).
 * `onSubmit(notes)` boleh melempar; pesannya ditampilkan di bawah isian.
 */
export function RejectReasonForm({ label, submitLabel = 'Tolak', placeholder, onSubmit, onCancel }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!notes.trim()) { setError('Alasan penolakan wajib diisi.'); return; }
    setBusy(true);
    try {
      await onSubmit(notes.trim());
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 text-left sm:flex-row sm:items-start">
      <label className="flex-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">{label}</span>
        <input
          autoFocus
          value={notes}
          maxLength={500}
          onChange={(event) => { setNotes(event.target.value); setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } if (event.key === 'Escape') onCancel(); }}
          className="input-control mt-1 text-sm"
          placeholder={placeholder}
        />
        {error && <span className="mt-1 block text-[11px] font-medium text-red-600">{error}</span>}
      </label>
      <div className="flex gap-2 sm:pt-5">
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary text-xs">Batal</button>
        <button type="button" onClick={submit} disabled={busy} className="btn btn-danger text-xs">{busy ? 'Menyimpan...' : submitLabel}</button>
      </div>
    </div>
  );
}
