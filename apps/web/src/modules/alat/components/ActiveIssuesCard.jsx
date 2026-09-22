import { useState } from 'react';
import { fixIssue } from '../services/alatService.js';

export default function ActiveIssuesCard({ issues = [], onFixed }) {
  const [fixingId, setFixingId] = useState(null);
  const [error, setError] = useState('');

  const handleFix = async (issueId) => {
    setError('');
    setFixingId(issueId);
    try {
      await fixIssue(issueId);
      onFixed(issueId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setFixingId(null);
    }
  };

  return (
    <section className="card-panel" aria-labelledby="active-issues-title">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 font-bold">
          ⚠️
        </div>
        <h2 id="active-issues-title" className="text-base font-bold text-slate-900">Active Issue Logs</h2>
      </div>

      <div className="p-6">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
        
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
                <button
                  type="button"
                  onClick={() => handleFix(issue.id)}
                  disabled={fixingId === issue.id}
                  className="btn btn-secondary py-1.5 px-3 text-xs shrink-0"
                >
                  {fixingId === issue.id ? 'Resolving...' : 'Mark Resolved'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

