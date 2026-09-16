const statusOptions = [
  { value: 'available', label: 'Tersedia' },
  { value: 'assigned_to_location', label: 'Tidak Tersedia' },
  { value: 'maintenance', label: 'On Deliver' },
];

export default function ItemInfoForm({ item, form, saving, error, onChange, onSubmit }) {
  return (
    <section className="border border-[#cbd5e1] bg-white" aria-labelledby="item-information-title">
      <div className="flex items-center gap-2 border-b border-[#cbd5e1] px-4 py-3 text-xs font-semibold text-[#334155]">
        <span className="text-sm text-[#08729a]" aria-hidden="true">ⓘ</span>
        <h2 id="item-information-title">Informasi Item</h2>
      </div>
      <form onSubmit={onSubmit} className="p-4">
        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</div>}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Item Code" name="itemCode" value={item.itemCode} disabled />
          <Field label="Jenis" name="jenis" value={form.jenis} onChange={onChange} />
          <Field label="Merk" name="merk" value={form.merk} onChange={onChange} />
          <Field label="Model" name="model" value={form.model} onChange={onChange} />
          <Field label="Lokasi" name="lokasi" value={form.lokasi} onChange={onChange} />
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#475569]">
            Status
            <select name="status" value={form.status} onChange={onChange} className="mt-1.5 h-9 w-full rounded border border-[#cbd5e1] bg-white px-2 text-xs font-normal normal-case tracking-normal text-[#334155] outline-none focus:border-[#08729a] focus:ring-2 focus:ring-[#08729a]/10">
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded bg-[#08729a] px-3 py-2 text-[10px] font-bold text-white transition hover:bg-[#075a7b] disabled:cursor-not-allowed disabled:opacity-60"><span aria-hidden="true">▣</span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</button>
      </form>
    </section>
  );
}

function Field({ label, name, value, onChange, disabled = false }) {
  return <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#475569]">{label}<input name={name} value={value || ''} onChange={onChange} disabled={disabled} className="mt-1.5 h-9 w-full rounded border border-[#cbd5e1] bg-white px-2 text-xs font-normal normal-case tracking-normal text-[#334155] outline-none placeholder:text-[#94a3b8] focus:border-[#08729a] focus:ring-2 focus:ring-[#08729a]/10 disabled:bg-[#eef3f8]" /></label>;
}
