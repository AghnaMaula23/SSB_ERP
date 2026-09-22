const navigationItems = [
  { label: 'Items', icon: '📦', route: 'alat/items' },
  { label: 'Information', icon: '📋', route: 'alat/information' },
  { label: 'Maintenance', icon: '🛠️', route: 'alat/maintenance' },
  { label: 'Purchase Order', icon: '🛒' },
  { label: 'Kas', icon: '💳' },
];

function BrandMark() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white shadow-xs">
      ⚒
    </div>
  );
}

export default function AlatSidebar({ collapsed, mobileOpen = false, onToggle, onClose, onBackToModules, onSignOut, activeRoute = 'alat/items' }) {
  return (
    <>
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white shadow-sm transition-[width,transform] duration-300 lg:shadow-none ${
          mobileOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        <div className="flex h-16 items-center border-b border-slate-200 px-4">
          <button type="button" onClick={onBackToModules} className="flex items-center gap-3 text-left" title="Back to module selection">
            <BrandMark />
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold leading-none text-slate-900">Divisi Alat</h1>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resource System</p>
              </div>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3.5 top-20 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>

        <nav className="flex-1 px-3 py-4" aria-label="Equipment navigation">
          <ul className="space-y-1">
            {navigationItems.map((item) => {
              const isActive = item.route === activeRoute;
              return (
                <li key={item.label}>
                  <a
                    onClick={onClose}
                    href={`#/${item.route || 'alat/items'}`}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                      collapsed ? 'justify-center px-0' : 'gap-3'
                    } ${
                      isActive
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="text-base">{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onSignOut}
            className={`btn btn-ghost w-full justify-start text-xs font-semibold text-slate-600 ${
              collapsed ? 'px-0 justify-center' : ''
            }`}
            title="Sign Out"
          >
            <span className="text-base">↪</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

