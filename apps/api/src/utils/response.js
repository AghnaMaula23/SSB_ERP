// `meta` opsional untuk keterangan di luar data, mis. `skipped` pada pembuatan payroll.
const success = (res, data, message = 'Success', statusCode = 200, meta) => {
  return res.status(statusCode).json({ success: true, message, data, ...(meta !== undefined && { meta }) });
};
const created = (res, data, message = 'Created', meta) => success(res, data, message, 201, meta);
// `summary` opsional: ringkasan atas SELURUH baris yang cocok filter (bukan hanya
// halaman ini), dikirim di meta.summary. Sebelumnya field ini dibuang diam-diam.
const paginated = (res, { data, total, page, limit, summary }) => {
  return res.status(200).json({
    success: true, data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit), ...(summary !== undefined && { summary }) },
  });
};
module.exports = { success, created, paginated };
