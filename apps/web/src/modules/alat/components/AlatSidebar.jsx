import { useEffect } from 'react';

const navigationItems = [
  { label: 'Items', icon: '📦', route: 'alat/items' },
  { label: 'Information', icon: '📋', route: 'alat/information' },
  { label: 'Maintenance', icon: '🛠️', route: 'alat/maintenance' },
  { label: 'Purchase Order', icon: '🛒', route: 'alat/purchase-orders' },
  { label: 'Kas', icon: '💳', route: 'alat/kas' },
];

function BrandMark() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-lg font-bold text-white shadow-xs">
      ⚒
    </div>
  );
}

/**
 * `collapsed` hanya berlaku di desktop (lg). Di mobile sidebar tampil sebagai
 * drawer yang selalu lengkap dengan label, apa pun state collapsed desktop.
 */
export default function AlatSidebar({ collapsed, mobileOpen = false, onToggle, onClose, onBackToModules, onSignOut, activeRoute = 'alat/items' }) {
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    // Halaman di belakang drawer tidak ikut ter-scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobileOpen, onClose]);

  const desktopHidden = collapsed ? 'lg:hidden' : '';

  return (
    <>
      {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl transition-[width,transform] duration-300 lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
        aria-label="Navigasi Divisi Alat"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4">
          <button type="button" onClick={onBackToModules} className="flex min-w-0 items-center gap-3 text-left" title="Back to module selection">
            <BrandMark />
            <div className={`min-w-0 ${desktopHidden}`}>
              <h1 className="truncate text-sm font-bold leading-none text-slate-900">Divisi Alat</h1>
              <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resource System</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
            aria-label="Tutup navigasi"
          >
            ✕
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

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Equipment navigation">
          <ul className="space-y-1">
            {navigationItems.map((item) => {
              const isActive = item.route === activeRoute;
              return (
                <li key={item.label}>
                  <a
                    onClick={onClose}
                    href={`#/${item.route || 'alat/items'}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:py-2 ${
                      collapsed ? 'lg:justify-center lg:gap-0 lg:px-0' : ''
                    } ${
                      isActive
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className={desktopHidden}>{item.label}</span>
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
              collapsed ? 'lg:justify-center lg:px-0' : ''
            }`}
            title="Sign Out"
          >
            <span className="text-base">↪</span>
            <span className={desktopHidden}>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
