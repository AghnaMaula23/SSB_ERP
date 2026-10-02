const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Map error Prisma yang umum ke HTTP status yang wajar
const mapPrismaError = (err) => {
  if (err.code === 'P2002') {
    const fields = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'data';
    return { statusCode: 409, message: `Data sudah ada (duplikat pada: ${fields})` };
  }
  if (err.code === 'P2025') return { statusCode: 404, message: 'Data tidak ditemukan' };
  // P2003 muncul dari dua arah yang berlawanan: saat INSERT/UPDATE berarti data
  // acuannya tidak ada, saat DELETE berarti datanya masih dipakai. Menyamakan
  // pesannya membuat kasus pertama terbaca menyesatkan ("masih dipakai" padahal
  // justru tidak ada), jadi dibedakan lewat metode requestnya.
  if (err.code === 'P2003') {
    const field = err.meta?.field_name ? ` (${err.meta.field_name})` : '';
    return {
      statusCode: 409,
      message: `Data yang diacu tidak ditemukan atau masih dipakai relasi lain${field}`,
    };
  }
  return null;
};

const errorHandler = (err, req, res, next) => {
  const prismaError = mapPrismaError(err);

  const statusCode =
    prismaError?.statusCode ||
    err.statusCode ||
    err.status ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  const message = prismaError?.message || err.message || 'Terjadi kesalahan pada server';

  if (statusCode >= 500) console.error(`[ERROR] ${err.stack || err.message}`);
  else console.warn(`[WARN ${statusCode}] ${message}`);

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.errors && { errors: err.errors }),
    ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
