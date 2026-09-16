const toneStyles = {
  blue: { icon: '▣', iconClass: 'text-[#08729a]', valueClass: 'text-[#1e293b]' },
  amber: { icon: '⚠', iconClass: 'text-[#9a6b00]', valueClass: 'text-[#1e293b]' },
  green: { icon: '✓', iconClass: 'text-[#00866b]', valueClass: 'text-[#1e293b]' },
};

export default function StatCard({ label, value, tone = 'blue' }) {
  const styles = toneStyles[tone];

  return (
    <article className="flex min-h-[57px] items-start justify-between border border-[#cbd5e1] bg-[#f8fafc] px-3 py-2.5">
      <div>
        <p className="text-[8px] font-semibold tracking-wide text-[#475569]">{label}</p>
        <p className={`mt-1 text-[15px] font-bold ${styles.valueClass}`}>{value}</p>
      </div>
      <span className={`text-base ${styles.iconClass}`} aria-hidden="true">{styles.icon}</span>
    </article>
  );
}
