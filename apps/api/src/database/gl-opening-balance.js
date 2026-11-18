// Saldo awal GL (docs/claude_knowledge/plan-divisi-finance.md Q3): GL mulai dari nol,
// saldo kas di rekening saat go-live dicatat SEKALI — Dr Kas/Bank Induk Finance /
// Cr Modal / Saldo Awal. Angka & tanggal dari Finance.
//
//   npm run gl:opening-balance -- --amount=250000000 --date=2026-11-30 --user=finance
//
// Hanya satu jurnal saldo awal (sourceId tetap 1, dijaga unique index satu-jurnal-per-
// sumber); menjalankan ulang ditolak. Koreksi = hubungi pemilik schema (belum ada void).
require('dotenv').config();
const prisma = require('../config/database.js');
const { postJournal } = require('../modules/finance-accounting/journal.service.js');
const { ACCOUNTS } = require('../modules/finance-accounting/accounts.js');
const { assertNotFuture } = require('../utils/date.js');

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const OPENING_SOURCE_ID = 1;

(async () => {
  try {
    const amount = Number(arg('amount'));
    const date = arg('date');
    const username = arg('user');
    if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !username) {
      throw new Error('Pemakaian: --amount=<rupiah > 0> --date=YYYY-MM-DD --user=<username Finance>');
    }
    const journalDate = assertNotFuture(date, 'Tanggal saldo awal');
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new Error(`User ${username} tidak ditemukan`);
    const existing = await prisma.journalEntry.findFirst({ where: { sourceType: 'opening_balance' }, select: { journalCode: true } });
    if (existing) throw new Error(`Saldo awal sudah dicatat (${existing.journalCode})`);

    const journal = await prisma.$transaction((tx) => postJournal(tx, {
      sourceType: 'opening_balance', sourceId: OPENING_SOURCE_ID, journalDate,
      description: 'Saldo awal kas saat GL mulai dipakai',
      lines: [{ account: ACCOUNTS.CASH, debit: amount }, { account: ACCOUNTS.OPENING_EQUITY, credit: amount }],
      userId: user.id,
    }));
    console.log(`[GL] saldo awal dicatat: ${journal.journalCode} ${date} Rp${amount}`);
  } catch (err) {
    console.error(`[GL] saldo awal gagal: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
