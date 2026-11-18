const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { todayDate } = require('../../utils/date.js');
const { shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// TUTUP BUKU BULANAN (docs/claude_knowledge/plan-divisi-finance.md F3b).
//
// Jurnal bertanggal tanggal BISNIS sumber, jadi Finance bisa saja mencatat ke bulan
// lalu. Bulan yang sudah ditutup terkunci: tidak ada jurnal maupun dokumen sumber
// bertanggal bulan itu yang bisa dibuat. Status bulan tidak disimpan — tertutup =
// ada baris penutupan yang belum dibuka kembali.
//
// Penulis jurnal mengambil advisory lock SHARED sebelum memeriksa bulan; penutupan
// mengambil lock EXCLUSIVE. Jadi jurnal yang sedang ditulis dan penutupan bulan yang
// sama tidak bisa saling melewati.
// ============================================================

const PERIOD_LOCK_KEY = 770_116_001;

const pad2 = (n) => String(n).padStart(2, '0');
const periodOf = (date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
const periodKey = ({ year, month }) => `${year}-${pad2(month)}`;
const periodIndex = ({ year, month }) => year * 12 + (month - 1);
const periodFromIndex = (i) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });
const periodStart = ({ year, month }) => new Date(Date.UTC(year, month - 1, 1));
const periodEnd = ({ year, month }) => new Date(Date.UTC(year, month, 1)); // eksklusif

const parsePeriod = (value) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '');
  if (!match) throw httpError('Periode harus berformat YYYY-MM', 400);
  return { year: Number(match[1]), month: Number(match[2]) };
};

/**
 * Dokumen yang MENAHAN penutupan: masih menunggu keputusan dan tanggal bisnisnya di
 * bulan itu. Kalau bulan ditutup duluan, validasinya nanti pasti 409. Modul baru yang
 * menjurnal dengan tanggal bisnis menambah satu baris di sini.
 */
const BLOCKERS = [
  {
    key: 'field_expense_report',
    label: 'laporan realisasi kas lapangan menunggu validasi',
    count: (tx, range) => tx.fieldExpenseReport.count({ where: { status: 'submitted', reportDate: range } }),
  },
  {
    key: 'labor_payment_proof',
    label: 'bukti bayar upah menunggu validasi',
    count: (tx, range) => tx.fieldLaborWagePaymentProof.count({ where: { status: 'submitted', paymentDate: range } }),
  },
  {
    // Payroll ditahan per BULAN PAYROLL-nya (F3b-4), bukan tanggal bayar yang belum ada
    key: 'payroll',
    label: 'payroll bulan ini belum dibayar (draft/finalized)',
    count: (tx, range) => {
      const { year, month } = periodOf(range.gte);
      return tx.payroll.count({ where: { payrollYear: year, payrollMonth: month, status: { in: ['draft', 'finalized'] } } });
    },
  },
];

const blockersOf = async (client, period) => {
  const range = { gte: periodStart(period), lt: periodEnd(period) };
  const counts = await Promise.all(BLOCKERS.map((b) => b.count(client, range)));
  return BLOCKERS.map((b, i) => ({ key: b.key, label: b.label, count: counts[i] })).filter((b) => b.count > 0);
};

const activeClosing = (client, { year, month }) => client.accountingPeriodClosing.findFirst({
  where: { periodYear: year, periodMonth: month, reopenedAt: null },
});

/**
 * WAJIB dipanggil di dalam transaksi setiap jalur yang menulis jurnal atau menerima
 * tanggal bisnis dokumen keuangan. postJournal memanggilnya sendiri, jadi lapis
 * terakhirnya tidak bisa terlewat.
 */
