// Status mengikuti enum project di backend; `active` ditampilkan sebagai
// "Operational" sesuai istilah di lapangan supply.
export const SUPPLY_STATUS = {
  planned: { label: 'Planned', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  active: { label: 'Operational', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  completed: { label: 'Selesai', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Kolom tabel rekap ritase. `toggle: false` = selalu tampil. Volume selalu
// diikuti satuan jenis materialnya (keputusan D1) — tidak ada satuan baku m³.
export const DELIVERY_COLUMNS = [
  { key: 'deliveryDate', label: 'Tanggal' },
  { key: 'deliveryNoteNo', label: 'No. Surat Jalan', toggle: false },
  { key: 'supplier', label: 'Supplier' },
  { key: 'vehicleType', label: 'Type Kendaraan' },
  { key: 'plateNumber', label: 'Nomor Polisi' },
  { key: 'driverName', label: 'Driver' },
  { key: 'material', label: 'Material' },
  { key: 'originLocation', label: 'Asal Muat' },
  { key: 'destinationLocation', label: 'Lokasi Bongkar' },
  { key: 'received', label: 'Penerimaan' },
  { key: 'volume', label: 'Volume', toggle: false },
];

/** Jumlahkan volume per satuan: [{ unit, volume }]. Satuan berbeda tidak dijumlahkan. */
export function totalsByUnit(rows) {
  const totals = new Map();
  rows.forEach((row) => totals.set(row.unit || '-', (totals.get(row.unit || '-') || 0) + (Number(row.volume) || 0)));
  return [...totals.entries()].map(([unit, volume]) => ({ unit, volume }));
}
