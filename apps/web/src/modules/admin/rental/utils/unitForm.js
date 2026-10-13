// Nilai awal & validasi isian unit sewa (dipakai form Transaksi Baru dan Unit Baru).

export const emptyUnitForm = (defaults = {}) => ({
  periodStart: defaults.periodStart || '',
  periodEnd: defaults.periodEnd || '',
  operator: '',
  equipmentTypeId: '',
  typeName: '',
  brand: '',
  model: '',
  quantity: '1',
  packet: 'include_solar',
  estimatedWorkhours: '',
  extra: '',
});

/** Validasi bersama form unit. `optional` = seluruh bagian boleh kosong. */
export function validateUnitForm(form, { optional = false } = {}) {
  const errors = {};
  if (optional && !form.equipmentTypeId) return errors;
  if (!form.equipmentTypeId) errors.equipmentTypeId = 'Pilih jenis alat.';
  if (!(Number(form.quantity) >= 1 && Number(form.quantity) <= 100)) errors.quantity = 'Jumlah unit 1-100.';
  if (form.periodStart && form.periodEnd && form.periodStart > form.periodEnd) errors.periodEnd = 'Periode akhir tidak boleh sebelum periode mulai.';
  if (form.estimatedWorkhours !== '' && Number(form.estimatedWorkhours) < 0) errors.estimatedWorkhours = 'Estimasi jam tidak boleh negatif.';
  return errors;
}
