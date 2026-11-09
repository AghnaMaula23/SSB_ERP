import DivisionLayout from '../../../components/DivisionLayout.jsx';
import { Notice } from '../../admin/project/components/ProjectUi.jsx';
import { hasPermission } from '../../../services/permissions.js';
import { FINANCE_TABS } from '../utils/financeRoute.js';

// Menu Divisi Finance. Item tanpa `route` = backend belum ada (Payroll Karyawan,
// Finance Accounting, Income): tampil "Soon", tanpa data contoh (backlog E21/E27).
const RAIL_ITEMS = [
  { key: 'approvals', label: 'Approvals', icon: '✅', route: 'finance/approvals' },
  { key: 'upah', label: 'Gaji & Upah', icon: '👷', route: 'finance/upah' },
  { key: 'kas-alat', label: 'Buku Kas Alat', icon: '📒', route: 'finance/kas-alat' },
  { key: 'coa', label: 'Chart of Accounts', icon: '🗂️' },
  { key: 'gl', label: 'General Ledger', icon: '📚' },
  { key: 'pendapatan', label: 'Verifikasi Pendapatan', icon: '💰' },
];

const BRAND = { title: 'Divisi Finance', subtitle: 'Finance Workspace' };

export default function FinanceLayout({ active = 'approvals', children, ...props }) {
  const canDecide = FINANCE_TABS.some((tab) => hasPermission(tab.permission));
  return (
    <DivisionLayout items={RAIL_ITEMS} brand={BRAND} storageKey="finance-sidebar-collapsed" active={active} {...props}>
      {!canDecide && <Notice tone="warning">Akun ini hanya bisa melihat data Finance. Keputusan approve, tolak, dan validasi milik akun role Finance.</Notice>}
      {children}
    </DivisionLayout>
  );
}
