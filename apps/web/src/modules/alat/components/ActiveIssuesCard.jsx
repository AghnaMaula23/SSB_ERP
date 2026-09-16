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
    <section aria-labelledby="active-issues-title">
      <h2 id="active-issues-title" className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#334155]"><span className="text-red-600" aria-hidden="true">⚠</span>Log Kerusakan Aktif</h2>
      {error && <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}
      {issues.length === 0 ? <div className="border border-[#cbd5e1] bg-white px-4 py-5 text-xs text-[#64748b]">Tidak ada kerusakan aktif.</div> : <div className="space-y-2">{issues.map((issue) => <article key={issue.id} className="grid gap-4 border border-red-200 bg-[#ffe1df] p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"><span className="grid h-10 w-10 place-items-center rounded bg-white text-lg text-red-600" aria-hidden="true">⚠</span><div><h3 className="text-xs font-bold text-red-800">{issue.title || issue.description}</h3><p className="mt-1 text-[10px] text-red-700">◷ Reported {issue.reportedAt || issue.createdAt || '-'}</p><div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[10px] text-red-700"><span><strong className="block font-normal uppercase">Spare part source</strong><b>{issue.sparePartSource || 'Warehouse'}</b></span><span><strong className="block font-normal uppercase">Assigned team</strong><b>{issue.assignedTeam || 'Internal'}</b></span></div></div><button type="button" onClick={() => handleFix(issue.id)} disabled={fixingId === issue.id} className="rounded bg-[#c71f25] px-3 py-2 text-[10px] font-bold text-white transition hover:bg-[#a9181d] disabled:cursor-not-allowed disabled:opacity-60">{fixingId === issue.id ? 'Fixing...' : 'Fix Issue'}</button></article>)}</div>}
    </section>
  );
}
