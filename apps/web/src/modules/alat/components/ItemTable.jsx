const statusStyles = {
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not Available': 'bg-slate-100 text-slate-700 border-slate-200',
  'Delivery to Palembang': 'bg-blue-50 text-blue-700 border-blue-200',
  'Delivery to Subang': 'bg-blue-50 text-blue-700 border-blue-200',
  'Maintenance Due': 'bg-amber-50 text-amber-700 border-amber-200',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {status}
    </span>
  );
}

export default function ItemTable({ items, totalItems, page, pageSize, onPageChange, onViewDetails, onDelete }) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="table-container">
      <table className="table-modern">
        <thead>
          <tr>
            <th className="w-12 text-center">No</th>
            <th>Item Code</th>
            <th>Jenis</th>
            <th>Merk</th>
            <th>Type / Model</th>
            <th className="text-center">Status</th>
            <th className="w-20 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? (
            items.map((item, index) => (
              <tr key={item.id}>
                <td className="text-center text-xs font-medium text-slate-500">
                  {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                </td>
                <td>
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-800">
                    {item.itemCode}
                  </span>
                </td>
                <td className="font-semibold text-slate-900">{item.jenis}</td>
                <td className="text-slate-700">{item.merk}</td>
                <td className="text-slate-600">{item.typeModel}</td>
                <td className="text-center">
                  <StatusBadge status={item.status} />
                </td>
                <td className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewDetails(item.id)}
                      className="btn btn-ghost px-2 py-1 text-xs"
                      aria-label={`View details for ${item.itemCode}`}
                      title="View Details"
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      className="btn btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Archive ${item.itemCode}`}
                      title="Archive Item"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="py-12 text-center text-sm text-slate-500">
                No equipment items match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span>Showing {firstItem}–{lastItem} of {totalItems} items</span>
        <div className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="btn btn-secondary px-2.5 py-1 text-xs"
            aria-label="Previous page"
          >
            ‹ Prev
          </button>
          <span className="px-2 font-medium">Page {page} of {pageCount}</span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === pageCount}
            className="btn btn-secondary px-2.5 py-1 text-xs"
            aria-label="Next page"
          >
            Next ›
          </button>
        </div>
      </footer>
    </div>
  );
}

