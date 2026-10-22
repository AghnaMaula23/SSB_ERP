const { PrismaClient } = require('@prisma/client');

// Batas default Prisma untuk transaksi interaktif hanya 5 detik. Lewat
// connection pooler Supabase satu putaran bisa melewatinya, sehingga transaksi
// gagal "Transaction already closed" padahal tidak ada konflik data. Dipasang
// sekali di sini supaya berlaku untuk SEMUA prisma.$transaction(async ...) —
// jangan disalin per service.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV !== 'production' ? ['query', 'warn', 'error'] : ['error'],
  transactionOptions: { maxWait: 15000, timeout: 30000 },
});
module.exports = prisma;
