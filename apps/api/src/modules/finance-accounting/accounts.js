// ============================================================
// Daftar akun (COA) — SATU-SATUNYA sumber, dipakai seeder dan kode posting
// (docs/claude_knowledge/plan-divisi-finance.md F4). Perusahaan belum punya COA
// sendiri, jadi daftar usulan rencana dipakai. Akun baru = baris di sini + pemetaan
// di modul sumbernya, satu commit. Akun tidak dihapus: yang tidak dipakai lagi
// diberi isActive: false.
//
// Penomoran: 1 aset, 2 kewajiban, 3 ekuitas, 4 pendapatan, 5 HPP, 6 beban.
// ============================================================

const ACCOUNTS = {
  CASH: '1-1100',
  RECEIVABLE: '1-1200',
  OPENING_EQUITY: '3-1000',
  REVENUE_CONSTRUCTION: '4-1100',
  REVENUE_RENTAL: '4-1200',
  REVENUE_MATERIAL: '4-1300',
  COGS_SUPPLY_MATERIAL: '5-1100',
  EXPENSE_PROJECT_MATERIAL: '6-1100',
  EXPENSE_FIELD_OPERATIONS: '6-1200',
  EXPENSE_DAILY_WAGES: '6-1300',
  EXPENSE_EQUIPMENT_ALLOCATION: '6-1400',
  EXPENSE_SALARIES: '6-2100',
  EXPENSE_MANUAL: '6-9100',
};

const CHART_OF_ACCOUNTS = [
  { accountCode: ACCOUNTS.CASH, accountName: 'Kas/Bank Induk Finance', accountType: 'asset', description: 'Semua uang keluar/masuk rekening perusahaan (satu akun, F5)' },
  { accountCode: ACCOUNTS.RECEIVABLE, accountName: 'Piutang Usaha', accountType: 'asset', description: 'Tagihan klien yang sudah diverifikasi dan belum dibayar' },
  { accountCode: ACCOUNTS.OPENING_EQUITY, accountName: 'Modal / Saldo Awal', accountType: 'equity', description: 'Lawan saldo awal saat GL mulai dipakai (Q3)' },
  { accountCode: ACCOUNTS.REVENUE_CONSTRUCTION, accountName: 'Pendapatan Kontrak Konstruksi', accountType: 'revenue', description: 'Tagihan progress tahapan konstruksi' },
  { accountCode: ACCOUNTS.REVENUE_RENTAL, accountName: 'Pendapatan Sewa Alat', accountType: 'revenue', description: 'Tagihan rental alat per jam kerja' },
  { accountCode: ACCOUNTS.REVENUE_MATERIAL, accountName: 'Pendapatan Penjualan Material', accountType: 'revenue', description: 'Tagihan supply material per penerimaan' },
  { accountCode: ACCOUNTS.COGS_SUPPLY_MATERIAL, accountName: 'HPP Material Supply', accountType: 'expense', description: 'Dana request material kontrak supply (dijual lagi ke klien)' },
  { accountCode: ACCOUNTS.EXPENSE_PROJECT_MATERIAL, accountName: 'Beban Material Proyek', accountType: 'expense', description: 'Dana request material tahapan konstruksi (dipakai sendiri)' },
  { accountCode: ACCOUNTS.EXPENSE_FIELD_OPERATIONS, accountName: 'Beban Operasional Lapangan', accountType: 'expense', description: 'Laporan realisasi kas lapangan yang divalidasi' },
  { accountCode: ACCOUNTS.EXPENSE_DAILY_WAGES, accountName: 'Beban Upah Harian Project', accountType: 'expense', description: 'Bukti bayar upah pekerja yang divalidasi' },
  { accountCode: ACCOUNTS.EXPENSE_EQUIPMENT_ALLOCATION, accountName: 'Beban Alokasi Dana Divisi Alat', accountType: 'expense', description: 'Klaim pendapatan alat yang disetujui (Kas Alat bukan akun GL)' },
  { accountCode: ACCOUNTS.EXPENSE_SALARIES, accountName: 'Beban Gaji Karyawan Tetap', accountType: 'expense', description: 'Payroll bulanan yang dibayar' },
  { accountCode: ACCOUNTS.EXPENSE_MANUAL, accountName: 'Beban Pengeluaran Manual Finance', accountType: 'expense', description: 'Pengeluaran Finance yang belum punya modul sendiri' },
].map((a) => ({ isActive: true, ...a }));

/** Saldo normal diturunkan dari jenis akun, tidak disimpan. */
const normalBalanceOf = (accountType) => (['asset', 'expense'].includes(accountType) ? 'debit' : 'credit');

module.exports = { ACCOUNTS, CHART_OF_ACCOUNTS, normalBalanceOf };
