import ActivityBell from './ActivityBell.jsx';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

const initialsOf = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EU';

/**
 * Header bersama semua divisi: tombol menu (mobile), judul produk, lonceng
 * aktivitas, dan blok user. Identik di Divisi Alat maupun Divisi Admin.
 */
export default function AppHeader({
  title = 'ConstructERP',
  subtitle,
  collapsed,
  onToggleMenu,
  onBackToModules,
  user: userProp,
  showBrand = true,
}) {
  const user = userProp || readUser();
  const displayName = user.fullName || user.username || 'ERP User';
  const role = user.roles?.[0] || 'Authorized Personnel';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 shadow-xs backdrop-blur transition-[left] duration-300 sm:px-4 ${
        collapsed ? 'lg:left-20' : 'lg:left-64'
      }`}
    >
      <button
        type="button"
        onClick={onToggleMenu}
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 lg:hidden"
        aria-label="Buka navigasi"
        title="Buka navigasi"
      >
        ☰
      </button>

      {showBrand && (
        <button type="button" onClick={onBackToModules} className="flex min-w-0 items-center gap-2.5 text-left" title="Kembali ke pilihan divisi">
          <span className="hidden text-xl font-bold tracking-tight text-slate-900 sm:block">{title}</span>
          {subtitle && <span className="hidden truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">{subtitle}</span>}
        </button>
      )}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ActivityBell />
        <div className="hidden border-l border-slate-200 pl-3 text-right md:block">
          <p className="text-xs font-bold text-slate-900">{displayName}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white shadow-xs">
          {initialsOf(displayName)}
        </div>
      </div>
    </header>
  );
}
