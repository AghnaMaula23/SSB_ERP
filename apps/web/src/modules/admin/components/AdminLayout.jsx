import DivisionLayout from '../../../components/DivisionLayout.jsx';

// Menu utama Divisi Admin. Item tanpa `route` ditampilkan nonaktif ("Soon")
// supaya peta modulnya terlihat tanpa menjanjikan fitur.
const RAIL_ITEMS = [
  { key: 'project', label: 'Project', icon: '🏗️', route: 'admin/projects' },
  { key: 'supply', label: 'Supply', icon: '🚚', route: 'admin/supply' },
  { key: 'rental', label: 'Rental', icon: '🛠️', route: 'admin/rental' },
  { key: 'income', label: 'Income', icon: '📊', route: 'admin/income' },
  { key: 'approvals', label: 'Approvals', icon: '✅', route: 'admin/approvals' },
  { key: 'files', label: 'Files', icon: '📁', route: 'admin/files' },
];

const BRAND = { title: 'Divisi Admin', subtitle: 'Admin Workspace' };

export default function AdminLayout({ active = 'project', ...props }) {
  return <DivisionLayout items={RAIL_ITEMS} brand={BRAND} storageKey="admin-sidebar-collapsed" active={active} {...props} />;
}
