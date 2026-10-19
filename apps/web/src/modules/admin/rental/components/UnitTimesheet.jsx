import { useEffect, useMemo, useState } from 'react';
import { GuardedLink, Notice } from '../../project/components/ProjectUi.jsx';
import { formatDate, formatNumber, todayIso } from '../../project/utils/projectFormat.js';
import { SESSIONS, groupTimesheet, monthRange } from '../utils/rentalFormat.js';
import { listRentalWorkhours } from '../services/rentalService.js';
import { listDemoLogs } from '../services/rentalDemoService.js';
import { downloadCsv } from '../../../../utils/csv.js';

const fmtHours = (value) => (value ? formatNumber(value) : '-');

/** Semua tanggal di bulan itu (sampai hari ini) supaya hari libur ikut terlihat. */
function datesOfMonth(month) {
  const { startDate, endDate } = monthRange(month);
  const last = endDate < todayIso() ? endDate : todayIso();
  const dates = [];
  for (let day = new Date(`${startDate}T00:00:00`); ; day.setDate(day.getDate() + 1)) {
    const text = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (text > last) break;
    dates.push(text);
  }
  return dates;
}

/**
 * Rekapitulasi timesheet satu unit sewa. Data dari jam kerja external_rental
 * (API) atau dari data contoh; keduanya berbentuk workhour log yang sama.
 */
