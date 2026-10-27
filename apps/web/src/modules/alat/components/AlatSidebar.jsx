import AppSidebar from '../../../components/AppSidebar.jsx';

const navigationItems = [
  { key: 'items', label: 'Items', icon: '📦', route: 'alat/items' },
  { key: 'information', label: 'Information', icon: '📋', route: 'alat/information' },
  { key: 'maintenance', label: 'Maintenance', icon: '🛠️', route: 'alat/maintenance' },
  { key: 'purchase-orders', label: 'Purchase Order', icon: '🛒', route: 'alat/purchase-orders' },
  { key: 'kas', label: 'Kas', icon: '💳', route: 'alat/kas' },
];

const BRAND = { title: 'Divisi Alat', subtitle: 'Resource System' };

export default function AlatSidebar({
  collapsed,
  mobileOpen = false,
  onToggle,
  onClose,
  onBackToModules,
  onSignOut,
  activeRoute = 'alat/items',
}) {
  const activeKey = navigationItems.find((item) => item.route === activeRoute)?.key
    || navigationItems.find((item) => activeRoute.startsWith(item.route))?.key
    || 'items';

  return (
    <AppSidebar
      brand={BRAND}
      items={navigationItems}
      activeKey={activeKey}
      collapsed={collapsed}
      onToggleCollapse={onToggle}
      onNavigate={(route) => { window.location.hash = `/${route}`; onClose?.(); }}
      onBackToModules={onBackToModules}
      onSignOut={onSignOut}
      mobileOpen={mobileOpen}
      onCloseMobile={onClose}
    />
  );
}
