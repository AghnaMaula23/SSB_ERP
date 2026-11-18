import { hasPermission } from '../../../services/permissions.js';
import { currentUserId } from '../../lapangan/utils/fieldFormat.js';

/**
 * Alasan panel keputusan dikunci — urutan sama dengan pengecekan backend:
 * status antrean, wewenang, dokumen sendiri, lalu pemisahan tugas Admin/Finance.
 */
export function blockedReasonFor({ status, expectedStatus = 'waiting_finance_approval', permission, ownId, adminId }) {
  const userId = currentUserId();
  if (status !== expectedStatus) return 'Dokumen ini sudah tidak di antrean Finance.';
  if (!hasPermission(permission)) return `Akun ini tidak memegang wewenang ${permission}.`;
  if (ownId && ownId === userId) return 'Dokumen ini Anda ajukan sendiri, jadi keputusannya milik orang lain.';
  if (adminId && adminId === userId) return 'Anda sudah memeriksanya sebagai Admin. Persetujuan Finance butuh orang kedua.';
  return '';
}

/** Rentang satu bulan (YYYY-MM) untuk filter tanggal. */
export function monthBounds(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(year, monthIndex, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

export const PR_LINE_LABEL = { repair: 'Perbaikan', maintenance: 'Servis Rutin', stock: 'Stok Gudang' };

/** Golongan akun COA. Saldo normal diturunkan dari jenis (sama dengan backend normalBalanceOf). */
export const ACCOUNT_TYPES = {
  asset: { label: 'Aset', normal: 'debit', prefix: '1' },
  liability: { label: 'Kewajiban', normal: 'kredit', prefix: '2' },
  equity: { label: 'Ekuitas', normal: 'kredit', prefix: '3' },
  revenue: { label: 'Pendapatan', normal: 'kredit', prefix: '4' },
  expense: { label: 'Beban', normal: 'debit', prefix: '5/6' },
};

/** Label `journal_source_type` — jurnal selalu lahir dari dokumen sumber (F2). */
export const JOURNAL_SOURCE = {
  income_record: 'Tagihan klien',
  income_payment: 'Pembayaran klien',
  equipment_income_claim: 'Klaim alat',
  material_request: 'Request material',
  field_expense_report: 'Kas lapangan',
  labor_payment_proof: 'Upah pekerja',
  payroll: 'Gaji karyawan',
  manual_expense: 'Pengeluaran manual',
  journal_adjustment: 'Penyesuaian',
  opening_balance: 'Saldo awal',
};

/** Tautan layar FE untuk dokumen sumber jurnal (null kalau belum ada layarnya). */
export const SOURCE_HREF = {
  income_record: (id) => `#/admin/income/${id}`,
  material_request: (id) => `#/finance/approvals/material/${id}`,
  field_expense_report: (id) => `#/finance/approvals/laporan/${id}`,
  labor_payment_proof: (id) => `#/finance/approvals/bukti/${id}`,
};
