import DivisionLayout from '../../../components/DivisionLayout.jsx';

// Menu utama Divisi Lapangan. Project & Rental memakai halaman yang sama dengan
// Admin (tombolnya disaring per permission); sisanya milik modul ini.
const RAIL_ITEMS = [
  { key: 'project', label: 'Project', icon: '🏗️', route: 'lapangan/projects' },
  { key: 'rental', label: 'Rental', icon: '🛠️', route: 'lapangan/rental' },
  { key: 'material', label: 'Request Material', icon: '🧱', route: 'lapangan/material' },
  { key: 'alat', label: 'Request Alat', icon: '🚜', route: 'lapangan/alat' },
  { key: 'kas', label: 'Kas Lapangan', icon: '💵', route: 'lapangan/kas' },
  { key: 'upah', label: 'Upah Pekerja', icon: '👷', route: 'lapangan/upah' },
];

const BRAND = { title: 'Divisi Lapangan', subtitle: 'Field Workspace' };

export default function FieldLayout({ active = 'project', ...props }) {
  return <DivisionLayout items={RAIL_ITEMS} brand={BRAND} storageKey="lapangan-sidebar-collapsed" active={active} {...props} />;
}
