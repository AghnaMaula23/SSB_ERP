import { useState } from 'react';

function Icon({ children, label, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

export default function AlatHeader({ collapsed, onToggle, user: userProp }) {
  const [search, setSearch] = useState('');
  const user = userProp || readUser();
  const displayName = user.fullName || user.username || 'ERP User';
  const role = user.roles?.[0] || 'Authorized Personnel';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EU';

  const handleSearch = (event) => {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    sessionStorage.setItem('equipment-search', value);
    if (window.location.hash === '#/alat/items') {
      window.dispatchEvent(new CustomEvent('equipment-search-submit', { detail: value }));
    } else {
      window.location.hash = '/alat/items';
    }
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 shadow-xs backdrop-blur transition-[left] duration-300 ${
        collapsed ? 'lg:left-20' : 'lg:left-64'
      }`}
    >
      <div className="flex w-10 shrink-0 items-center lg:w-60">
        <button
          type="button"
          onClick={onToggle}
          className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <span className="hidden text-xl font-bold tracking-tight text-slate-900 lg:block">ConstructERP</span>
      </div>

      <form onSubmit={handleSearch} className="relative mx-3 min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input-control w-full pl-9 text-sm"
          placeholder="Search equipment..."
          aria-label="Search equipment"
        />
      </form>

      <div className="ml-2 flex shrink-0 items-center gap-1 sm:ml-auto sm:gap-2">
        <Icon label="Notifications (coming soon)" disabled>🔔</Icon>
        <Icon label="Settings (coming soon)" disabled>⚙️</Icon>
        <div className="ml-2 hidden border-l border-slate-200 pl-3 text-right md:block">
          <p className="text-xs font-bold text-slate-900">{displayName}</p>
          <p className="text-[11px] font-medium text-slate-500">{role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white shadow-xs">
          {initials}
        </div>
      </div>
    </header>
  );
}
