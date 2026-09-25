function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename, rows, columns) {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(','));
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
