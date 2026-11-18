const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { toNumber, toDateOnly } = require('../../utils/shape.js');
const { normalBalanceOf } = require('./accounts.js');
const { sourceCodesOf, shapeSource } = require('./journal.service.js');

// ============================================================
// LAPORAN GL (docs/claude_knowledge/plan-divisi-finance.md F25): buku besar per akun
// dan neraca saldo. Saldo TIDAK disimpan — dijumlahkan dari baris jurnal saat dibaca
// (prinsip "saldo dihitung saat dibaca"). Saldo bertanda menurut sisi normal akun:
// positif = saldo normal (asset/expense di debit; liability/equity/revenue di kredit).
// Jurnal balik ikut dihitung apa adanya, jadi dokumen yang di-void saling meniadakan.
// ============================================================

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const signOf = (accountType) => (normalBalanceOf(accountType) === 'debit' ? 1 : -1);

const ACCOUNT_SELECT = { id: true, accountCode: true, accountName: true, accountType: true, isActive: true };
const shapeAccount = (a) => ({ ...a, normalBalance: normalBalanceOf(a.accountType) });

/** Buku besar satu akun: saldo awal (sebelum startDate) + mutasi + saldo berjalan. */
const accountLedger = async (accountId, { startDate, endDate }) => {
  const account = await prisma.chartOfAccount.findUnique({ where: { id: accountId }, select: ACCOUNT_SELECT });
  if (!account) throw httpError('Akun tidak ditemukan', 404);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) throw httpError('endDate tidak boleh sebelum startDate', 400);
  const sign = signOf(account.accountType);

  const [opening, lines] = await Promise.all([
    prisma.journalEntryLine.aggregate({
      where: { accountId, journalEntry: { journalDate: { lt: start } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.journalEntryLine.findMany({
      where: { accountId, journalEntry: { journalDate: { gte: start, lte: end } } },
      include: { journalEntry: { select: { id: true, journalCode: true, journalDate: true, description: true, sourceType: true, sourceId: true, reversalOfJournalEntryId: true } } },
      orderBy: [{ journalEntry: { journalDate: 'asc' } }, { journalEntryId: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const openingBalance = round2(sign * (toNumber(opening._sum.debit ?? 0) - toNumber(opening._sum.credit ?? 0)));
  const codes = await sourceCodesOf(lines.map((l) => l.journalEntry));

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries = lines.map((l) => {
    const debit = toNumber(l.debit);
    const credit = toNumber(l.credit);
    totalDebit += debit;
    totalCredit += credit;
    running = round2(running + sign * (debit - credit));
    const j = l.journalEntry;
    return {
      journalEntryId: j.id,
      journalDate: toDateOnly(j.journalDate),
      journalCode: j.journalCode,
      description: l.description ?? j.description,
      source: shapeSource(j, codes),
      isReversal: j.reversalOfJournalEntryId !== null,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return {
    account: shapeAccount(account),
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    openingBalance,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closingBalance: running,
    entries,
  };
};

/**
 * Neraca saldo per tanggal: per akun Σ debit, Σ kredit s.d. `date`, dan saldo bertanda
 * sisi normal. Akun nonaktif hanya ikut kalau punya mutasi. `totals.isBalanced` = Σ debit = Σ kredit.
 */
const trialBalance = async ({ date }) => {
  const asOf = new Date(date);
  const [accounts, sums] = await Promise.all([
    prisma.chartOfAccount.findMany({ select: ACCOUNT_SELECT, orderBy: { accountCode: 'asc' } }),
    prisma.$queryRaw`
      SELECT l.account_id, SUM(l.debit) AS debit, SUM(l.credit) AS credit
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id
      WHERE j.journal_date <= ${asOf}::date
      GROUP BY l.account_id`,
  ]);
  const byAccount = new Map(sums.map((s) => [s.account_id, s]));
  const rows = accounts
    .filter((a) => a.isActive || byAccount.has(a.id))
    .map((a) => {
      const s = byAccount.get(a.id);
      const debit = round2(toNumber(s?.debit ?? 0));
      const credit = round2(toNumber(s?.credit ?? 0));
      return { account: shapeAccount(a), debit, credit, balance: round2(signOf(a.accountType) * (debit - credit)) };
    });
  const totalDebit = round2(rows.reduce((t, r) => t + r.debit, 0));
  const totalCredit = round2(rows.reduce((t, r) => t + r.credit, 0));
  return { date: toDateOnly(asOf), accounts: rows, totals: { debit: totalDebit, credit: totalCredit, isBalanced: totalDebit === totalCredit } };
};

module.exports = { accountLedger, trialBalance };
