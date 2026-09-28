import { useState } from 'react';
import ActionButton from '../../../components/ActionButton.jsx';
import { recordActivity } from '../../../services/activityLogService.js';
import DamageLogActionModal from '../information/components/DamageLogActionModal.jsx';
import { hasPermission } from '../../../services/permissions.js';

export default function ActiveIssuesCard({ issues = [], onFixed, onViewDetails }) {
  const [selectedIssue, setSelectedIssue] = useState(null);
  const canUpdate = hasPermission('damage:update');

  return (
    <section className="card-panel" aria-labelledby="active-issues-title">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 font-bold">
          ⚠️
        </div>
        <h2 id="active-issues-title" className="text-base font-bold text-slate-900">Active Issue Logs</h2>
      </div>

      <div className="p-6">
        {issues.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
            No active damage issues reported for this equipment unit.
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {issue.damageCode && <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">{issue.damageCode}</span>}
                    <h3 className="text-sm font-bold text-slate-900">{issue.description || issue.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Reported: {issue.damageDate || issue.reportedAt || (issue.createdAt ? String(issue.createdAt).slice(0, 10) : '-')}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                    <span>Spare Part: <strong className="capitalize">{issue.sparePartSource || 'Warehouse'}</strong></span>
                    <span>Mechanic: <strong className="capitalize">{issue.mechanicTeam || 'Internal'}</strong></span>
                    {issue.stopsOperation && <span className="font-semibold text-red-600">⛔ Halts Operation</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ActionButton
                    kind="view"
                    label={`Lihat detail ${issue.damageCode || 'damage log'}`}
                    onClick={() => onViewDetails?.(issue)}
                    disabled={!onViewDetails}
                  />
                  <ActionButton
                    kind="resolve"
                    tone="success"
                    label={canUpdate ? `Tandai selesai ${issue.damageCode || 'damage log'}` : 'Anda tidak memiliki izin memperbarui damage log'}
                    onClick={() => setSelectedIssue(issue)}
                    disabled={!canUpdate}
                    className="px-3 py-1.5"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DamageLogActionModal
        key={selectedIssue?.id || 'no-issue'}
        log={selectedIssue}
        action="resolve"
        onClose={() => setSelectedIssue(null)}
        onSaved={() => {
          if (selectedIssue && onFixed) onFixed(selectedIssue.id);
          if (selectedIssue) {
            recordActivity({
              module: 'Information',
              action: 'Active issue diselesaikan',
              description: `${selectedIssue.damageCode || 'Damage log'} · ${selectedIssue.description || ''}`.slice(0, 160),
            });
          }
          setSelectedIssue(null);
        }}
      />
    </section>
  );
}
