// Teks isian user yang diawali karakter ini dijalankan Excel sebagai rumus
// (mis. `=HYPERLINK(...)`). Awalan `'` membuatnya terbaca sebagai teks. Hanya
// untuk string; pengisi kosong "-" dan angka seperti "-1.5" dibiarkan.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

const looksLikeFormula = (text) => FORMULA_START.test(text) && text !== '-' && !PLAIN_NUMBER.test(text);

function escapeCsv(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && looksLikeFormula(text)) text = `'${text}`;
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
