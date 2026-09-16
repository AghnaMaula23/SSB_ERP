import { useState } from 'react';

const capacityOptions = ['Kelas 10 Ton', 'Kelas 20 Ton', 'Kelas >20 Ton'];
const checkboxClass = 'h-4 w-4 appearance-none rounded border border-slate-300 bg-white transition checked:border-[#08729a] checked:bg-[#08729a] focus:outline-none focus:ring-2 focus:ring-[#08729a]/20';

export default function FilterItemModal({ isOpen, options, value, onApply, onReset, onClose }) {
  const [draft, setDraft] = useState(value);
  if (!isOpen) return null;

  const selectedCount = draft.statuses.length + draft.jenis.length + draft.manufacturers.length + (draft.capacity ? 1 : 0);
  const updateDraft = (field, nextValue) => setDraft((current) => ({ ...current, [field]: nextValue }));
  const toggleValue = (field, option) => {
    const selected = draft[field];
    updateDraft(field, selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  };
  const clearDraft = () => setDraft({ statuses: [], jenis: [], manufacturers: [], capacity: '' });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="filter-item-title">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5">
          <div><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-lg text-[#08729a]" aria-hidden="true">≡</span><h2 id="filter-item-title" className="text-xl font-bold text-slate-900">Filter items</h2></div><p className="mt-2 text-xs text-slate-500">Refine the inventory list using one or more filters.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close filter">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 flex items-center justify-between rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2.5"><span className="text-xs font-medium text-cyan-900">Active filters</span><span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#08729a]">{selectedCount}</span></div>
          <FilterSection title="Readiness status" description="Show items by current operational status."><select value={draft.statuses[0] || ''} onChange={(event) => updateDraft('statuses', event.target.value ? [event.target.value] : [])} className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-[#08729a] focus:bg-white focus:ring-4 focus:ring-[#08729a]/10"><option value="">All statuses</option>{options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></FilterSection>
          <FilterSection title="Equipment type" description="Select one or more equipment categories."><CheckboxList options={options.jenis} selected={draft.jenis} onToggle={(option) => toggleValue('jenis', option)} /></FilterSection>
          <FilterSection title="Manufacturer" description="Narrow the list by equipment manufacturer."><CheckboxList options={options.manufacturers} selected={draft.manufacturers} onToggle={(option) => toggleValue('manufacturers', option)} /></FilterSection>
          <FilterSection title="Capacity class" description="Optional; available when capacity data is configured."><div className="grid gap-2 sm:grid-cols-3">{capacityOptions.map((option) => <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${draft.capacity === option ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}><input type="radio" name="capacity" value={option} checked={draft.capacity === option} onChange={() => updateDraft('capacity', option)} className="h-3.5 w-3.5 accent-[#08729a]" />{option.replace('Kelas ', '')}</label>)}</div></FilterSection>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" onClick={() => { clearDraft(); onReset(); }} className="text-xs font-semibold text-slate-500 transition hover:text-slate-900">Clear all</button><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">Cancel</button><button type="button" onClick={() => onApply(draft, true)} className="rounded-lg bg-[#08729a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#075a7b]">Apply filters{selectedCount > 0 ? ` (${selectedCount})` : ''}</button></div></footer>
      </section>
    </div>
  );
}

function FilterSection({ title, description, children }) {
  return <section className="border-b border-slate-100 py-5 first:pt-0 last:border-0"><h3 className="text-sm font-bold text-slate-800">{title}</h3><p className="mt-1 text-[11px] text-slate-500">{description}</p><div className="mt-3">{children}</div></section>;
}

function CheckboxList({ options, selected, onToggle }) {
  if (options.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">No options available from the server.</p>;
  return <div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${selected.includes(option) ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}><input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} className={checkboxClass} />{option}</label>)}</div>;
}
