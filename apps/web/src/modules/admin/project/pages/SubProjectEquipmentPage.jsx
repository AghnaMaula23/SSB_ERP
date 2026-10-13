import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, GuardedLink, MetricCard, Notice, PageHeader, StatusBadge } from '../components/ProjectUi.jsx';
import { changeAllocationStatus, listAllocations, receiveAllocation } from '../services/projectService.js';
import { ALLOCATION_STATUS, actorName, formatDateTime, stageCrumbs, subProjectTypeLabel } from '../utils/projectFormat.js';
import { equipmentStatusLabel, normalizeEquipmentStatus } from '../../../alat/services/alatService.js';

const CLOSE_ACTIONS = {
  completed: { label: 'Selesai', confirm: 'Tandai alokasi selesai? Unit kembali tersedia di pool project.' },
  returned: { label: 'Kembalikan', confirm: 'Tarik unit ini dari tahapan sebelum pekerjaannya selesai? Unit kembali tersedia di pool.' },
  cancelled: { label: 'Batalkan', confirm: 'Batalkan alokasi ini? Gunakan bila unit belum sempat dipakai.' },
};

const CONDITION_STYLE = {
  operational: 'text-emerald-700',
  maintenance: 'text-amber-700',
  retired: 'text-slate-500',
};

/**
 * Alat yang dialokasikan ke tahapan ini. Aksinya dibagi per wewenang:
 * mengalokasikan & menutup milik Divisi Alat, menerima unit milik Lapangan.
 * Admin biasanya hanya membaca.
 */
