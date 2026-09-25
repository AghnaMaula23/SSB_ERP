import { EQUIPMENT_STATUS_OPTIONS } from '../services/alatService.js';

export default function ItemInfoForm({ item, form, equipmentTypes = [], saving, error, readOnly = false, onChange, onSubmit }) {
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

          <div>
            <label htmlFor="equipmentTypeId" className="block text-xs font-semibold text-slate-600">Jenis / Category</label>
            <select
              id="equipmentTypeId"
              name="equipmentTypeId"
              value={form.equipmentTypeId || ''}
              onChange={onChange}
              disabled={readOnly}
              className="input-control mt-1 text-xs"
            >
              <option value="">Select Jenis / Category</option>
              {equipmentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.typeName}
                </option>
              ))}
            </select>
          </div>

          <Field label="Merk / Brand" name="merk" value={form.merk} onChange={onChange} disabled={readOnly} />
          <Field label="Model / Type" name="model" value={form.model} onChange={onChange} disabled={readOnly} />

          <div>
            <label htmlFor="status" className="block text-xs font-semibold text-slate-600">Status</label>
            <select id="status" name="status" value={form.status} onChange={onChange} disabled={readOnly} className="input-control mt-1 text-xs">
              {EQUIPMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saving || readOnly} className="btn btn-primary py-2 px-4 text-xs font-semibold">
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
