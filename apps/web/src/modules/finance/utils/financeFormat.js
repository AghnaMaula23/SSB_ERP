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
