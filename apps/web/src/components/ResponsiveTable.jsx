import { Fragment } from 'react';

/**
 * Tabel responsif untuk modul Admin.
 *
 * Desktop  → tabel biasa (`.table-modern`), sama seperti Divisi Alat.
 * Mobile  → tiap baris jadi kartu: kolom utama jadi judul, kolom lain jadi
 *            baris label/nilai, dan aksi punya area sendiri. Lebar kartu
 *            dikunci supaya nyaman di layar phone (mis. iPhone 16 Pro Max,
 *            440px) tanpa tabel yang harus digeser horizontal.
 *
 * `columns`:
 *   { key, label, render(row, index), align?: 'left'|'center'|'right',
 *     primary?: boolean, hideOnMobile?: boolean, className?: string }
 */
export default function ResponsiveTable({
  columns = [],
  rows = [],
  rowKey,
  empty = 'Belum ada data.',
  loading = false,
  loadingText = 'Memuat data...',
  error = null,
  cardFooter,
  expandedRow,
  className = '',
}) {
  const visible = columns.filter((column) => !column.hidden);
  const primary = visible.find((column) => column.primary) || visible[0];
  const rest = visible.filter((column) => column !== primary);

  const alignClass = (align) => (align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left');

  if (loading) {
    return <div className={`card-panel p-12 text-center text-sm text-slate-500 ${className}`}>{loadingText}</div>;
  }

  if (error) {
    return <div className={`card-panel p-12 text-center text-sm text-red-600 ${className}`}>{error}</div>;
  }

  if (!rows.length) {
    return <div className={`card-panel p-12 text-center text-sm text-slate-500 ${className}`}>{empty}</div>;
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="table-modern">
          <thead>
            <tr>
              {visible.map((column) => (
                <th key={column.key} className={alignClass(column.align)}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey ? rowKey(row) : row.id ?? index;
              const extra = expandedRow ? expandedRow(row, index) : null;
              return (
                <Fragment key={key}>
                  <tr>
                    {visible.map((column) => (
                      <td key={column.key} className={`${alignClass(column.align)} ${column.className || ''}`}>
                        {column.render ? column.render(row, index) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                  {extra && (
                    <tr className="bg-red-50/60">
                      <td colSpan={visible.length}>{extra}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile — kartu */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((row, index) => {
          const extra = expandedRow ? expandedRow(row, index) : null;
          return (
            <li key={rowKey ? rowKey(row) : row.id ?? index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {primary && (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{primary.render ? primary.render(row, index) : row[primary.key]}</p>
                    {primary.sub && <p className="mt-0.5 truncate text-[11px] text-slate-500">{primary.sub(row)}</p>}
                  </div>
                  {primary.badge && <div className="shrink-0">{primary.badge(row)}</div>}
                </div>
              )}

              {rest.length > 0 && (
                <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {rest.map((column) => (
                    <div key={column.key} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{column.label}</dt>
                      <dd className="min-w-0 text-right text-xs font-medium text-slate-700">{column.render ? column.render(row, index) : row[column.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {extra && <div className="mt-3 border-t border-slate-100 pt-3">{extra}</div>}
              {cardFooter && <div className="mt-3 border-t border-slate-100 pt-3">{cardFooter(row, index)}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
