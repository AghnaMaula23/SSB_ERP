// Data demo pengeluaran manual Finance (docs/claude_knowledge/plan-divisi-finance.md G8, F9).
// Lewat service yang dipakai controller — jurnal ikut lahir. Lampiran WAJIB, jadi seeder
// mengunggah satu PNG kecil ke storage; kalau storage tidak tersedia, demo ini dilewati
// (dicatat GAGAL) tanpa menghentikan seed. Idempoten: dilewati kalau sudah ada data.
const prisma = require('../../config/database.js');
const expenseSvc = require('../../modules/finance-accounting/manual-expense.service.js');
const { toDateOnly } = require('../../utils/shape.js');
const { todayDate } = require('../../utils/date.js');

// PNG 1×1 — cukup untuk lolos pemeriksaan jenis file
const DEMO_RECEIPT = {
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  originalName: 'kuitansi-demo.png',
  type: { ext: 'png', mime: 'image/png' },
};

const seedManualExpenseDemo = async () => {
  console.log('Seeding demo pengeluaran manual...');
  if (await prisma.financeManualExpense.count()) { console.log('  dilewati (sudah ada pengeluaran manual)'); return; }
  const finance = await prisma.user.findUnique({ where: { username: 'finance' }, select: { id: true } });
  try {
    const row = await expenseSvc.create({
      expenseDate: toDateOnly(todayDate()), amount: 2750000, payeeName: 'PT Telkom Indonesia', paymentMethod: 'transfer',
      description: 'Tagihan internet & telepon kantor', reason: 'Biaya kantor belum punya modul pengeluaran sendiri',
    }, [DEMO_RECEIPT], finance.id);
    console.log(`  - ${row.expenseCode} Rp${row.amount} (${row.journalEntries[0]?.journalCode})`);
  } catch (err) {
    console.log(`  - GAGAL ${err.message}`);
  }
};

module.exports = { seedManualExpenseDemo };
