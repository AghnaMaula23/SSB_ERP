import { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, GuardedLink, MetricCard, Notice, PageHeader } from '../components/ProjectUi.jsx';
import { listAllocations, listItemWorkhours } from '../services/projectService.js';
import { actorName, formatDate, formatNumber, formatTime, stageCrumbs, subProjectTypeLabel, todayIso } from '../utils/projectFormat.js';
import { downloadCsv } from '../../../../utils/csv.js';

const monthRange = (month) => {
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(year, monthIndex, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(last).padStart(2, '0')}` };
};

/**
 * Rekap jam kerja alat pada tahapan ini. Backend menyimpan jam kerja per unit;
 * baris yang dicatat lewat alokasi tahapan ini disaring dengan
 * subProjectEquipmentAllocationId, jadi pemakaian unit yang sama di tahapan
 * lain tidak ikut terhitung.
 */
export default function TimesheetPage({ project, stage, canRecord, initialNotice }) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [unitFilter, setUnitFilter] = useState('');
  const [state, setState] = useState({ key: null, allocations: [], logs: [], error: '' });
  const [notice, setNotice] = useState(initialNotice || '');
  const requestKey = `${stage.id}|${month}`;
  const loading = state.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const allocations = await listAllocations(stage.id);
      const allocationIds = new Set(allocations.map((row) => row.id));
      const itemIds = [...new Set(allocations.map((row) => row.equipmentItemId).filter(Boolean))];
      const { startDate, endDate } = monthRange(month);
      const pages = await Promise.all(itemIds.map((itemId) => listItemWorkhours(itemId, { startDate, endDate })));
      const assetById = new Map(allocations.map((row) => [row.id, row.equipmentItem?.assetCode]));
      const typeById = new Map(allocations.map((row) => [row.id, row.poolItem?.equipmentType?.typeName]));
      const logs = pages
        .flatMap((page) => page.data || [])
        .filter((log) => allocationIds.has(log.subProjectEquipmentAllocationId))
        .map((log) => ({ ...log, assetCode: assetById.get(log.subProjectEquipmentAllocationId), typeName: typeById.get(log.subProjectEquipmentAllocationId) }))
        .sort((a, b) => (a.workDate === b.workDate ? (a.startedAt || '').localeCompare(b.startedAt || '') : a.workDate.localeCompare(b.workDate)));
      return { allocations, logs };
    };
    load()
      .then((result) => { if (!cancelled) setState({ key: requestKey, ...result, error: '' }); })
      .catch((error) => { if (!cancelled) setState({ key: requestKey, allocations: [], logs: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [month, requestKey, stage.id]);

  const units = useMemo(() => [...new Set(state.allocations.map((row) => row.equipmentItem?.assetCode).filter(Boolean))], [state.allocations]);
  const visible = unitFilter ? state.logs.filter((log) => log.assetCode === unitFilter) : state.logs;
  const totalHours = visible.reduce((sum, log) => sum + (log.totalWorkhour || 0), 0);
  const workDays = new Set(visible.map((log) => log.workDate)).size;

  const perUnit = useMemo(() => {
    const map = new Map();
    visible.forEach((log) => {
      const entry = map.get(log.assetCode) || { assetCode: log.assetCode, typeName: log.typeName, hours: 0, days: new Set() };
      entry.hours += log.totalWorkhour || 0;
      entry.days.add(log.workDate);
      map.set(log.assetCode, entry);
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [visible]);

  const exportCsv = () => {
    downloadCsv(`timesheet-${project.projectCode}-${stage.subProjectType}-${month}.csv`, visible, [
      { label: 'Tanggal', value: (log) => log.workDate },
      { label: 'Unit', value: (log) => log.assetCode },
      { label: 'Tipe', value: (log) => log.typeName },
      { label: 'Mulai', value: (log) => formatTime(log.startedAt) },
      { label: 'Selesai', value: (log) => formatTime(log.stoppedAt) },
      { label: 'Jeda (menit)', value: (log) => log.pausedDurationMinutes },
      { label: 'Total Jam', value: (log) => log.totalWorkhour },
      { label: 'Keterangan', value: (log) => log.description },
      { label: 'Dicatat oleh', value: (log) => actorName(log.createdBy) },
    ]);
  };

  const hasActiveAllocation = state.allocations.some((row) => row.status === 'assigned');

  return (
    <>
      <Breadcrumb items={stageCrumbs(project, stage, { label: 'Timesheet Alat' })} />
      <PageHeader
        title="Timesheet Pemakaian Alat"
        subtitle={`Rekap jam kerja unit di tahapan ${subProjectTypeLabel(stage.subProjectType)}`}
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={loading || visible.length === 0} className="btn btn-secondary text-xs">↓ Export CSV</button>
            <GuardedLink
              href={`#/admin/projects/${project.id}/sub/${stage.id}/timesheet/new`}
              allowed={canRecord && hasActiveAllocation}
              reason={!canRecord ? 'Pencatatan jam kerja milik Lapangan / Divisi Alat (workhour:create).' : 'Belum ada alat yang sedang dialokasikan ke tahapan ini.'}
            >
              + Input Jam Kerja
            </GuardedLink>
          </>
        )}
      />

      <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>
      {state.error && !loading && <Notice tone="error">{state.error}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Jam" value={`${formatNumber(totalHours)} jam`} accent tone="teal" />
        <MetricCard label="Hari Kerja" value={workDays} hint="Tanggal dengan jam tercatat" />
        <MetricCard label="Unit Tercatat" value={perUnit.length} hint={`dari ${units.length} unit dialokasikan`} />
        <MetricCard label="Rata-rata / Hari" value={workDays ? `${formatNumber(totalHours / workDays)} jam` : '-'} />
      </div>

      <section className="card-panel mb-4 p-4" aria-label="Filter timesheet">
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,16rem)]">
          <div>
            <label htmlFor="ts-month" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Periode</label>
            <input id="ts-month" type="month" value={month} max={todayIso().slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} className="input-control mt-1 text-xs" />
          </div>
          <div>
            <label htmlFor="ts-unit" className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Unit</label>
            <select id="ts-unit" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="input-control mt-1 text-xs">
              <option value="">Semua unit</option>
              {units.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card-panel overflow-hidden" aria-label="Rekapitulasi timesheet">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="text-sm font-bold text-slate-900">Rekapitulasi Timesheet</h2>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th className="w-12 text-center">No</th>
                  <th>Tanggal</th>
                  <th>Unit</th>
                  <th className="text-center">Mulai</th>
                  <th className="text-center">Selesai</th>
                  <th className="text-center">Jeda</th>
                  <th className="text-right">Total Jam</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">Memuat timesheet...</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">
                    {units.length === 0 ? 'Belum ada alat yang dialokasikan ke tahapan ini.' : 'Belum ada jam kerja tercatat pada periode ini.'}
                  </td></tr>
                ) : visible.map((log, index) => (
                  <tr key={log.id}>
                    <td className="text-center text-xs text-slate-500">{index + 1}</td>
                    <td className="whitespace-nowrap font-medium text-slate-900">{formatDate(log.workDate)}</td>
                    <td>
                      <p className="font-mono text-xs font-bold text-teal-700">{log.assetCode}</p>
                      <p className="text-[11px] text-slate-400">{log.typeName}</p>
                    </td>
                    <td className="text-center font-mono text-xs">{formatTime(log.startedAt)}</td>
                    <td className="text-center font-mono text-xs">{formatTime(log.stoppedAt)}</td>
                    <td className="text-center text-xs text-slate-500">{log.pausedDurationMinutes ? `${log.pausedDurationMinutes} mnt` : '-'}</td>
                    <td className="text-right"><span className="rounded-md bg-teal-50 px-2 py-0.5 font-mono text-sm font-bold text-teal-800">{formatNumber(log.totalWorkhour)}</span></td>
                    <td className="max-w-56 text-xs text-slate-600">
                      <p className="truncate" title={log.description || ''}>{log.description || '-'}</p>
                      <p className="text-[11px] text-slate-400">{actorName(log.createdBy)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
              {!loading && visible.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100">
                    <td colSpan={6} className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">Jumlah Total</td>
                    <td className="px-4 py-3 text-right"><span className="rounded-md bg-teal-700 px-2.5 py-1 font-mono text-sm font-bold text-white">{formatNumber(totalHours)} Jam</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <aside className="card-panel h-fit p-4" aria-label="Rekap per unit">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Rekap per Unit</p>
          {perUnit.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Belum ada data.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {perUnit.map((entry) => (
                <li key={entry.assetCode}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">{entry.assetCode}</span>
                    <span className="text-xs font-bold text-teal-700">{formatNumber(entry.hours)} jam</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{entry.typeName} · {entry.days.size} hari</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${totalHours ? (entry.hours / totalHours) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
