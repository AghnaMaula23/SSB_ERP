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
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className="card-panel flex items-center justify-between p-4 text-left transition hover:border-slate-300 hover:shadow-md">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>}
      </div>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg ${styles.badge}`}>
        {styles.icon}
      </div>
    </Wrapper>
  );
}

