const isId = (value) => /^\d+$/.test(value || '');

/**
 * Rute modul milik Divisi Lapangan (Project & Rental memakai rute halaman Admin):
 *   lapangan/material                               daftar request material
 *   lapangan/material/new                           form request material
 *   lapangan/material/:id                           detail + pengiriman
 *   lapangan/<material|alat|kas>/:id/edit           ubah pengajuan yang masih di antrean Admin
 *   lapangan/kas/laporan/:id/edit                   ubah laporan yang belum diputuskan Finance
 *   lapangan/material/:id/delivery/new              catat surat jalan
 *   lapangan/material/:id/delivery/:deliveryId/receipt  catat penerimaan
 *   lapangan/alat[/new|/:id]                        request alat internal
 *   lapangan/kas                                    daftar pengajuan dana
 *   lapangan/kas/new                                form pengajuan dana
 *   lapangan/kas/:id                                detail pengajuan
 *   lapangan/kas/:id/laporan/new                    laporan yang merujuk pengajuan
 *   lapangan/kas/laporan                            daftar laporan realisasi
 *   lapangan/kas/laporan/new                        laporan mendesak tanpa pengajuan
 *   lapangan/kas/laporan/:id                        detail laporan
 *   lapangan/upah[/new|/:id]                        klaim upah
 *   lapangan/upah/:id/bukti/new                     unggah bukti bayar
 * Balikan `{ section, view, id, childId }` atau null.
 */
export function parseFieldRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'lapangan') return null;
  const [, section, a, b, c, d] = parts;
  const size = parts.length - 1;
  const result = (view, id = null, childId = null) => ({ section, view, id: id && Number(id), childId: childId && Number(childId) });

  if (section === 'kas' && a === 'laporan') {
    if (size === 2) return result('report-list');
    if (size === 3 && b === 'new') return result('report-new');
    if (size === 3 && isId(b)) return result('report-detail', b);
    if (size === 4 && isId(b) && c === 'edit') return result('report-edit', b);
    return null;
  }
  if (!['material', 'alat', 'kas', 'upah'].includes(section)) return null;
  if (size === 1) return result('list');
  if (size === 2 && a === 'new') return result('new');
  if (!isId(a)) return null;
  if (size === 2) return result('detail', a);
  if (size === 3 && b === 'edit' && section !== 'upah') return result('edit', a);

  if (section === 'material' && b === 'delivery') {
    if (size === 4 && c === 'new') return result('delivery-new', a);
    if (size === 5 && isId(c) && d === 'receipt') return result('receipt-new', a, c);
  }
  if (section === 'kas' && size === 4 && b === 'laporan' && c === 'new') return result('report-from-request', a);
  if (section === 'upah' && size === 4 && b === 'bukti' && c === 'new') return result('proof-new', a);
  return null;
}
