const modules = [
  { id: 'admin', title: 'Admin Division', description: 'Manage users, roles, and system settings.', icon: '▦', tone: 'blue' },
  { id: 'alat/items', title: 'Divisi Alat', description: 'Manage equipment inventory and maintenance.', icon: '⚒', tone: 'cyan' },
  { id: 'lapangan', title: 'Divisi Lapangan', description: 'Coordinate field operations and projects.', icon: '⌖', tone: 'green' },
  { id: 'finance', title: 'Divisi Finance', description: 'Track finance, payments, and reporting.', icon: '▤', tone: 'amber' },
];

const moduleTone = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
};

export default function ModuleSelection({ onSelectModule, onSignOut }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <main className="min-h-screen bg-[#eef5fb] px-4 py-8 text-slate-800 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-lg font-extrabold tracking-tight text-[#076b92]">ConstructERP</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sinar Selatan Banten</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block"><p className="text-xs font-bold text-slate-700">{user.fullName || user.username || 'ERP Admin'}</p><p className="text-[10px] text-slate-500">Select a workspace</p></div>
            <button type="button" onClick={onSignOut} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900">Sign out</button>
          </div>
        </header>

        <section className="my-auto py-12">
          <div className="mb-8 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Where would you like to work?</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">Choose a division to continue to its workspace and tools.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {modules.map((module) => (
              <button key={module.id} type="button" onClick={() => module.id === 'alat/items' && onSelectModule(module.id)} disabled={module.id !== 'alat/items'} className={`group flex min-h-36 items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-cyan-700/10 ${module.id === 'alat/items' ? 'hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md' : 'cursor-not-allowed opacity-75'}`}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl ring-1 ${moduleTone[module.tone]}`} aria-hidden="true">{module.icon}</span>
                <span className="min-w-0"><span className="block text-base font-bold text-slate-800">{module.title}</span><span className="mt-2 block text-sm leading-5 text-slate-500">{module.description}</span><span className="mt-4 block text-xs font-bold text-cyan-700 transition group-hover:translate-x-1">{module.id === 'alat/items' ? 'Open workspace' : 'Coming soon'} {module.id === 'alat/items' && <span aria-hidden="true">→</span>}</span></span>
              </button>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-[10px] text-slate-400">© 2026 ConstructERP · Restricted access</footer>
      </div>
    </main>
  );
}