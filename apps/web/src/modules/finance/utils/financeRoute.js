const isId = (value) => /^\d+$/.test(value || '');

/** Antrean tahap Finance di /api/approval-queue, urut sesuai alur uang. */
export const FINANCE_TABS = [
  { key: 'pr', label: 'PO Divisi Alat', icon: '🔧', sourceType: 'purchase_request', permission: 'purchase-request:approve' },
  { key: 'material', label: 'Request Material', icon: '🧱', sourceType: 'material_request', permission: 'material-request:approve' },
  { key: 'kas', label: 'Pengajuan Dana', icon: '💵', sourceType: 'field_operational_request', permission: 'field-cash:approve' },
  { key: 'laporan', label: 'Laporan Realisasi', icon: '🧾', sourceType: 'field_expense_report', permission: 'field-cash:approve' },
  { key: 'upah', label: 'Klaim Upah', icon: '👷', sourceType: 'labor_wage_claim', permission: 'labor-claim:approve' },
  { key: 'bukti', label: 'Bukti Bayar Upah', icon: '🏦', sourceType: 'labor_payment_proof', permission: 'labor-claim:approve' },
];

const TAB_KEYS = FINANCE_TABS.map((tab) => tab.key);

/**
 * Rute Divisi Finance:
 *   finance/approvals[/:tab]       antrean keputusan Finance (default tab pr)
 *   finance/approvals/:tab/:id     periksa & putuskan satu dokumen
 *   finance/upah                   rekap upah harian pekerja / mandor (+ gaji staf: belum ada backend)
 *   finance/kas-alat               buku kas Divisi Alat (baca saja)
 * Balikan `{ section, tab, recordId }` atau null.
 */
export function parseFinanceRoute(route) {
  const parts = String(route).split('/');
  if (parts[0] !== 'finance') return null;
  const [, section, tab, id, ...extra] = parts;
  if (extra.length) return null;
  if ((section === 'upah' || section === 'kas-alat') && parts.length === 2) return { section, tab: null, recordId: null };
  if (section !== 'approvals') return null;
  if (!tab) return { section, tab: 'pr', recordId: null };
  if (!TAB_KEYS.includes(tab)) return null;
  if (!id) return { section, tab, recordId: null };
  return isId(id) ? { section, tab, recordId: Number(id) } : null;
}

/** Rute layar periksa satu baris antrean. */
export function financeDetailHref(row) {
  const tab = FINANCE_TABS.find((entry) => entry.sourceType === row.sourceType);
  return tab ? `#/finance/approvals/${tab.key}/${row.sourceId}` : null;
}
