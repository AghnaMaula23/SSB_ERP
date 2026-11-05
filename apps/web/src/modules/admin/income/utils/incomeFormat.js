// Enum mengikuti kontrak Swagger POST /api/income/records (modul Income belum
// dibangun di backend). Jangan menambah nilai di luar kontrak itu.

export const SOURCES = {
  construction_project: { label: 'Sub-Kontraktor', short: 'Proyek', icon: '🏗️', partyLabel: 'Proyek Utama' },
  external_rental: { label: 'Rental', short: 'Rental', icon: '🛠️', partyLabel: 'Penyewa' },
  external_supply: { label: 'Supply', short: 'Supply', icon: '🚚', partyLabel: 'Pembeli' },
};

// Segmen URL ↔ projectSourceType.
export const SOURCE_SLUGS = { construction: 'construction_project', rental: 'external_rental', supply: 'external_supply' };
export const slugOf = (sourceType) => Object.keys(SOURCE_SLUGS).find((slug) => SOURCE_SLUGS[slug] === sourceType);

export const COMPONENTS = {
  contract_progress_income: { label: 'Progress Kontrak', sourceType: 'contract_progress', icon: '📈' },
  equipment_income: { label: 'Alat Berat / Item', sourceType: 'equipment_workhour_log', icon: '🛠️' },
  material_income: { label: 'Material / Suplai', sourceType: 'material_receipt_item', icon: '🧱' },
};

export const RATE_SOURCES = {
  manual_input: 'Input manual',
  equipment_default_rate: 'Tarif default alat',
  manual_override: 'Tarif diubah manual',
  contract_reference: 'Acuan kontrak',
};

export const INCOME_STATUS = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  submitted: { label: 'Menunggu Finance', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Terverifikasi', className: 'bg-leaf-50 text-leaf-700 border-leaf-200' },
  partially_paid: { label: 'Dibayar Sebagian', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  paid: { label: 'Lunas', className: 'bg-brand-50 text-brand-700 border-brand-200' },
  rejected: { label: 'Ditolak Finance', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Tarif contoh untuk mengisi awal baris. SELALU bisa diubah; sumber tarifnya
// tercatat di rateSource supaya Finance tahu angka mana yang diubah manual.
const HOURLY_RATE_BY_TYPE = [
  [/excavator/i, 450000],
  [/buldoser|bulldozer|dozer/i, 500000],
  [/dump\s*truck|truck/i, 250000],
  [/roller|vibro|compactor/i, 350000],
  [/grader/i, 475000],
];
export const suggestHourlyRate = (typeName) => HOURLY_RATE_BY_TYPE.find(([pattern]) => pattern.test(typeName || ''))?.[1] || 400000;

const MATERIAL_PRICE = [
  [/base\s*a/i, 285000],
  [/base\s*b|sub-base/i, 245000],
  [/split/i, 310000],
  [/pasir\s*cuci|sand/i, 230000],
  [/pasir\s*urug/i, 165000],
  [/tanah/i, 95000],
  [/beton|ready\s*mix/i, 1150000],
];
export const suggestMaterialPrice = (material) => MATERIAL_PRICE.find(([pattern]) => pattern.test(material || ''))?.[1] || 250000;

export const lineSubtotal = (row) => Math.round((Number(row.quantity) || 0) * (Number(row.rateSnapshot) || 0));

export const emptyLine = (component, patch = {}) => ({
  key: `${component}-${Math.random().toString(36).slice(2, 9)}`,
  incomeComponentType: component,
  description: '',
  quantity: '',
  unit: component === 'equipment_income' ? 'jam' : component === 'material_income' ? 'm3' : '%',
  rateSnapshot: '',
  rateSource: 'manual_input',
  ...patch,
});
