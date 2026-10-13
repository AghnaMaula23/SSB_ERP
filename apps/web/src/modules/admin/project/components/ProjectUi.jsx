// Komponen tampilan kecil yang dipakai berulang di halaman Project.

export function StatusBadge({ status, map, className = '' }) {
  const style = map[status] || { label: status || '-', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.className} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {style.label}
    </span>
  );
}

const barTone = {
  teal: 'bg-teal-600',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-400',
  slate: 'bg-slate-400',
};

export function ProgressBar({ value = 0, tone = 'teal', secondary = 0, label }) {
  const primary = Math.min(100, Math.max(0, value));
  const pending = Math.min(100 - primary, Math.max(0, secondary));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(primary)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="flex h-full">
        <div className={`h-full ${barTone[tone] || barTone.teal} transition-[width] duration-500`} style={{ width: `${primary}%` }} />
        {pending > 0 && <div className="h-full bg-amber-300/80" style={{ width: `${pending}%` }} title="Menunggu validasi" />}
      </div>
    </div>
  );
}

export function ProgressRing({ value = 0, size = 168, stroke = 14, tone = 'teal', label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, value));
  const color = tone === 'emerald' ? 'stroke-emerald-500' : 'stroke-teal-600';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className={`fill-none ${color} transition-[stroke-dashoffset] duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`font-bold tracking-tight text-slate-900 ${size >= 140 ? 'text-3xl' : 'text-lg'}`}>{label ?? `${pct.toFixed(1)}%`}</span>
        {sublabel && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'success', children, onDismiss }) {
  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  if (!children) return null;
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-xs ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="leading-relaxed">{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 font-bold opacity-60 hover:opacity-100" aria-label="Tutup pesan">✕</button>}
    </div>
  );
}

export function Breadcrumb({ items }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? <a href={item.href} className="hover:text-teal-700">{item.label}</a> : <span className={isLast ? 'text-teal-700' : ''}>{item.label}</span>}
            {!isLast && <span aria-hidden="true">›</span>}
          </span>
        );
      })}
    </nav>
  );
}

export function MetricCard({ label, value, hint, accent = false, tone = 'slate' }) {
  const valueTone = { slate: 'text-slate-900', teal: 'text-teal-700', emerald: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-600' };
  return (
    <article className={`card-panel p-4 ${accent ? 'border-l-4 border-l-teal-600' : ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tracking-tight sm:text-2xl ${valueTone[tone] || valueTone.slate}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>}
    </article>
  );
}

export function LoadingPanel({ children = 'Memuat data...' }) {
  return <div className="card-panel p-12 text-center text-sm text-slate-500">{children}</div>;
}

export function EmptyPanel({ icon = '📂', title, children, action }) {
  return (
    <div className="card-panel flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl" aria-hidden="true">{icon}</span>
      <h2 className="mt-4 text-base font-bold text-slate-900">{title}</h2>
      {children && <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Link aksi yang dikunci izin. Tanpa izin tombol tetap terlihat tapi nonaktif
 * dengan alasan di tooltip — pola yang sama dengan tombol Register di Divisi Alat.
 */
export function GuardedLink({ href, allowed = true, reason, className = 'btn btn-primary text-xs', children }) {
  if (allowed) return <a href={href} className={className}>{children}</a>;
  return <button type="button" disabled title={reason} className={className}>{children}</button>;
}

export function MockBanner({ children }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50 px-4 py-3 text-xs text-violet-800">
      <span className="text-base leading-none" aria-hidden="true">🧪</span>
      <p className="leading-relaxed"><b>Data contoh.</b> {children}</p>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
