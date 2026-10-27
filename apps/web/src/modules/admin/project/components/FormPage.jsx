import { Breadcrumb } from './ProjectUi.jsx';

/**
 * Kerangka halaman form: breadcrumb, judul berikon, kartu isi, dan footer
 * aksi. Dipakai form project dan sub-project yang tampil sebagai halaman.
 */
export default function FormPage({ breadcrumb, icon, title, subtitle, busy = false, onCancel, onSubmit, submitLabel, footerNote, aside, children }) {
  return (
    <>
      <Breadcrumb items={breadcrumb} />
      <div className="mb-6 mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
      </div>

      {/* Batas lebar ada di grid, bukan di form — supaya kartu samping menempel
          ke form di layar lebar, tidak terlempar ke tepi kanan. */}
      <div className={`grid items-start gap-5 ${aside ? 'max-w-6xl xl:grid-cols-[minmax(0,1fr)_18rem]' : 'max-w-3xl'}`}>
        <form onSubmit={onSubmit} noValidate className="card-panel min-w-0 overflow-hidden">
          <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
            {footerNote && <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500">{footerNote}</p>}
            <div className="ml-auto flex w-full gap-2 sm:w-auto">
              <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary min-h-11 flex-1 text-xs sm:min-h-0 sm:flex-none">Batal</button>
              <button type="submit" disabled={busy} className="btn btn-primary min-h-11 flex-1 text-xs sm:min-h-0 sm:flex-none">{busy ? 'Menyimpan...' : submitLabel}</button>
            </div>
          </footer>
        </form>
        {aside && <aside className="space-y-4">{aside}</aside>}
      </div>
    </>
  );
}

export function Field({ label, htmlFor, required = false, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p> : hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function SectionDivider({ children }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{children}</span>
      <span className="h-px flex-1 border-t border-dashed border-slate-300" />
    </div>
  );
}

/** Kartu info samping form — penjelasan singkat aturan bisnis. */
export function InfoCard({ title, children }) {
  return (
    <div className="card-panel p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">{title}</p>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{children}</div>;
}

