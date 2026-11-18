import { formatCurrency, formatNumber, subProjectTypeLabel } from '../../admin/project/utils/projectFormat.js';

/** Rincian klaim pendapatan alat per konteks → unit (bentuk `contexts` dari backend). */
export default function ClaimContexts({ contexts = [] }) {
  if (!contexts.length) return <p className="text-xs text-slate-500">Tidak ada jam kerja.</p>;
  return (
    <div className="space-y-3">
      {contexts.map((ctx) => (
        <div key={`${ctx.contextType}-${ctx.subProjectId ?? ctx.id}`} className="rounded-lg border border-slate-200">
          <p className="flex flex-wrap justify-between gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            <span>{ctx.contextType === 'rental' ? '🛠️' : '🏗️'} {ctx.code} {ctx.name}{ctx.subProjectType ? ` · ${subProjectTypeLabel(ctx.subProjectType)}` : ''}</span>
            <span className="font-mono">{formatNumber(ctx.totalHours)} jam · {formatCurrency(ctx.totalAmount)}</span>
          </p>
          <ul>
            {ctx.units.map((unit) => (
              <li key={`${unit.equipmentItemId}-${unit.rate}`} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-xs">
                <span>{unit.typeName} · {unit.assetCode} <span className="text-slate-400">({unit.logs.length} catatan)</span></span>
                <span className="font-mono">{formatNumber(unit.hours)} jam × {formatCurrency(unit.rate)} = <b>{formatCurrency(unit.amount)}</b></span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
