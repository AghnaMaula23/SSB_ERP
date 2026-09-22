const sourceLabels = { warehouse: 'WAREHOUSE', supplier: 'SUPPLIER' };
const mechanicLabels = { internal: 'INTERNAL', external: 'EKSTERNAL' };
const crashLevel = (stopsOperation) => stopsOperation ? { label: 'CRITICAL', tone: 'red' } : { label: 'MINOR', tone: 'green' };

function Badge({ children, tone = 'blue' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '-';

export default function DamageLogTable({ logs, page, pageSize, total, onPageChange, onEdit, onResolve, onCancel }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="table-container">
      <table className="table-modern damage-log-table">
        <thead>
          <tr>
            <th className="w-12 text-center">No</th>
            <th>Item Code</th>
            <th>Description & Log Code</th>
            <th>Date</th>
            <th>Level</th>
            <th>Spare Part</th>
            <th>Mechanic</th>
            <th className="text-center">Status</th>
            <th className="w-24 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.length > 0 ? (
            logs.map((log, index) => {
              const level = crashLevel(log.stopsOperation);
              return (
                <tr key={log.id}>
                  <td className="text-center text-xs font-medium text-slate-500">
                    {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                  </td>
                  <td>
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {log.equipmentItem?.assetCode || '-'}
                    </span>
                  </td>
                  <td>
                    <p className="font-semibold text-slate-900">{log.description}</p>
                    <p className="font-mono text-[11px] text-slate-400">{log.damageCode}</p>
                  </td>
                  <td className="text-xs text-slate-600">{formatDate(log.damageDate)}</td>
                  <td><Badge tone={level.tone}>{level.label}</Badge></td>
                  <td><Badge tone={log.sparePartSource === 'warehouse' ? 'green' : 'amber'}>{sourceLabels[log.sparePartSource] || '-'}</Badge></td>
                  <td><Badge tone={log.mechanicTeam === 'internal' ? 'blue' : 'red'}>{mechanicLabels[log.mechanicTeam] || '-'}</Badge></td>
                  <td className="text-center">
                    <Badge tone={log.status === 'resolved' ? 'green' : log.status === 'cancelled' ? 'red' : 'amber'}>
                      {log.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(log)}
                        className="btn btn-ghost px-2 py-1 text-xs"
                        aria-label={`Edit ${log.damageCode}`}
                        title="Edit Log"
                      >
                        ↗
                      </button>
                      {log.status === 'reported' && (
                        <button
                          type="button"
                          onClick={() => onResolve(log)}
                          className="btn btn-ghost px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50"
                          aria-label={`Resolve ${log.damageCode}`}
                          title="Resolve Log"
                        >
                          ✓
                        </button>
                      )}
                      {(log.status === 'reported' || log.status === 'resolved') && (
                        <button
                          type="button"
                          onClick={() => onCancel(log)}
                          className="btn btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          aria-label={`Cancel ${log.damageCode}`}
                          title="Cancel Log"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                No damage reports match the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span>Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} logs</span>
        <div className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            className="btn btn-secondary px-2.5 py-1 text-xs"
          >
            ‹ Prev
          </button>
          <span className="px-2 font-medium">Page {page} of {pageCount}</span>
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => onPageChange(page + 1)}
            className="btn btn-secondary px-2.5 py-1 text-xs"
          >
            Next ›
          </button>
        </div>
      </footer>
    </div>
  );
}

