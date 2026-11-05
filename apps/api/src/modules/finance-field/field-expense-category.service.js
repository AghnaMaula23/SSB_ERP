const prisma = require('../../config/database.js');

// Kategori biaya lapangan diisi SEEDER saja (L3) — modul ini hanya membaca.
// `activeOnly=false` untuk membaca dokumen lama yang memakai kategori nonaktif.
const list = ({ activeOnly = true }) => prisma.fieldExpenseCategory.findMany({
  where: activeOnly ? { isActive: true } : {},
  select: { id: true, categoryCode: true, categoryName: true, description: true, isActive: true },
  orderBy: { id: 'asc' },
});

module.exports = { list };
