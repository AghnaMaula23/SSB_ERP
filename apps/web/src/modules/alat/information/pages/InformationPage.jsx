import { useCallback, useEffect, useState } from 'react';
import AlatHeader from '../../components/AlatHeader.jsx';
import AlatSidebar from '../../components/AlatSidebar.jsx';
import DamageLogTable from '../components/DamageLogTable.jsx';
import DamageLogModal from '../components/DamageLogModal.jsx';
import DamageLogActionModal from '../components/DamageLogActionModal.jsx';
import { getDamageLogs } from '../services/informationService.js';

const PAGE_SIZE = 10;
const initialFilters = { search: '', sparePartSource: 'all', mechanicTeam: 'all', status: 'all' };

export default function InformationPage({ onBackToModules, onSignOut }) {
	const [collapsed, setCollapsed] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const [filters, setFilters] = useState(initialFilters);
	const [logs, setLogs] = useState([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [modalOpen, setModalOpen] = useState(false);
	const [editingLog, setEditingLog] = useState(null);
	const [notice, setNotice] = useState('');
	const [actionLog, setActionLog] = useState(null);
	const [actionType, setActionType] = useState(null);
	const [usingDummyData, setUsingDummyData] = useState(false);

	const loadLogs = useCallback(async () => {
		setLoading(true); setError('');
		try { const result = await getDamageLogs({ ...filters, page, limit: PAGE_SIZE }); setLogs(result.data || []); setTotal(result.total || 0); setUsingDummyData(Boolean(result.isDummy)); }
		catch (requestError) { setError(requestError.message); }
		finally { setLoading(false); }
	}, [filters, page]);

	useEffect(() => {
		const request = window.setTimeout(() => { loadLogs(); }, 0);
		return () => window.clearTimeout(request);
	}, [loadLogs]);
	const updateFilter = (event) => { setFilters((current) => ({ ...current, [event.target.name]: event.target.value })); setPage(1); };
	const handleSaved = () => { setNotice(editingLog ? 'Log kerusakan berhasil diperbarui.' : 'Log kerusakan berhasil disimpan.'); setEditingLog(null); setModalOpen(false); setPage(1); loadLogs(); };
	const openEdit = (log) => { setEditingLog(log); setModalOpen(true); };
	const openAction = (log, action) => {
		if (usingDummyData) {
			setLogs((current) => current.map((item) => item.id === log.id ? { ...item, status: action === 'resolve' ? 'resolved' : 'cancelled' } : item));
			setNotice(`${log.damageCode} berhasil ${action === 'resolve' ? 'diselesaikan' : 'dibatalkan'} (data demo).`);
			return;
		}
		setActionLog(log); setActionType(action);
	};

	return <div className="min-h-screen bg-[#edf2f8] text-[#1e293b]">
		<AlatSidebar collapsed={collapsed} mobileOpen={mobileSidebarOpen} activeRoute="alat/information" onToggle={() => setCollapsed((value) => !value)} onClose={() => setMobileSidebarOpen(false)} onBackToModules={onBackToModules} onSignOut={onSignOut} />
		<AlatHeader collapsed={collapsed} onToggle={() => setMobileSidebarOpen((value) => !value)} />
		<main className={`min-h-screen pt-9 transition-[padding] duration-200 ${collapsed ? 'lg:pl-16' : 'lg:pl-40'}`}><div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-5 lg:px-4">
			<div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold text-[#475569]">Main Menu <span className="px-1 text-[#94a3b8]">&gt;</span> <span className="text-[#08729a]">Information</span> <span className="px-1 text-[#94a3b8]">&gt;</span> <span className="text-[#08729a]">Log Kerusakan</span></p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1e293b]">Information - Log Kerusakan</h2><p className="mt-1 text-xs text-[#64748b]">Monitoring dan pengelolaan laporan kerusakan alat di seluruh lokasi proyek.</p></div><button type="button" onClick={() => { setNotice(''); setModalOpen(true); }} className="self-start bg-[#08729a] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#075a7b] sm:self-auto">+ Input Log Baru</button></div>
			{notice && <div className="mb-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">{notice}</div>}
			{error && <div className="mb-4 flex items-center justify-between border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert"><span>{error}</span><button type="button" onClick={loadLogs} className="font-bold underline">Coba lagi</button></div>}
			<section className="mb-4 border border-[#cbd5e1] bg-[#f3f7fb] p-3" aria-label="Search and filter damage logs"><div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(140px,.7fr)_minmax(140px,.7fr)_minmax(120px,.6fr)_auto] md:items-end">
				<label className="block text-[10px] font-bold text-[#334155]">Search Information<div className="relative mt-1.5"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-[#475569]">⌕</span><input name="search" value={filters.search} onChange={updateFilter} className="h-9 w-full border border-[#cbd5e1] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#08729a]" placeholder="Cari Item, Kode, atau Jenis Kerusakan..." /></div></label>
				<label className="block text-[10px] font-bold text-[#334155]">Filter Spare Part<select name="sparePartSource" value={filters.sparePartSource} onChange={updateFilter} className="mt-1.5 h-9 w-full border border-[#cbd5e1] bg-white px-2 text-xs outline-none focus:border-[#08729a]"><option value="all">All Source</option><option value="warehouse">Warehouse</option><option value="supplier">Supplier</option></select></label>
				<label className="block text-[10px] font-bold text-[#334155]">Filter Mekanik<select name="mechanicTeam" value={filters.mechanicTeam} onChange={updateFilter} className="mt-1.5 h-9 w-full border border-[#cbd5e1] bg-white px-2 text-xs outline-none focus:border-[#08729a]"><option value="all">All Team</option><option value="internal">Internal</option><option value="external">Eksternal</option></select></label>
				<label className="block text-[10px] font-bold text-[#334155]">Status<select name="status" value={filters.status} onChange={updateFilter} className="mt-1.5 h-9 w-full border border-[#cbd5e1] bg-white px-2 text-xs outline-none focus:border-[#08729a]"><option value="all">All Status</option><option value="reported">Reported</option><option value="resolved">Resolved</option><option value="cancelled">Cancelled</option></select></label>
				<button type="button" onClick={() => { setFilters(initialFilters); setPage(1); }} className="h-9 border border-[#cbd5e1] bg-[#e8eef5] px-4 text-xs font-semibold text-[#475569] hover:bg-white">↻ Reset</button>
			</div></section>
			{loading ? <div className="border border-[#cbd5e1] bg-white px-4 py-16 text-center text-sm text-[#64748b]">Memuat log kerusakan...</div> : <DamageLogTable logs={logs} page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} onEdit={openEdit} onResolve={(log) => openAction(log, 'resolve')} onCancel={(log) => openAction(log, 'cancel')} />}
		</div></main>
		<DamageLogModal isOpen={modalOpen} log={editingLog} onClose={() => { setModalOpen(false); setEditingLog(null); }} onSaved={handleSaved} />
		<DamageLogActionModal log={actionLog} action={actionType} onClose={() => { setActionLog(null); setActionType(null); }} onSaved={(action) => { setNotice(`Log kerusakan berhasil ${action === 'resolve' ? 'diselesaikan' : 'dibatalkan'}.`); setActionLog(null); setActionType(null); loadLogs(); }} />
	</div>;
}