export default function UnitTimesheet({ project, unit, canRecord }) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [showAllDays, setShowAllDays] = useState(true);
  const [state, setState] = useState({ key: null, logs: [], error: '' });
  const requestKey = `${unit.key}|${month}`;
  const loading = state.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    const range = monthRange(month);
    const load = unit.kind === 'demo'
      ? listDemoLogs(unit.key, range)
      // Satu unit fisik bisa dipakai beberapa kontrak — saring ke pool item ini.
      : listRentalWorkhours(unit.equipmentItemId, range).then((result) => (result.data || []).filter((log) => log.equipmentPoolItemId === unit.poolItemId));
    load
      .then((logs) => { if (!cancelled) setState({ key: requestKey, logs, error: '' }); })
      .catch((error) => { if (!cancelled) setState({ key: requestKey, logs: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [month, requestKey, unit]);

  const grouped = useMemo(() => groupTimesheet(state.logs), [state.logs]);
  const rows = useMemo(() => {
    if (!showAllDays) return grouped;
    const byDate = new Map(grouped.map((row) => [row.date, row]));
    return datesOfMonth(month).map((date) => byDate.get(date) || { date, sessions: {}, untimed: 0, total: 0, notes: [], empty: true });
  }, [grouped, month, showAllDays]);

  const sum = (key) => grouped.reduce((total, row) => total + (row.sessions[key]?.hours || 0), 0);
  const totalHours = grouped.reduce((total, row) => total + row.total, 0);
  const workDays = grouped.filter((row) => row.total > 0).length;
  const sheetHref = `#/admin/rental/${project.id}/unit/${unit.key}/sheet/new`;

  const exportCsv = () => downloadCsv(`timesheet-${project.projectCode}-${unit.assetCode || unit.key}-${month}.csv`, grouped, [
    { label: 'Tanggal', value: (row) => row.date },
    ...SESSIONS.flatMap((session) => [
      { label: `${session.label} Awal`, value: (row) => row.sessions[session.key]?.start || '' },
      { label: `${session.label} Akhir`, value: (row) => row.sessions[session.key]?.end || '' },
      { label: `${session.label} Jam`, value: (row) => row.sessions[session.key]?.hours || 0 },
    ]),
    { label: 'Total Jam', value: (row) => row.total },
    { label: 'Keterangan', value: (row) => row.notes.join('; ') },
  ]);

  return (
    <section className="card-panel overflow-hidden" aria-label="Rekapitulasi timesheet">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Rekapitulasi Timesheet Pemakaian Alat</h2>
          <p className="mt-0.5 font-mono text-[11px] font-semibold uppercase text-slate-500">Unit ID: {unit.assetCode || '-'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} max={todayIso().slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} className="input-control h-9 w-40 text-xs" aria-label="Periode timesheet" />
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <input type="checkbox" checked={showAllDays} onChange={(event) => setShowAllDays(event.target.checked)} className="accent-teal-700" />
            Semua tanggal
          </label>
          <button type="button" onClick={exportCsv} disabled={loading || grouped.length === 0} className="btn btn-secondary h-9 text-xs">↓ Export CSV</button>
          <GuardedLink href={sheetHref} allowed={canRecord} reason="Pencatatan jam kerja milik Lapangan / Divisi Alat (workhour:create)." className="btn btn-primary h-9 text-xs">✎ Input Sheet</GuardedLink>
        </div>
      </div>

      <div className="px-5 pt-4">
        {state.error && !loading && <Notice tone="error">{state.error}</Notice>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2 text-center">No</th>
              <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2 text-left">Tanggal</th>
              <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2 text-left">No. Timesheet</th>
              {SESSIONS.map((session) => (
                <th key={session.key} colSpan={3} className={`border-b border-r border-slate-200 px-3 py-2 text-center ${session.key === 'overtime' ? 'text-amber-700' : ''}`}>{session.label}</th>
              ))}
              <th rowSpan={2} className="border-b border-r border-slate-200 bg-teal-50 px-3 py-2 text-center text-teal-800">Total Jam</th>
              <th rowSpan={2} className="border-b border-r border-slate-200 px-3 py-2 text-center">Hari</th>
              <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 text-left">Keterangan</th>
            </tr>
            <tr>
              {SESSIONS.flatMap((session) => [
                <th key={`${session.key}-a`} className="border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold">Awal</th>,
                <th key={`${session.key}-b`} className="border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold">Akhir</th>,
                <th key={`${session.key}-s`} className="border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold">Σ</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={15} className="py-12 text-center text-sm text-slate-500">Memuat timesheet...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={15} className="py-12 text-center text-sm text-slate-500">Belum ada jam kerja pada periode ini.</td></tr>
            ) : rows.map((row, index) => {
              const sunday = new Date(`${row.date}T00:00:00`).getDay() === 0;
              return (
                <tr key={row.date} className={`border-b border-slate-100 ${row.empty ? 'text-slate-400' : 'text-slate-700 hover:bg-slate-50'} ${sunday && row.empty ? 'bg-slate-50/80' : ''}`}>
                  <td className="border-r border-slate-100 px-3 py-2 text-center">{index + 1}</td>
                  <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2 font-medium">{formatDate(row.date, { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                  <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2 font-mono">{row.empty ? '-' : `TS-${row.date.replaceAll('-', '')}`}</td>
                  {SESSIONS.flatMap((session) => {
                    const value = row.sessions[session.key];
                    return [
                      <td key={`${session.key}-a`} className="border-r border-slate-100 px-2 py-2 text-center font-mono">{value?.start || '-'}</td>,
                      <td key={`${session.key}-b`} className="border-r border-slate-100 px-2 py-2 text-center font-mono">{value?.end || '-'}</td>,
                      <td key={`${session.key}-s`} className="border-r border-slate-100 px-2 py-2 text-center font-semibold">{value ? formatNumber(value.hours) : '-'}</td>,
                    ];
                  })}
                  <td className="border-r border-slate-100 bg-teal-50/50 px-3 py-2 text-center font-mono text-sm font-bold text-slate-900">{row.empty ? '-' : formatNumber(row.total)}</td>
                  <td className="border-r border-slate-100 px-3 py-2 text-center">{row.total > 0 ? 1 : 0}</td>
                  <td className="max-w-64 px-3 py-2">
                    <span className={`block truncate ${row.empty ? 'italic' : ''}`} title={row.notes.join('; ')}>
                      {row.empty ? (sunday ? 'Libur Mingguan' : 'Tidak beroperasi') : row.notes.join('; ') || '-'}
                      {row.untimed > 0 && <span className="ml-1 text-[10px] text-slate-400">(+{formatNumber(row.untimed)} jam tanpa jam mulai)</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && grouped.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 text-sm font-bold text-slate-900">
                <td colSpan={3} className="px-3 py-3 text-right text-[11px] uppercase tracking-wider text-slate-600">Jumlah Total</td>
                {SESSIONS.map((session) => <td key={session.key} colSpan={3} className="border-l border-slate-200 px-3 py-3">{sum(session.key) ? `${fmtHours(sum(session.key))} Jam` : '-'}</td>)}
                <td className="bg-teal-700 px-3 py-3 text-center text-white">{formatNumber(totalHours)} Jam</td>
                <td className="px-3 py-3 text-center">{workDays} Hari</td>
                <td className="px-3 py-3 text-slate-500">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
