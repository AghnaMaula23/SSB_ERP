const statusOptions = [
  { value: 'available', label: 'Tersedia (Available)' },
  { value: 'assigned_to_location', label: 'Tidak Tersedia (Assigned)' },
  { value: 'maintenance', label: 'Dalam Maintenance' },
];

export default function ItemInfoForm({ item, form, saving, error, onChange, onSubmit }) {
  return (
    <section className="card-panel" aria-labelledby="item-information-title">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold">
          ⓘ
        </div>
        <h2 id="item-information-title" className="text-base font-bold text-slate-900">Equipment Specifications</h2>
      </div>

      <form onSubmit={onSubmit} className="p-6">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Item Code" name="itemCode" value={item.itemCode} disabled />
          <Field label="Jenis / Category" name="jenis" value={form.jenis} onChange={onChange} />
          <Field label="Merk / Brand" name="merk" value={form.merk} onChange={onChange} />
          <Field label="Model / Type" name="model" value={form.model} onChange={onChange} />
          <Field label="Lokasi / Site" name="lokasi" value={form.lokasi} onChange={onChange} />
          
          <div>
            <label htmlFor="status" className="block text-xs font-semibold text-slate-600">Status</label>
            <select id="status" name="status" value={form.status} onChange={onChange} className="input-control mt-1 text-xs">
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saving} className="btn btn-primary py-2 px-4 text-xs font-semibold">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, name, value, onChange, disabled = false }) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-semibold text-slate-600">{label}</label>
      <input
        id={name}
        name={name}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className={`input-control mt-1 text-xs ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}

