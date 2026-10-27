import { useEffect } from 'react';

/**
 * Sidebar bersama untuk semua divisi. Satu sumber kebenaran untuk blok brand,
 * daftar menu, status aktif, dan footer (Modules / Sign Out) — dipakai
 * Divisi Alat maupun Divisi Admin supaya tampilannya identik.
 *
 * - Desktop: sidebar lebar (w-64) yang bisa dikecilkan jadi rail (w-20).
 * - Mobile: drawer off-canvas dengan header brand, area isi yang bisa
 *   digulir, dan footer yang menempel di bawah (aman untuk layar iPhone
 *   dengan notch / home indicator).
 *
 * Status `collapsed` HANYA berlaku untuk sidebar desktop. Drawer mobile selalu
 * menampilkan label lengkap — kalau tidak, preferensi rail yang tersimpan di
 * localStorage membuat drawer mobile tampil tanpa teks.
 */
export default function AppSidebar({
  brand,
  items = [],
  activeKey,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  onBackToModules,
  onSignOut,
  mobileOpen = false,
  onCloseMobile,
  extraContent,
  extraTitle,
}) {
  // Drawer terbuka: kunci scroll halaman di belakang + tutup dengan Escape.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onCloseMobile?.(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobileOpen, onCloseMobile]);

  // Drawer hanya ada di bawah lg. Kalau layar membesar ke lg saat drawer
  // terbuka (rotasi tablet, resize jendela, DevTools), drawer tersembunyi tapi
  // kunci scroll di atas tetap aktif — halaman jadi tidak bisa di-scroll.
  // Jadi tutup drawer begitu breakpoint lg tercapai.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) onCloseMobile?.(); };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [mobileOpen, onCloseMobile]);

  const renderNav = (compact) => (
    <ul className="space-y-1">
      {items.map((item) => {
        const isEnabled = Boolean(item.route);
        const isActive = item.key === activeKey;
        return (
          <li key={item.key}>
            <button
              type="button"
              disabled={!isEnabled}
              onClick={() => isEnabled && onNavigate(item.route)}
              className={`flex h-11 w-full items-center rounded-lg text-sm font-medium transition ${
                compact ? 'justify-center px-0' : 'gap-3 px-3'
              } ${
                isActive
                  ? 'bg-brand-50 font-semibold text-brand-800 ring-1 ring-inset ring-brand-100'
                  : isEnabled
                    ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    : 'cursor-not-allowed text-slate-400'
              }`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={compact ? item.label : undefined}
              title={compact ? item.label : isEnabled ? undefined : `${item.label} — segera hadir`}
            >
              <span className="flex w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden="true">{item.icon}</span>
              {!compact && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
              {!isEnabled && !compact && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400">Soon</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderBrand = (compact) => (
    <button
      type="button"
      onClick={onBackToModules}
      className={`flex min-w-0 items-center gap-3 text-left ${compact ? 'mx-auto' : 'flex-1'}`}
      title="Kembali ke pilihan divisi"
    >
      <img src="/logo-ssb.png" alt="" aria-hidden="true" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-slate-200" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight text-slate-900">{brand.title}</span>
          <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{brand.subtitle}</span>
        </span>
      )}
    </button>
  );

  const renderFooter = (compact) => (
    <div className="space-y-1 border-t border-slate-200 p-3">
      {[
        { label: 'Modules', icon: '▦', onClick: onBackToModules, title: 'Kembali ke pilihan divisi' },
        { label: 'Sign Out', icon: '↪', onClick: onSignOut, title: 'Sign Out' },
      ].map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={`flex h-10 w-full items-center rounded-lg text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${
            compact ? 'justify-center px-0' : 'gap-3 px-3'
          }`}
          aria-label={compact ? action.label : undefined}
          title={action.title}
        >
          <span className="flex w-6 shrink-0 items-center justify-center text-base leading-none" aria-hidden="true">{action.icon}</span>
          {!compact && <span className="truncate">{action.label}</span>}
        </button>
      ))}
    </div>
  );

  const renderExtra = () => extraContent && (
    <div className="mt-4 border-t border-slate-200 pt-4">
      {extraTitle && <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{extraTitle}</p>}
      {extraContent}
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          onClick={onCloseMobile}
          aria-label="Tutup navigasi"
        />
      )}

      {/* Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-300 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-slate-200 ${collapsed ? 'px-2' : 'px-4'}`}>
          {renderBrand(collapsed)}
        </div>
        {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="absolute -right-3.5 top-19 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold leading-none text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
        )}
        <nav className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Navigasi divisi">
          {renderNav(collapsed)}
          {!collapsed && renderExtra()}
        </nav>
        {renderFooter(collapsed)}
      </aside>

      {/* Mobile — selalu mode lengkap (berlabel), tidak terpengaruh `collapsed`. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <div className="shrink-0 pt-[env(safe-area-inset-top)]">
          <div className="flex h-16 items-center gap-2 border-b border-slate-200 pl-4 pr-2">
            {renderBrand(false)}
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
              aria-label="Tutup navigasi"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          {renderNav(false)}
          {renderExtra()}
        </div>

        <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{renderFooter(false)}</div>
      </aside>
    </>
  );
}
