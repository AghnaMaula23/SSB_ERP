const toneStyles = {
  blue: { icon: '📦', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  amber: { icon: '⚠️', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  green: { icon: '✅', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  red: { icon: '🛑', badge: 'bg-red-50 text-red-700 border-red-200' },
  slate: { icon: '📋', badge: 'bg-slate-50 text-slate-700 border-slate-200' },
  violet: { icon: '🧾', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export default function StatCard({ label, value, tone = 'blue', hint, onClick }) {
  const styles = toneStyles[tone] || toneStyles.blue;
  const Wrapper = onClick ? 'button' : 'article';

  return (
    // Di mobile kartu dibuat ringkas (tanpa ikon) supaya beberapa kartu muat dalam satu baris.
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className="card-panel flex items-center justify-between gap-2 p-3 text-left transition hover:border-slate-300 hover:shadow-md sm:p-4">
      <div className="min-w-0">
        <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-slate-500 sm:text-xs">{label}</p>
        <p className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400 sm:text-[11px]">{hint}</p>}
      </div>
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg sm:flex ${styles.badge}`}>
        {styles.icon}
      </div>
    </Wrapper>
  );
}

