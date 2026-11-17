const prisma = require('../../config/database.js');
const { normalBalanceOf } = require('./accounts.js');

// COA baca saja — isinya dari seeder (accounts.js), tanpa endpoint kelola (plan Finance F4).
const list = async ({ accountType, isActive }) => {
  const rows = await prisma.chartOfAccount.findMany({
    where: { ...(accountType && { accountType }), ...(isActive !== undefined && { isActive }) },
    orderBy: { accountCode: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    accountCode: r.accountCode,
    accountName: r.accountName,
    accountType: r.accountType,
    normalBalance: normalBalanceOf(r.accountType),
    description: r.description,
    isActive: r.isActive,
  }));
};

module.exports = { list };
