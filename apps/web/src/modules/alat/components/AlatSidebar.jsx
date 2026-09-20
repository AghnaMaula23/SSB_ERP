const navigationItems = [
  { label: 'Items', icon: '▣', route: 'alat/items' },
  { label: 'Information', icon: 'ⓘ', route: 'alat/information' },
  { label: 'Maintenance', icon: '◌' },
  { label: 'Purchase Order', icon: '🛒' },
  { label: 'Kas', icon: '▤' },
];

function BrandMark() {
  return <span className="grid h-7 w-7 place-items-center rounded-sm bg-[#08729a] text-sm font-bold text-white">⚒</span>;
}

export default function AlatSidebar({ collapsed, mobileOpen = false, onToggle, onClose, onBackToModules, onSignOut, activeRoute = 'alat/items' }) {
  return (
    <>
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex-col border-r border-[#cbd5e1] bg-[#f2f6fb] shadow-xl transition-[width,transform] duration-200 lg:shadow-none ${mobileOpen ? 'flex w-64' : 'hidden'} lg:flex ${collapsed ? 'lg:w-16' : 'lg:w-40'}`}>
      <div className="border-b border-[#cbd5e1] px-2.5 py-2.5">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
          <button type="button" onClick={onBackToModules} className="shrink-0" aria-label="Back to module selection" title="Back to module selection"><BrandMark /></button>
          {!collapsed && <div>
            <h1 className="text-[13px] font-bold leading-none text-[#1e293b]">Divisi Alat</h1>
            <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.1em] text-[#64748b]">Resource Management</p>
          </div>}
        </div>
      </div>

      <button type="button" onClick={onToggle} className="absolute -right-3 top-12 hidden h-6 w-6 place-items-center rounded-full border border-[#cbd5e1] bg-white text-xs font-bold text-[#475569] shadow-sm transition hover:text-[#08729a] lg:grid" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? '›' : '‹'}</button>

      <nav className="flex-1 px-1 py-3" aria-label="Equipment navigation">
        <ul className="space-y-1">
          {navigationItems.map((item) => (
            <li key={item.label}>
              <a
                onClick={onClose}
                href={`#/${item.route || 'alat/items'}`}
                className={`flex items-center border-l-2 py-1.5 text-[10px] font-semibold transition ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-2'} ${item.route === activeRoute ? 'border-[#08729a] bg-[#e2e8f0] text-[#00688f]' : 'border-transparent text-[#475569] hover:bg-[#e8eef5] hover:text-[#0f6688]'}`}
                title={collapsed ? item.label : undefined}
                aria-current={item.route === activeRoute ? 'page' : undefined}
              >
                <span className="w-4 text-center text-sm leading-none" aria-hidden="true">{item.icon}</span>
                {!collapsed && item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={`${collapsed ? 'grid-cols-1' : 'grid-cols-2'} grid border-t border-[#cbd5e1] px-1.5 py-2 text-center`}>
        <a href="#support" className="rounded px-2 py-2 text-[9px] font-semibold text-[#475569] hover:bg-[#e8eef5]" title="Support">
          <span className="mb-1 block text-sm">?</span>
          {!collapsed && 'Support'}
        </a>
        <button type="button" onClick={onSignOut} className={`${collapsed ? 'hidden' : ''} rounded px-2 py-2 text-[9px] font-semibold text-[#475569] hover:bg-[#e8eef5]`} title="Sign out">
          <span className="mb-1 block text-sm">↪</span>
          Sign Out
        </button>
      </div>
      </aside>
    </>
  );
}
