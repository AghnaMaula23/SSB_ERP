import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Single control that merges search + selection: satu input untuk mencari,
 * dropdown berisi hasil yang bisa dipilih. Dipakai di form damage log,
 * purchase order, dan halaman lain yang butuh equipment/reference picker.
 */
export default function ComboboxSelect({
  id,
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Ketik untuk mencari...',
  emptyText = 'Data tidak ditemukan.',
  disabled = false,
  required = false,
  hint,
  invalid = false,
  maxSuggestions = 8,
  lockedNote,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(() => options.find((option) => String(option.value) === String(value)) || null, [options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = options.filter((option) => String(option.value) !== String(value));
    if (!term) return pool.slice(0, maxSuggestions);
    return pool
      .filter((option) => [option.label, option.meta, ...(option.keywords || [])].filter(Boolean).join(' ').toLowerCase().includes(term))
      .slice(0, maxSuggestions);
  }, [maxSuggestions, options, query, value]);

  const handleSelect = (option) => {
    onChange(String(option.value));
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'Enter' && open && suggestions.length > 0) { event.preventDefault(); handleSelect(suggestions[0]); }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          autoComplete="off"
          value={!open && selected ? selected.label : query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className={`input-control pl-8 pr-9 text-sm ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''} ${invalid ? 'border-red-300' : ''}`}
        />
        {selected && !open && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600">✓</span>}
      </div>
      {open && !disabled && (
        <ul id={`${id}-listbox`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.length > 0 ? suggestions.map((option) => (
            <li key={option.value} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-teal-50"
              >
                <span className="truncate font-semibold text-slate-900">{option.label}</span>
                {option.meta && <span className="shrink-0 truncate text-[11px] text-slate-500">{option.meta}</span>}
              </button>
            </li>
          )) : <li className="px-3 py-3 text-center text-xs text-slate-500">{emptyText}</li>}
        </ul>
      )}
      {(hint || lockedNote) && <p className="mt-1 text-[11px] text-slate-400">{lockedNote || hint}</p>}
    </div>
  );
}
