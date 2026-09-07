const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};
const created = (res, data, message = 'Created') => success(res, data, message, 201);
const paginated = (res, { data, total, page, limit }) => {
  return res.status(200).json({
    success: true, data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};
module.exports = { success, created, paginated };
