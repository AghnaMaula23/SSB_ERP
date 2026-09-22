function Icon({ children, label }) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export default function AlatHeader({ collapsed, onToggle }) {
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

      <div className="relative mx-auto min-w-0 flex-1 max-w-md lg:mx-0 lg:flex-none">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
        <input
          className="input-control pl-9 text-sm"
          placeholder="Search items, maintenance, logs..."
          aria-label="Search items or records"
        />
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1 sm:ml-auto sm:gap-2">
        <Icon label="Notifications">🔔</Icon>
        <Icon label="Settings">⚙️</Icon>
        <div className="ml-2 hidden border-l border-slate-200 pl-3 text-right md:block">
          <p className="text-xs font-bold text-slate-900">Admin Division</p>
          <p className="text-[11px] font-medium text-slate-500">ERP Administrator</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white shadow-xs">
          AD
        </div>
      </div>
    </header>
  );
}

