const statusLabels = {
  normal: 'Ready',
  warning: 'Scheduled',
  due: 'Due Soon',
  overdue: 'Critical Overdue',
  inactive: 'Inactive',
};

const statusStyles = {
  normal: 'bg-slate-300 text-slate-600',
  warning: 'bg-amber-100 text-amber-700',
  due: 'bg-orange-100 text-orange-700',
  overdue: 'bg-red-100 text-red-600',
  inactive: 'bg-slate-300 text-slate-500',
};

export default function ResetMaintenanceModal({ row, metricNames, selectedNames, onToggle, onSubmit, onClose }) {
  if (!row) return null;

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[92vh] w-full max-w-xl flex-col border border-slate-300 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="reset-maintenance-title">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full border border-sky-200 text-xs text-[#08729a]">↻</span><h2 id="reset-maintenance-title" className="text-sm font-bold text-slate-800">Reset Parameter Maintenance</h2></div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center text-lg text-slate-500 hover:bg-slate-100" aria-label="Close reset maintenance dialog">×</button>
      </header>

      <div className="flex items-center justify-between bg-[#08729a] px-4 py-3 text-white sm:px-5">
        <div><p className="text-[9px] font-semibold uppercase tracking-widest text-sky-100">Item Code</p><p className="mt-1 text-sm font-bold">{row.itemCode}</p></div>
        <div className="border-l border-white/25 pl-4"><p className="text-[9px] font-semibold uppercase tracking-widest text-sky-100">Jenis Item</p><p className="mt-1 text-sm font-semibold">{row.itemName}</p></div>
        <span className="hidden border border-white/30 px-2 py-1 text-[9px] font-semibold sm:inline-block">{selectedNames.length} selected</span>
      </div>

      <div className="overflow-y-auto px-3 py-3 sm:px-4"><p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">Maintenance Categories</p><div className="space-y-2">{metricNames.map((name) => {
        const metric = row.metrics[name];
        const selected = selectedNames.includes(name);
        const metricStatus = metric?.status || (metric?.current >= metric?.threshold ? 'overdue' : 'normal');
        return <article key={name} className={`flex items-center gap-3 border p-3 transition ${selected ? 'border-[#08729a] bg-sky-50' : 'border-slate-200 bg-[#f5f8fb]'}`}>
          <span className="grid h-7 w-7 shrink-0 place-items-center border border-slate-300 bg-white text-xs text-slate-500">◈</span>
          <div className="min-w-0 flex-1"><h3 className="truncate text-[10px] font-bold text-slate-700">{name}</h3><p className="text-[8px] uppercase text-slate-400">{metric?.current || 0} / {metric?.threshold || 0} jam</p></div>
          <div className="hidden text-right sm:block"><p className={`text-xs font-bold ${metricStatus === 'overdue' || metricStatus === 'due' ? 'text-red-600' : 'text-[#08729a]'}`}>{metric?.current || 0} <span className="text-[8px] font-normal">Jam</span></p><p className="text-[8px] text-slate-500">Threshold: {metric?.threshold || 0} Jam</p></div>
          <button type="button" onClick={() => onToggle(name)} className={`min-w-20 border px-2 py-1.5 text-[9px] font-bold ${selected ? 'border-slate-400 bg-slate-300 text-slate-600' : 'border-[#08729a] bg-[#08729a] text-white hover:bg-[#075a7b]'}`}>{selected ? 'Reset Done' : 'Reset'}</button>
          <span className={`hidden px-2 py-1 text-[8px] font-bold sm:inline-block ${statusStyles[metricStatus] || statusStyles.normal}`}>{selected ? 'Ready' : statusLabels[metricStatus]}</span>
        </article>;
      })}</div></div>

      <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><button type="button" onClick={onClose} className="text-left text-[10px] font-semibold text-slate-600 hover:text-slate-900">Cancel</button><button type="button" onClick={onSubmit} disabled={!selectedNames.length} className="bg-[#08729a] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#075a7b] disabled:cursor-not-allowed disabled:bg-slate-300">▣ Submit All Changes</button></footer>
    </section>
  </div>;
}
