const statusLabels = {
  normal: 'Ready',
  warning: 'Scheduled',
  due: 'Due Soon',
  overdue: 'Critical Overdue',
  inactive: 'Inactive',
};

const statusStyles = {
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function ResetMaintenanceModal({ row, metricNames, selectedNames, onToggle, onSubmit, onClose }) {
  if (!row) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="modal-content max-w-xl" role="dialog" aria-modal="true" aria-labelledby="reset-maintenance-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold">
              ↻
            </div>
            <h2 id="reset-maintenance-title" className="text-base font-bold text-slate-900">Reset Maintenance Parameters</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </header>

        <div className="bg-slate-900 px-6 py-3.5 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Unit Code</p>
            <p className="text-sm font-bold font-mono">{row.itemCode}</p>
          </div>
          <div className="border-l border-slate-700 pl-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Equipment Name</p>
            <p className="text-sm font-semibold">{row.itemName}</p>
          </div>
          <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-semibold text-teal-300">
            {selectedNames.length} selected
          </span>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parameters</p>
          {metricNames.map((name) => {
            const metric = row.metrics[name];
            const selected = selectedNames.includes(name);
            const metricStatus = metric?.status || (metric?.current >= metric?.threshold ? 'overdue' : 'normal');

            return (
              <div
                key={name}
                className={`flex items-center justify-between rounded-lg border p-3.5 transition ${
                  selected ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <h3 className="text-xs font-bold text-slate-900">{name}</h3>
                  <p className="text-[11px] text-slate-500">
                    Current: {metric?.current || 0} / Threshold: {metric?.threshold || 0} hrs
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[metricStatus] || statusStyles.normal}`}>
                    {statusLabels[metricStatus]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggle(name)}
                    className={`btn text-xs py-1 px-3 ${selected ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {selected ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!selectedNames.length}
            className="btn btn-primary text-xs"
          >
            Reset Selected Parameters
          </button>
        </footer>
      </div>
    </div>
  );
}

