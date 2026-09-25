const modules = [
  { id: 'admin', title: 'Admin Division', description: 'Manage system users, access roles, and audit configuration.', icon: '▦', tone: 'blue' },
  { id: 'alat/items', title: 'Divisi Alat', description: 'Manage equipment inventory, active issues, and maintenance.', icon: '⚒', tone: 'teal' },
  { id: 'lapangan', title: 'Divisi Lapangan', description: 'Coordinate field construction operations and project logs.', icon: '⌖', tone: 'green' },
  { id: 'finance', title: 'Divisi Finance', description: 'Track financial transactions, invoicing, and budget reports.', icon: '▤', tone: 'amber' },
];

const moduleTone = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function ModuleSelection({ user = {}, onSelectModule, onSignOut }) {
  const currentUser = user || {};
  const canAccessEquipment = currentUser.roles?.includes('super_admin') || currentUser.permissions?.includes('equipment:read') || false;

  return (
    <main className="page-enter min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-xl font-bold text-white shadow-sm">
              ⚒
            </div>
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
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">Workspace Portal</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Select a Division</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose your operational division workspace to start managing assets, tasks, or reports.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {modules.map((module) => {
              const isModuleAvailable = module.id === 'alat/items' ? canAccessEquipment : false;
              const isActive = isModuleAvailable;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => isActive && onSelectModule(module.id)}
                  disabled={!isActive}
                  className={`group card-panel flex items-start gap-4 p-6 text-left transition ${
                    isActive ? 'hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md cursor-pointer' : 'opacity-70 cursor-not-allowed bg-slate-50'
                  }`}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl font-bold ${moduleTone[module.tone]}`}>
                    {module.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-slate-900">{module.title}</h2>
                      {isActive ? (
                        <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Upcoming</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p>
                    <div className="mt-4 flex items-center text-xs font-semibold text-teal-700">
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