export default function SubProjectEquipmentPage({ project, stage, permissions, initialNotice }) {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState({ tone: 'success', text: initialNotice || '' });

  useEffect(() => {
    let cancelled = false;
    listAllocations(stage.id)
      .then((rows) => { if (!cancelled) setAllocations(Array.isArray(rows) ? rows : []); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stage.id, reloadKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allocations.filter((row) => {
      const matchesStatus = !statusFilter || row.status === statusFilter;
      const matchesSearch = !query || [row.equipmentItem?.assetCode, row.poolItem?.equipmentType?.typeName, row.poolItem?.equipmentType?.typeCode]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [allocations, search, statusFilter]);

  const runAction = async (row, action) => {
    const isReceive = action === 'receive';
    if (!window.confirm(isReceive ? `Konfirmasi unit ${row.equipmentItem?.assetCode} sudah sampai di lokasi?` : CLOSE_ACTIONS[action].confirm)) return;
    setBusyId(row.id);
    setNotice({ tone: 'success', text: '' });
    try {
      if (isReceive) await receiveAllocation(stage.id, row.id);
      else await changeAllocationStatus(stage.id, row.id, action);
      setNotice({ tone: 'success', text: isReceive ? `Penerimaan ${row.equipmentItem?.assetCode} dikonfirmasi.` : `Alokasi ${row.equipmentItem?.assetCode} kini "${ALLOCATION_STATUS[action].label}".` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  };

  const showActions = permissions.receiveAllocation || permissions.updateAllocation;
  const assigned = allocations.filter((row) => row.status === 'assigned');
  const received = assigned.filter((row) => row.receivedAt);

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Alat' })} />
      <PageHeader
        title="Data Alat"
        subtitle={`Unit yang dialokasikan ke tahapan ${subProjectTypeLabel(stage.subProjectType)}.`}
        actions={(
          <>
            <a href={`#/admin/projects/${project.id}/pool`} className="btn btn-secondary text-xs">Equipment Pool</a>
            <GuardedLink
              href={`#/admin/projects/${project.id}/sub/${stage.id}/alat/new`}
              allowed={permissions.createAllocation && stage.status === 'active'}
              reason={!permissions.createAllocation ? 'Alokasi alat milik Divisi Alat (allocation:create).' : 'Alat hanya bisa dialokasikan ke tahapan Active.'}
            >
              + Alokasikan Alat
            </GuardedLink>
          </>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Unit Aktif" value={<>{assigned.length}<span className="text-base text-slate-400">/{allocations.length}</span></>} hint="Alokasi berstatus assigned" accent />
        <MetricCard label="Sudah Diterima" value={received.length} tone="emerald" hint="Dikonfirmasi Lapangan" />
        <MetricCard label="Belum Diterima" value={assigned.length - received.length} tone={assigned.length - received.length > 0 ? 'amber' : 'slate'} hint="Dalam perjalanan / belum dikonfirmasi" />
        <MetricCard label="Selesai / Kembali" value={allocations.filter((row) => ['completed', 'returned'].includes(row.status)).length} hint="Riwayat alokasi" />
      </div>

      {loadError && <Notice tone="error">{loadError}</Notice>}
      <Notice tone={notice.tone} onDismiss={() => setNotice({ tone: 'success', text: '' })}>{notice.text}</Notice>

      <section className="card-panel mb-4 p-4" aria-label="Filter alat">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true">🔍</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input-control pl-8 text-xs" placeholder="Cari kode unit atau tipe alat..." aria-label="Cari alat" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-control text-xs" aria-label="Filter status alokasi">
            <option value="">Semua status</option>
            {Object.entries(ALLOCATION_STATUS).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
          </select>
        </div>
      </section>

      <div className="table-container">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Unit ID</th>
              <th>Tipe Alat</th>
              <th>Kondisi Unit</th>
              <th>Dialokasikan</th>
              <th>Diterima di Lokasi</th>
              <th className="text-center">Status</th>
              {showActions && <th className="text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showActions ? 7 : 6} className="py-12 text-center text-sm text-slate-500">Memuat data alat...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={showActions ? 7 : 6} className="py-12 text-center text-sm text-slate-500">
                {allocations.length === 0 ? 'Belum ada alat yang dialokasikan ke tahapan ini.' : 'Tidak ada alat yang cocok dengan filter.'}
              </td></tr>
            ) : filtered.map((row) => {
              const condition = normalizeEquipmentStatus(row.equipmentItem?.currentStatus);
              const inactive = row.status !== 'assigned';
              return (
                <tr key={row.id} className={inactive ? 'opacity-60' : ''}>
                  <td>
                    <span className="font-mono text-sm font-bold text-teal-700">{row.equipmentItem?.assetCode || '-'}</span>
                  </td>
                  <td>
                    <p className="font-semibold text-slate-900">{row.poolItem?.equipmentType?.typeName || '-'}</p>
                    {row.poolItem?.equipmentType?.typeCode && <p className="font-mono text-[11px] text-slate-400">{row.poolItem.equipmentType.typeCode}</p>}
                  </td>
                  <td className={`text-xs font-semibold ${CONDITION_STYLE[condition] || 'text-slate-500'}`}>
                    {row.equipmentItem?.currentStatus ? equipmentStatusLabel(condition) : '-'}
                  </td>
                  <td className="text-xs">
                    <p className="text-slate-700">{formatDateTime(row.allocatedAt)}</p>
                    <p className="text-[11px] text-slate-400">{actorName(row.allocatedBy)}</p>
                  </td>
                  <td className="text-xs">
                    {row.receivedAt ? (
                      <>
                        <p className="text-slate-700">{formatDateTime(row.receivedAt)}</p>
                        <p className="text-[11px] text-slate-400">{actorName(row.receivedBy)}</p>
                      </>
                    ) : (
                      <span className={`text-[11px] font-semibold ${row.status === 'assigned' ? 'text-amber-700' : 'text-slate-400'}`}>
                        {row.status === 'assigned' ? 'Menunggu konfirmasi' : '-'}
                      </span>
                    )}
                  </td>
                  <td className="text-center"><StatusBadge status={row.status} map={ALLOCATION_STATUS} /></td>
                  {showActions && (
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        {row.status === 'assigned' && !row.receivedAt && permissions.receiveAllocation && (
                          <button type="button" disabled={busyId !== null} onClick={() => runAction(row, 'receive')} className="btn btn-ghost px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50">Terima</button>
                        )}
                        {row.status === 'assigned' && permissions.updateAllocation && Object.entries(CLOSE_ACTIONS).map(([status, action]) => (
                          <button key={status} type="button" disabled={busyId !== null} onClick={() => runAction(row, status)} className={`btn btn-ghost px-2 py-1 text-[11px] ${status === 'cancelled' ? 'text-red-600 hover:bg-red-50' : 'text-teal-700 hover:bg-teal-50'}`}>
                            {busyId === row.id ? '...' : action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Operational</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Maintenance</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" /> Retired</span>
      </div>
    </>
  );
}
