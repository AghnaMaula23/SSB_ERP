import ActionButton from '../../../../components/ActionButton.jsx';

const statusMeta = {
  reported: { label: 'Reported', badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', accent: 'bg-amber-400' },
  resolved: { label: 'Resolved', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', accent: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', badge: 'border-slate-200 bg-slate-100 text-slate-500', dot: 'bg-slate-400', accent: 'bg-slate-300' },
};

const levelMeta = {
  critical: { badge: 'border-red-200 bg-red-50 text-red-600' },
  moderate: { badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  minor: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

const metaFor = (status) => statusMeta[status] || statusMeta.reported;

function LevelBadge({ level, stopsOperation }) {
  const normalized = String(level || (stopsOperation ? 'critical' : 'minor')).toLowerCase();
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${(levelMeta[normalized] || levelMeta.minor).badge}`}>
      {normalized}
    </span>
  );
}

const formatDate = (value) => (value
  ? new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  : '-');

function ActionButtons({ log, onViewDetails, onEdit, canEdit }) {
  return (
    <div className="flex items-center justify-center gap-1">
      <ActionButton kind="view" label={`Lihat detail ${log.damageCode}`} onClick={() => onViewDetails(log)} />
      {canEdit && log.status === 'reported' && <ActionButton kind="edit" label={`Edit ${log.damageCode}`} onClick={() => onEdit(log)} />}
    </div>
  );
}

export default function DamageLogTable({ logs, page, pageSize, total, onPageChange, onViewDetails, onEdit, canEdit = true }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const actions = (log) => <ActionButtons log={log} onViewDetails={onViewDetails} onEdit={onEdit} canEdit={canEdit} />;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">Daftar Damage Log</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{total} laporan</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
          {Object.entries(statusMeta).map(([key, meta]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      <div className="table-container overflow-x-auto rounded-none border-0">
        <table className="table-modern damage-log-table damage-log-table--wide hidden md:table">
          <thead>
            <tr>
              <th className="col-no text-center">No</th>
              <th className="col-code">Item Code</th>
              <th>Description &amp; Log Code</th>
              <th className="col-date">Date</th>
              <th className="col-level">Level</th>
              <th className="col-status">Status</th>
              <th className="col-actions text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0
              ? logs.map((log, index) => {
                const meta = metaFor(log.status);
                return (
                  <tr key={log.id}>
                    <td className="text-center font-mono text-xs font-semibold text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className={`h-9 w-1 shrink-0 rounded-full ${meta.accent}`} aria-hidden="true" />
                        <span className="font-mono text-xs font-semibold text-slate-900">{log.equipmentItem?.assetCode || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <p className="text-sm font-semibold leading-snug text-slate-900">{log.description}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{log.damageCode}</p>
                    </td>
                    <td className="text-xs text-slate-600">{formatDate(log.damageDate)}</td>
                    <td><LevelBadge level={log.level} stopsOperation={log.stopsOperation} /></td>
                    <td>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${meta.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="text-center">{actions(log)}</td>
                  </tr>
                );
              })
              : <tr><td colSpan={7} className="py-14 text-center text-sm text-slate-500">No damage reports match the selected filters.</td></tr>}
          </tbody>
        </table>

        <table className="table-modern damage-log-table w-full md:hidden">
          <thead>
            <tr>
              <th className="col-no text-center">No</th>
              <th>Item Code</th>
              <th className="col-actions-mobile text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length > 0
              ? logs.map((log, index) => {
                const meta = metaFor(log.status);
                return (
                  <tr key={log.id}>
                    <td className="text-center font-mono text-xs font-semibold text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={`h-8 w-1 shrink-0 rounded-full ${meta.accent}`} aria-hidden="true" title={meta.label} />
                        <span className="font-mono text-xs font-semibold text-slate-900">{log.equipmentItem?.assetCode || '-'}</span>
                      </div>
                    </td>
                    <td className="text-center">{actions(log)}</td>
                  </tr>
                );
              })
              : <tr><td colSpan={3} className="py-12 text-center text-sm text-slate-500">No damage reports match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
        <span>Menampilkan {firstRow}–{lastRow} dari {total} laporan</span>
        <div className="flex items-center gap-1" aria-label="Pagination">
          <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="btn btn-secondary px-2.5 py-1 text-xs">‹ Prev</button>
          <span className="px-2 font-medium">Halaman {page} dari {pageCount}</span>
          <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} className="btn btn-secondary px-2.5 py-1 text-xs">Next ›</button>
        </div>
      </footer>
    </div>
  );
}
