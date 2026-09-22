const toneStyles = {
  blue: { icon: '📦', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  amber: { icon: '⚠️', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  green: { icon: '✅', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function StatCard({ label, value, tone = 'blue' }) {
  const styles = toneStyles[tone] || toneStyles.blue;

  return (
    <article className="card-panel flex items-center justify-between p-4">
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      </div>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg ${styles.badge}`}>
        {styles.icon}
      </div>
    </article>
  );
}

