import { useState } from 'react';
import { equipmentStatusLabel } from '../services/alatService.js';

const capacityOptions = ['Kelas 10 Ton', 'Kelas 20 Ton', 'Kelas >20 Ton'];

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
    <div
      className="modal-overlay justify-end p-0 sm:p-0"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal-content h-full max-w-md rounded-none border-y-0 border-r-0 shadow-2xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="filter-item-title">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold">
              ⚙️
            </div>
            <div>
              <h2 id="filter-item-title" className="text-base font-bold text-slate-900">Filter Inventory</h2>
              <p className="text-xs text-slate-500">Refine the inventory list using criteria.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600"
            aria-label="Close filter"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between rounded-lg bg-slate-100 p-3 text-xs font-semibold text-slate-700">
            <span>Active Filters Selected</span>
            <span className="rounded-full bg-teal-700 px-2 py-0.5 text-white font-mono text-[11px]">{selectedCount}</span>
          </div>

          <FilterSection title="Operational Status" description="Filter items by current readiness.">
            <select
              value={draft.statuses[0] || ''}
              onChange={(event) => updateDraft('statuses', event.target.value ? [event.target.value] : [])}
              className="input-control text-xs"
            >
              <option value="">All Statuses</option>
              {options.statuses.map((status) => <option key={status} value={status}>{equipmentStatusLabel(status)}</option>)}
            </select>
          </FilterSection>

          <FilterSection title="Equipment Category" description="Select one or more equipment categories.">
            <CheckboxList options={options.jenis} selected={draft.jenis} onToggle={(option) => toggleValue('jenis', option)} />
          </FilterSection>

          <FilterSection title="Manufacturer" description="Narrow list by equipment brand.">
            <CheckboxList options={options.manufacturers} selected={draft.manufacturers} onToggle={(option) => toggleValue('manufacturers', option)} />
          </FilterSection>

          <FilterSection title="Capacity Class" description="Filter by operational weight capacity.">
            <div className="grid gap-2 sm:grid-cols-3">
              {capacityOptions.map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    draft.capacity === option
                      ? 'border-teal-500 bg-teal-50 text-teal-800 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="capacity"
                    value={option}
                    checked={draft.capacity === option}
                    onChange={() => updateDraft('capacity', option)}
                    className="accent-teal-700"
                  />
                  <span>{option.replace('Kelas ', '')}</span>
                </label>
              ))}
            </div>
          </FilterSection>
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => { clearDraft(); onReset(); }}
            className="btn btn-ghost text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            Clear All
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary text-xs">
              Cancel
            </button>
            <button type="button" onClick={() => onApply(draft, true)} className="btn btn-primary text-xs">
              Apply Filters {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FilterSection({ title, description, children }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
      <p className="text-xs text-slate-500">{description}</p>
      <div className="pt-1">{children}</div>
    </div>
  );
}

function CheckboxList({ options, selected, onToggle }) {
  if (options.length === 0) return <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">No options available.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
            selected.includes(option)
              ? 'border-teal-500 bg-teal-50 text-teal-800 font-semibold'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
            className="rounded border-slate-300 accent-teal-700"
          />
          <span className="truncate">{option}</span>
        </label>
      ))}
    </div>
  );
}

