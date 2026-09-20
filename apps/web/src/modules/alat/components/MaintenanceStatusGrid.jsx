const defaultMetrics = [
  ['Oli Mesin', '120 Jam', 'Next service in 30 hrs'],
  ['Filter Udara', '200 Jam', 'Condition: Optimal'],
  ['Filter Solar', '150 Jam', 'Last check: 2023-11-01'],
  ['Oli Transmisi', '450 Jam', 'Critical threshold at 500'],
  ['Filter Oli Mesin', '250 Jam', 'Replacement scheduled'],
  ['Filter Hidrolik', '300 Jam', 'Stable performance'],
  ['Oli Hidrolik', '450 Jam', 'Critical threshold at 500'],
  ['Oli Gardan', '450 Jam', 'Critical threshold at 500'],
];

export default function MaintenanceStatusGrid({ metrics = defaultMetrics, status = 'Running Well' }) {
  return (
    <section className="border border-[#cbd5e1] bg-white" aria-labelledby="maintenance-title">
      <div className="flex items-center justify-between border-b border-[#cbd5e1] px-4 py-3">
        <h2 id="maintenance-title" className="flex items-center gap-2 text-xs font-semibold text-[#334155]"><span className="text-sm text-emerald-700" aria-hidden="true">▧</span>Status Maintenance &amp; Workhour</h2>
        <span className="border border-emerald-100 bg-[#e0f2ed] px-2 py-1 text-[10px] font-semibold text-[#007b64]">{status}</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-[#cbd5e1] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {metrics.length > 0 ? metrics.map((metric, index) => {
          const [name, hours, condition] = Array.isArray(metric)
            ? metric
            : [
              metric.name || metric.maintenanceAspect?.aspectName || 'Maintenance',
              metric.hours || `${metric.currentValueSinceReset ?? 0} / ${metric.thresholdValue ?? '-'} Jam`,
              metric.condition || (metric.status ? `Status: ${metric.status}` : `${metric.remainingValue ?? '-'} jam tersisa`),
            ];
          return <article key={`${name}-${index}`} className="min-h-[92px] border-b border-[#cbd5e1] p-4 last:border-b-0 lg:nth-[n+5]:border-b-0"><h3 className="text-[10px] font-medium uppercase text-[#475569]">{name}</h3><p className="mt-1 text-xs font-bold text-[#1e293b]">{hours}</p><p className="mt-2 text-[10px] text-[#475569]">{condition}</p></article>;
        }) : <div className="col-span-full px-4 py-8 text-center text-xs text-[#64748b]">Belum ada data maintenance.</div>}
      </div>
    </section>
  );
}