const assertPeriodOpen = async (tx, date, label = 'Tanggal') => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(${PERIOD_LOCK_KEY})::text`;
  const period = periodOf(date);
  if (await activeClosing(tx, period)) {
    throw httpError(`${label} jatuh di bulan ${periodKey(period)} yang sudah ditutup bukunya. Minta Finance membuka kembali bulan itu, atau pakai tanggal di bulan yang masih terbuka.`, 409);
  }
};

/** Bulan jurnal paling awal — batas "bulan pertama GL" untuk urutan penutupan. */
const firstJournalPeriod = async (client) => {
  const first = await client.journalEntry.findFirst({ orderBy: { journalDate: 'asc' }, select: { journalDate: true } });
  return first ? periodOf(first.journalDate) : null;
};

const shapeClosing = (row) => ({
  id: row.id,
  notes: row.notes,
  closedBy: shapeActor(row.closedByUser),
  closedAt: row.closedAt,
  reopenedBy: shapeActor(row.reopenedByUser),
  reopenedAt: row.reopenedAt,
  reopenReason: row.reopenReason,
});

/** Dari bulan jurnal pertama (atau penutupan pertama) sampai bulan berjalan, terbaru dulu. */
const list = async () => {
  const current = periodOf(todayDate());
  const closings = await prisma.accountingPeriodClosing.findMany({
    include: { closedByUser: { select: ACTOR_SELECT }, reopenedByUser: { select: ACTOR_SELECT } },
    orderBy: { id: 'asc' },
  });
  const first = await firstJournalPeriod(prisma);
  const starts = [periodIndex(current), first && periodIndex(first),
    ...closings.map((c) => periodIndex({ year: c.periodYear, month: c.periodMonth }))].filter((x) => x !== null);
  const from = Math.min(...starts);

  const months = [];
  for (let i = periodIndex(current); i >= from; i -= 1) {
    const period = periodFromIndex(i);
    const rows = closings.filter((c) => c.periodYear === period.year && c.periodMonth === period.month);
    const active = rows.find((c) => !c.reopenedAt);
    months.push({
      period: periodKey(period),
      status: active ? 'closed' : 'open',
      isEnded: i < periodIndex(current),
      closing: active ? shapeClosing(active) : null,
      history: rows.filter((c) => c.reopenedAt).map(shapeClosing),
      blockers: active ? [] : await blockersOf(prisma, period),
    });
  }
  return months;
};

const close = async (value, { notes }, userId) => {
  const period = parsePeriod(value);
  const current = periodOf(todayDate());
  if (periodIndex(period) >= periodIndex(current)) {
    throw httpError(`Bulan ${periodKey(period)} belum berakhir — hanya bulan yang sudah lewat yang bisa ditutup`, 409);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PERIOD_LOCK_KEY})::text`;
    if (await activeClosing(tx, period)) throw httpError(`Bulan ${periodKey(period)} sudah ditutup`, 409);

    // Berurutan: bulan sebelumnya wajib tertutup, kecuali sebelum bulan jurnal pertama
    const previous = periodFromIndex(periodIndex(period) - 1);
    const first = await firstJournalPeriod(tx);
    if (first && periodIndex(previous) >= periodIndex(first) && !(await activeClosing(tx, previous))) {
      throw httpError(`Tutup dulu bulan ${periodKey(previous)} — penutupan buku berurutan`, 409);
    }

    const blockers = await blockersOf(tx, period);
    if (blockers.length) {
      const detail = blockers.map((b) => `${b.count} ${b.label}`).join('; ');
      throw httpError(`Bulan ${periodKey(period)} belum bisa ditutup: ${detail}. Putuskan dokumen itu dulu.`, 409);
    }

    const row = await tx.accountingPeriodClosing.create({
      data: { periodYear: period.year, periodMonth: period.month, notes: notes?.trim() || null, closedBy: userId },
      include: { closedByUser: { select: ACTOR_SELECT }, reopenedByUser: { select: ACTOR_SELECT } },
    });
    return { period: periodKey(period), status: 'closed', closing: shapeClosing(row) };
  });
};

/** Hanya bulan tertutup TERAKHIR — membuka bulan di tengah akan membuat urutan bolong. */
const reopen = async (value, { reason }, userId) => {
  const period = parsePeriod(value);
  if (!reason?.trim()) throw httpError('Alasan membuka kembali wajib diisi', 400);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PERIOD_LOCK_KEY})::text`;
    const latest = await tx.accountingPeriodClosing.findFirst({
      where: { reopenedAt: null }, orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
    if (!latest || latest.periodYear !== period.year || latest.periodMonth !== period.month) {
      const hint = latest ? ` Bulan tertutup terakhir: ${periodKey({ year: latest.periodYear, month: latest.periodMonth })}.` : '';
      throw httpError(`Hanya bulan tertutup terakhir yang bisa dibuka kembali.${hint}`, 409);
    }
    const row = await tx.accountingPeriodClosing.update({
      where: { id: latest.id },
      data: { reopenedBy: userId, reopenedAt: new Date(), reopenReason: reason.trim() },
      include: { closedByUser: { select: ACTOR_SELECT }, reopenedByUser: { select: ACTOR_SELECT } },
    });
    return { period: periodKey(period), status: 'open', reopened: shapeClosing(row) };
  });
};

module.exports = { assertPeriodOpen, list, close, reopen, BLOCKERS };
