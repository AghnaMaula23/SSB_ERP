const statusStyles = {
  Available: 'border-[#b8dfd4] bg-[#e0f2ed] text-[#007b64]',
  'Not Available': 'border-[#ddd6b4] bg-[#f1efdf] text-[#806800]',
  'Delivery to Palembang': 'border-[#b9d9e8] bg-[#e0f1f8] text-[#08729a]',
  'Delivery to Subang': 'border-[#b9d9e8] bg-[#e0f1f8] text-[#08729a]',
  'Maintenance Due': 'border-[#f0d59d] bg-[#fff5db] text-[#956b00]',
};

function StatusPill({ status }) {
  return <span className={`inline-flex whitespace-nowrap border px-2 py-0.5 text-[9px] font-semibold ${statusStyles[status] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>{status}</span>;
}

export default function ItemTable({ items, totalItems, page, pageSize, onPageChange, onViewDetails, onDelete }) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <section className="overflow-hidden border border-[#cbd5e1] bg-[#f8fafc]" aria-label="Equipment items">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-[#e2e8f0] text-[8px] font-bold tracking-wide text-[#334155]">
            <tr>
              <th className="w-12 px-3 py-2">No</th>
              <th className="px-3 py-2">Item Code</th>
              <th className="px-3 py-2">Jenis</th>
              <th className="px-3 py-2">Merk</th>
              <th className="px-3 py-2">Type / Model</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="w-14 px-3 py-2 text-center">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e2e8f0] text-[9px] text-[#1e293b]">
            {items.length > 0 ? items.map((item, index) => (
              <tr key={item.id} className="h-[52px] transition hover:bg-[#f1f5f9]">
                <td className="px-3 py-2 font-medium">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                <td className="px-3 py-2"><span className="bg-[#e5edf2] px-1.5 py-1 font-medium text-[#08729a]">{item.itemCode}</span></td>
                <td className="px-3 py-2 font-semibold">{item.jenis}</td>
                <td className="px-3 py-2 font-semibold">{item.merk}</td>
                <td className="px-3 py-2 font-semibold">{item.typeModel}</td>
                <td className="px-3 py-2 text-center"><StatusPill status={item.status} /></td>
                <td className="px-3 py-2 text-center"><div className="flex items-center justify-center gap-2"><button type="button" onClick={() => onViewDetails(item.id)} className="text-base text-[#475569] hover:text-[#08729a]" aria-label={`View details for ${item.itemCode}`}>↗</button><button type="button" onClick={() => onDelete(item)} className="text-xs text-red-500 hover:text-red-700" aria-label={`Archive ${item.itemCode}`}>✕</button></div></td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="px-3 py-10 text-center text-xs text-[#64748b]">No equipment items match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-[#cbd5e1] bg-[#e8eef5] px-3 py-2 text-[10px] text-[#475569]">
        <span>Showing {firstItem}-{lastItem} of {totalItems} items</span>
        <div className="flex items-center gap-1" aria-label="Pagination">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="grid h-6 w-6 place-items-center border border-[#cbd5e1] bg-[#f8fafc] text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page">‹</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 4).map((pageNumber) => <button type="button" key={pageNumber} onClick={() => onPageChange(pageNumber)} className={`grid h-6 w-6 place-items-center border text-[10px] ${page === pageNumber ? 'border-[#08729a] bg-[#08729a] text-white' : 'border-[#cbd5e1] bg-[#f8fafc] text-[#334155] hover:bg-white'}`}>{pageNumber}</button>)}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === pageCount} className="grid h-6 w-6 place-items-center border border-[#cbd5e1] bg-[#f8fafc] text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page">›</button>
        </div>
      </footer>
    </section>
  );
}
