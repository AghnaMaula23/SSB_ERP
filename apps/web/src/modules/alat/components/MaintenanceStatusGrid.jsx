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
    <section className="card-panel" aria-labelledby="maintenance-title">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 font-bold">
            🛠️
          </div>
          <h2 id="maintenance-title" className="text-base font-bold text-slate-900">Maintenance & Workhour Status</h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        {metrics.length > 0 ? metrics.map((metric, index) => {
          const [name, hours, condition] = Array.isArray(metric)
            ? metric
            : [
              metric.name || metric.maintenanceAspect?.aspectName || 'Aspect',
              metric.hours || `${metric.currentValueSinceReset ?? 0} / ${metric.thresholdValue ?? '-'} Jam`,
              metric.condition || (metric.status ? `Status: ${metric.status}` : `${metric.remainingValue ?? '-'} hrs remaining`),
            ];
          return (
            <div key={`${name}-${index}`} className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{name}</h3>
              <p className="mt-1.5 text-lg font-bold text-slate-900">{hours}</p>
              <p className="mt-1 text-xs text-slate-500">{condition}</p>
            </div>
          );
        }) : (
          <div className="col-span-full p-8 text-center text-xs text-slate-500">No maintenance data available.</div>
        )}
      </div>
    </section>
  );
}

