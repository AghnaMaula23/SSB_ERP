const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};
const created = (res, data, message = 'Created') => success(res, data, message, 201);
// `summary` opsional: ringkasan atas SELURUH baris yang cocok filter (bukan hanya
// halaman ini), dikirim di meta.summary. Sebelumnya field ini dibuang diam-diam.
const paginated = (res, { data, total, page, limit, summary }) => {
  return res.status(200).json({
    success: true, data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit), ...(summary !== undefined && { summary }) },
  });
};
module.exports = { success, created, paginated };
