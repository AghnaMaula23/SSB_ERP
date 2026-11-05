import { formatCurrency } from '../../project/utils/projectFormat.js';
import { COMPONENTS, RATE_SOURCES, emptyLine, lineSubtotal } from '../utils/incomeFormat.js';

const UNIT_LABEL = { jam: 'Jam', m3: 'm³', m2: 'm²', ton: 'ton', unit: 'unit', hari: 'hari' };

/**
 * Daftar baris tagihan satu komponen (alat atau material): uraian,
 * kuantitas, tarif, dan subtotal. Tombol "Ambil dari …" mengisi baris dari
 * data modul lain; baris tetap bisa diubah atau ditambah manual.
 */
export default function LineItemsEditor({ component, rows, onChange, units = ['jam'], autofill, errors = {}, emptyText, readOnly = false }) {
  const meta = COMPONENTS[component];
  const total = rows.reduce((sum, row) => sum + lineSubtotal(row), 0);

  const updateRow = (key, patch) => onChange(rows.map((row) => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    // Tarif yang diubah dari tarif default alat dicatat sebagai override.
    if ('rateSnapshot' in patch && row.rateSource === 'equipment_default_rate') next.rateSource = 'manual_override';
    return next;
  }));

  return (
    <section aria-label={meta.label}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
          <span aria-hidden="true">{meta.icon}</span>{meta.label}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500">{rows.length} baris · {formatCurrency(total)}</span>
        </h3>
        {autofill && !readOnly && (
          <button type="button" onClick={autofill.onClick} disabled={autofill.busy || autofill.disabled} title={autofill.hint} className="btn btn-secondary px-3 py-1.5 text-[11px]">
            {autofill.busy ? 'Mengambil...' : `⟳ ${autofill.label}`}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem_10rem_9rem_2.5rem] gap-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
            <span>Uraian</span><span>Kuantitas</span><span>Tarif</span><span className="text-right">Subtotal</span><span />
          </div>
          {rows.map((row, index) => {
            const rowError = errors[row.key];
            return (
              <div key={row.key} className={`rounded-lg border p-2 ${rowError ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_8.5rem_10rem_9rem_2.5rem] md:items-center">
                  <div className="min-w-0">
                    <input
                      value={row.description}
                      onChange={(event) => updateRow(row.key, { description: event.target.value })}
                      readOnly={readOnly}
                      maxLength={200}
                      aria-label={`Uraian baris ${index + 1}`}
                      placeholder={component === 'equipment_income' ? 'Excavator Komatsu PC200' : 'Beton Ready Mix K-350'}
                      className="input-control bg-white text-sm"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                      readOnly={readOnly}
                      aria-label={`Kuantitas baris ${index + 1}`}
                      className="input-control bg-white pr-12 font-mono text-sm"
                      placeholder="0"
                    />
                    {units.length > 1 && !readOnly ? (
                      <select value={row.unit} onChange={(event) => updateRow(row.key, { unit: event.target.value })} aria-label="Satuan" className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded border-0 bg-transparent pr-1 text-xs text-slate-500 outline-none">
                        {units.map((unit) => <option key={unit} value={unit}>{UNIT_LABEL[unit] || unit}</option>)}
                      </select>
                    ) : (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{UNIT_LABEL[row.unit] || row.unit}</span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={row.rateSnapshot}
                      onChange={(event) => updateRow(row.key, { rateSnapshot: event.target.value })}
                      readOnly={readOnly}
                      aria-label={`Tarif baris ${index + 1}`}
                      className="input-control bg-white pl-9 font-mono text-sm"
                      placeholder="0"
                    />
                  </div>
                  <p className="text-right font-mono text-sm font-bold text-slate-900">{formatCurrency(lineSubtotal(row))}</p>
                  {!readOnly && (
                    <button type="button" onClick={() => onChange(rows.filter((item) => item.key !== row.key))} className="btn btn-ghost h-10 px-0 text-red-600 hover:bg-red-50" aria-label={`Hapus baris ${index + 1}`} title="Hapus baris">🗑</button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 px-1 text-[10px] text-slate-400">
                  <span>/{UNIT_LABEL[row.unit] || row.unit} · {RATE_SOURCES[row.rateSource]}</span>
                  {row.sourceRef && <span>Sumber: {row.sourceRef}</span>}
                  {rowError && <span className="font-semibold text-red-600">{rowError}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <button type="button" onClick={() => onChange([...rows, emptyLine(component, { unit: units[0] })])} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">
          ⊕ Tambah baris {component === 'equipment_income' ? 'alat' : 'material'}
        </button>
      )}
    </section>
  );
}
