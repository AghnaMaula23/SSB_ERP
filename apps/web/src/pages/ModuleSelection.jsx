const modules = [
  { id: 'admin/projects', title: 'Admin Division', description: 'Manage construction projects, sub-project contracts, and progress validation.', icon: '▦', tone: 'brand' },
  { id: 'alat/items', title: 'Divisi Alat', description: 'Manage equipment inventory, active issues, and maintenance.', icon: '⚒', tone: 'leaf' },
  { id: 'lapangan', title: 'Divisi Lapangan', description: 'Coordinate field construction operations and project logs.', icon: '⌖', tone: 'amber' },
  { id: 'finance', title: 'Divisi Finance', description: 'Track financial transactions, invoicing, and budget reports.', icon: '▤', tone: 'violet' },
];

// Warna kartu mengikuti logo: biru (brand) & hijau daun (leaf) untuk divisi aktif.
const moduleTone = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  leaf: 'bg-leaf-50 text-leaf-700 border-leaf-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
};

export default function ModuleSelection({ user = {}, onSelectModule, onSignOut }) {
  const currentUser = user || {};
  // Tanpa bypass super_admin (backlog E3): permission dari /api/auth/me sudah
  // mencerminkan hak akses sebenarnya, termasuk `*:read` milik super_admin.
  const canAccessEquipment = currentUser.permissions?.includes('equipment:read') || false;
  const canAccessAdmin = currentUser.permissions?.includes('project:read') || false;
  const moduleAccess = { 'alat/items': canAccessEquipment, 'admin/projects': canAccessAdmin };

  return (
    <main className="page-enter min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <img src="/logo-ssb.png" alt="Logo Sinar Selatan Banten" className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 shadow-sm ring-1 ring-slate-200" />
            <div>
              <p className="text-xl font-bold tracking-tight text-slate-900">ConstructERP</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sinar Selatan Banten</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">{currentUser.fullName || currentUser.username || 'ERP User'}</p>
              <p className="text-xs text-slate-500">{currentUser.roles?.[0] || 'Authorized Personnel'}</p>
            </div>
            <button type="button" onClick={onSignOut} className="btn btn-secondary py-1.5 px-3 text-xs">Sign Out</button>
          </div>
        </header>

        <section className="my-auto py-12">
          <div className="mb-8 max-w-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Workspace Portal</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Select a Division</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose your operational division workspace to start managing assets, tasks, or reports.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {modules.map((module) => {
              const isModuleAvailable = moduleAccess[module.id] || false;
              const isActive = isModuleAvailable;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => isActive && onSelectModule(module.id)}
                  disabled={!isActive}
                  className={`group card-panel flex items-start gap-4 p-6 text-left transition ${
                    isActive ? 'hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md cursor-pointer' : 'opacity-70 cursor-not-allowed bg-slate-50'
                  }`}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl font-bold ${moduleTone[module.tone]}`}>
                    {module.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-slate-900">{module.title}</h2>
                      {isActive ? (
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Upcoming</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p>
                    <div className="mt-4 flex items-center text-xs font-semibold text-brand-700">
                      {isActive ? 'Enter Workspace →' : 'Unavailable'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">© 2026 ConstructERP · Internal Management System</footer>
      </div>
    </main>
  );
}
