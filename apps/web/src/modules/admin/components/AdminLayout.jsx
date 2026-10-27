import { useEffect, useState } from 'react';
import AppHeader from '../../../components/AppHeader.jsx';
import AppSidebar from '../../../components/AppSidebar.jsx';

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

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

/**
 * Kerangka Divisi Admin: header bersama, sidebar yang sama persis dengan
 * Divisi Alat, lalu panel sekunder (mis. pohon project) di sebelahnya.
 * Di layar kecil sidebar + panel digabung jadi satu drawer.
 */
export default function AdminLayout({ active = 'project', panel, panelTitle, onNavigate, onBackToModules, onSignOut, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin-sidebar-collapsed') === 'true');
  const user = readUser();
  const displayName = user.fullName || user.username || 'ERP User';
  const role = user.roles?.[0] || 'Authorized Personnel';

  // Di layar lg (1024–1279px) sidebar lebar + panel project (w-72) hanya
  // menyisakan ±480px untuk konten. Jadi bila ada panel, sidebar otomatis
  // jadi rail di bawah xl; preferensi user tetap dipakai mulai xl.
  const isXl = useMediaQuery('(min-width: 1280px)');
  const railCollapsed = collapsed || (Boolean(panel) && !isXl);

  // Navigasi dari dalam drawer selalu menutup drawer.
  const navigate = (route) => { setDrawerOpen(false); onNavigate(route); };

  const toggleCollapsed = () => setCollapsed((value) => {
    const next = !value;
    localStorage.setItem('admin-sidebar-collapsed', String(next));
    return next;
  });

  const activeKey = RAIL_ITEMS.find((item) => item.key === active)?.key || 'project';

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <AppHeader
        collapsed={railCollapsed}
        onToggleMenu={() => setDrawerOpen(true)}
        onBackToModules={onBackToModules}
        user={{ ...user, fullName: displayName, roles: user.roles?.length ? user.roles : [role] }}
      />

      <AppSidebar
        brand={BRAND}
        items={RAIL_ITEMS}
        activeKey={activeKey}
        collapsed={railCollapsed}
        onToggleCollapse={panel && !isXl ? undefined : toggleCollapsed}
        onNavigate={navigate}
        onBackToModules={onBackToModules}
        onSignOut={onSignOut}
        mobileOpen={drawerOpen}
        onCloseMobile={() => setDrawerOpen(false)}
        extraTitle={panelTitle}
        extraContent={drawerOpen ? panel : null}
      />

      {/* Panel sekunder (pohon project) tetap di samping sidebar pada desktop. */}
      {panel && (
        <aside
          className={`fixed bottom-0 top-16 z-20 hidden w-72 flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white transition-[left] duration-300 lg:flex ${railCollapsed ? 'left-20' : 'left-64'}`}
          aria-label={panelTitle}
        >
          {panel}
        </aside>
      )}

      {/* Padding kiri = lebar sidebar (+ lebar panel w-72 bila ada). */}
      <main className={`min-h-screen pt-16 transition-[padding] duration-300 ${
        panel
          ? (railCollapsed ? 'lg:pl-92' : 'lg:pl-136')
          : (railCollapsed ? 'lg:pl-20' : 'lg:pl-64')
      }`}>
        <div className="mx-auto w-full max-w-7xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
