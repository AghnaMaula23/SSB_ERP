// Jenis mutasi stok material (enum backend material_stock_movements.movement_type).
// Stok masuk dari pengiriman TIDAK di sini — itu penerimaan (material-receipts).
export const MOVEMENT_TYPES = {
  used: {
    label: 'Pemakaian',
    hint: 'Material terpakai di lapangan',
    icon: '⬆',
    sign: -1,
    needsNotes: false,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  adjustment_in: {
    label: 'Koreksi Masuk',
    hint: 'Opname lebih / sisa sebelum sistem dipakai',
    icon: '＋',
    sign: 1,
    needsNotes: true,
    className: 'bg-leaf-50 text-leaf-700 border-leaf-200',
  },
  adjustment_out: {
    label: 'Koreksi Keluar',
    hint: 'Opname kurang / rusak / hilang',
    icon: '−',
    sign: -1,
    needsNotes: true,
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};
