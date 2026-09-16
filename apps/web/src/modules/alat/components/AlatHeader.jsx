function Icon({ children, label }) {
  return <span className="grid h-7 w-7 place-items-center text-base text-[#475569]" aria-label={label} title={label}>{children}</span>;
}

export default function AlatHeader({ collapsed, onToggle }) {
  return (
    <header className={`fixed inset-x-0 top-0 z-20 flex h-9 items-center border-b border-[#cbd5e1] bg-white px-2.5 transition-[left] duration-200 ${collapsed ? 'lg:left-16' : 'lg:left-40'}`}>
      <div className="flex w-8 shrink-0 items-center lg:w-48"><button type="button" onClick={onToggle} className="mr-2 grid h-6 w-6 place-items-center rounded text-sm text-[#475569] hover:bg-[#e8eef5] lg:hidden" aria-label="Toggle sidebar">☰</button><span className="hidden text-[19px] font-extrabold tracking-tight text-[#00688f] lg:block">ConstructERP</span></div>
      <div className="relative mx-auto w-full max-w-[430px] lg:mx-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#64748b]">⌕</span>
        <input className="h-6 w-full rounded border border-transparent bg-[#f1f5f9] pl-8 pr-3 text-[10px] text-[#334155] outline-none transition placeholder:text-[#64748b] focus:border-[#78b4c9] focus:bg-white focus:ring-2 focus:ring-[#08729a]/10" placeholder="Search projects or rentals..." aria-label="Search projects or rentals" />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Icon label="Notifications">♧</Icon>
        <Icon label="Settings">⚙</Icon>
        <Icon label="Help">?</Icon>
        <div className="ml-2 hidden border-l border-[#cbd5e1] pl-4 text-right sm:block">
          <p className="text-[10px] font-bold text-[#1e293b]">Admin Division</p>
          <p className="text-[8px] uppercase tracking-wide text-[#64748b]">ERP Admin</p>
        </div>
        <span className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-[#253b47] text-xs text-white" aria-hidden="true">♟</span>
      </div>
    </header>
  );
}
