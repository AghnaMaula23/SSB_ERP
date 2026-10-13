import { useEffect, useState } from 'react';
import { initials } from '../project/utils/projectFormat.js';

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

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function RailNav({ active, onNavigate, onBackToModules, onSignOut, compact }) {
  const itemClass = (isActive, isEnabled) => `flex w-full items-center gap-3 rounded-lg text-xs font-semibold transition ${
    compact ? 'flex-col gap-1 px-1 py-2.5 text-[11px]' : 'px-3 py-2.5'
  } ${
    isActive
      ? 'bg-teal-50 text-teal-800'
      : isEnabled
        ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        : 'cursor-not-allowed text-slate-400'
  }`;

  return (
    <div className="flex h-full flex-col">
      <nav className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'px-2 py-3' : 'px-3 py-3'}`} aria-label="Menu Divisi Admin">
        <ul className="space-y-1">
          {RAIL_ITEMS.map((item) => {
            const isEnabled = Boolean(item.route);
            const isActive = item.key === active;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => isEnabled && onNavigate(item.route)}
                  className={itemClass(isActive, isEnabled)}
                  aria-current={isActive ? 'page' : undefined}
                  title={isEnabled ? item.label : `${item.label} — segera hadir`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {!isEnabled && !compact && <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400">Soon</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={`space-y-1 border-t border-slate-200 ${compact ? 'px-2 py-3' : 'p-3'}`}>
        <button type="button" onClick={onBackToModules} className={itemClass(false, true)} title="Kembali ke pilihan divisi">
          <span className="text-lg leading-none" aria-hidden="true">▦</span>
          <span>Modules</span>
        </button>
        <button type="button" onClick={onSignOut} className={itemClass(false, true)} title="Sign Out">
          <span className="text-lg leading-none" aria-hidden="true">↪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Kerangka Divisi Admin: header penuh di atas, rail ikon di kiri, lalu panel
 * sekunder (mis. pohon project) di sebelahnya. Di layar kecil rail + panel
 * digabung menjadi satu drawer.
 */
export default function AdminLayout({ active = 'project', panel, panelTitle, onNavigate, onBackToModules, onSignOut, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = readUser();
  const displayName = user.fullName || user.username || 'ERP User';
  const role = user.roles?.[0] || 'Authorized Personnel';

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') setDrawerOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [drawerOpen]);

  // Navigasi dari dalam drawer selalu menutup drawer.
  const navigate = (route) => { setDrawerOpen(false); onNavigate(route); };

  return (
    <div className="page-enter min-h-screen bg-slate-50 text-slate-800">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-xs backdrop-blur">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Buka navigasi"
        >
          ☰
        </button>
        <button type="button" onClick={onBackToModules} className="flex items-center gap-3 text-left" title="Kembali ke pilihan divisi">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-base font-bold text-white shadow-xs">▦</span>
          <span className="hidden sm:block">
            <span className="block text-lg font-bold leading-none tracking-tight text-slate-900">ConstructERP</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Divisi Admin</span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden border-l border-slate-200 pl-3 text-right md:block">
            <p className="text-xs font-bold text-slate-900">{displayName}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{role}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white shadow-xs">
            {initials(displayName) || 'EU'}
          </div>
        </div>
      </header>

      {/* Desktop: rail ikon + panel sekunder, keduanya tetap di tempat. */}
      <aside className="fixed bottom-0 left-0 top-16 z-20 hidden w-20 border-r border-slate-200 bg-white lg:block">
        <RailNav compact active={active} onNavigate={navigate} onBackToModules={onBackToModules} onSignOut={onSignOut} />
      </aside>
      {panel && (
        <aside className="fixed bottom-0 left-20 top-16 z-20 hidden w-72 flex-col border-r border-slate-200 bg-white lg:flex" aria-label={panelTitle}>
          {panel}
        </aside>
      )}

      {/* Mobile: satu drawer berisi menu dan panel. */}
      {drawerOpen && (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-label="Tutup navigasi" />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[90vw] flex-col bg-white shadow-xl lg:hidden">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <p className="text-sm font-bold text-slate-900">Divisi Admin</p>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup navigasi">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel && <div className="flex max-h-[60vh] flex-col border-b border-slate-200" onClickCapture={(event) => { if (event.target.closest('a[href]')) setDrawerOpen(false); }}>{panel}</div>}
              <RailNav active={active} onNavigate={navigate} onBackToModules={onBackToModules} onSignOut={onSignOut} />
            </div>
          </aside>
        </>
      )}

      <main className={`min-h-screen pt-16 ${panel ? 'lg:pl-[23rem]' : 'lg:pl-20'}`}>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
