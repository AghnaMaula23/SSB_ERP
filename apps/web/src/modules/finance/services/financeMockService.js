// ============================================================
// DATA CONTOH — Finance Accounting & Payroll Karyawan.
//
// Backend /api/finance-accounting dan /api/payroll BELUM ADA (masih
// dikomentari di app.js). Layar Chart of Accounts, General Ledger, dan Gaji
// Bulanan Staf memakai data contoh di localStorage browser ini, dibersihkan
// saat sign out. Bentuk datanya mengikuti ERD Finance Accounting & Payroll
// Karyawan supaya isi fungsi di file ini cukup diganti apiRequest nanti.
// Semua fungsi async supaya pemanggil tidak perlu berubah.
// ============================================================

const KEYS = {
  accounts: 'finance_mock_accounts',
  journals: 'finance_mock_journals',
  employees: 'finance_mock_employees',
  payroll: 'finance_mock_payroll',
  alatIncome: 'finance_mock_alat_income',
};
export const FINANCE_MOCK_KEYS = Object.values(KEYS);

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
const year = new Date().getFullYear();

function read(key, seed) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (stored) return stored;
  } catch {
    // jatuh ke data awal
  }
  const initial = seed();
  localStorage.setItem(key, JSON.stringify(initial));
  return JSON.parse(JSON.stringify(initial));
}
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

// ---------------- Chart of Accounts ----------------

export const ACCOUNT_TYPES = {
  asset: { label: 'Aset', normal: 'debit', prefix: '1' },
  liability: { label: 'Kewajiban', normal: 'credit', prefix: '2' },
  equity: { label: 'Ekuitas', normal: 'credit', prefix: '3' },
  revenue: { label: 'Pendapatan', normal: 'credit', prefix: '4' },
  expense: { label: 'Beban', normal: 'debit', prefix: '5' },
};

const ACCOUNT_SEED = () => [
  ['1-1001', 'Kas Kecil', 'asset'], ['1-1002', 'Bank BCA - Main Account', 'asset'], ['1-1003', 'Kas Divisi Alat', 'asset'],
  ['1-1100', 'Piutang Karyawan', 'asset'], ['1-1200', 'Piutang Usaha', 'asset'], ['1-1300', 'Persediaan Material', 'asset'],
  ['1-2001', 'Alat Berat', 'asset'],
  ['2-1001', 'Hutang Dagang', 'liability'], ['2-1002', 'Hutang Gaji', 'liability'], ['2-1003', 'Hutang BPJS & PPh 21', 'liability'],
  ['3-1001', 'Modal Disetor', 'equity'], ['3-2001', 'Laba Ditahan', 'equity'],
  ['4-1001', 'Pendapatan Kontrak Proyek', 'revenue'], ['4-1002', 'Pendapatan Rental Alat', 'revenue'], ['4-1003', 'Pendapatan Supply Material', 'revenue'],
  ['5-1001', 'Beban Gaji Staf', 'expense'], ['5-1002', 'Beban Pemeliharaan Kendaraan', 'expense'], ['5-1003', 'Beban Upah Harian Proyek', 'expense'],
  ['5-2001', 'Beban Material Proyek', 'expense'], ['5-2005', 'Beban Bahan Bakar & Pelumas', 'expense'], ['5-3001', 'Beban Operasional Lapangan', 'expense'],
].map(([code, name, type], index) => ({ id: index + 1, code, name, type, description: '', isActive: true }));

export async function listAccounts() {
  return read(KEYS.accounts, ACCOUNT_SEED).sort((a, b) => a.code.localeCompare(b.code));
}

/** Tambah (tanpa `id`) atau ubah akun. Kode unik, dan berawalan sesuai jenisnya. */
export async function saveAccount(account) {
  const rows = await listAccounts();
  const code = account.code.trim();
  if (!/^\d-\d{4}$/.test(code)) throw new Error('Kode akun berformat N-NNNN, contoh 5-2005.');
  if (!code.startsWith(ACCOUNT_TYPES[account.type].prefix)) throw new Error(`Akun ${ACCOUNT_TYPES[account.type].label} berawalan ${ACCOUNT_TYPES[account.type].prefix}-.`);
  if (rows.some((row) => row.code === code && row.id !== account.id)) throw new Error(`Kode ${code} sudah dipakai.`);
  const used = (await listJournals()).some((journal) => journal.lines.some((line) => line.accountCode === rows.find((row) => row.id === account.id)?.code));
  if (account.id && used && rows.find((row) => row.id === account.id).code !== code) throw new Error('Kode akun yang sudah dipakai jurnal tidak bisa diubah. Nonaktifkan lalu buat akun baru.');
  const next = account.id
    ? rows.map((row) => (row.id === account.id ? { ...row, ...account, code, name: account.name.trim() } : row))
    : [...rows, { ...account, code, name: account.name.trim(), id: rows.reduce((max, row) => Math.max(max, row.id), 0) + 1, isActive: true }];
  write(KEYS.accounts, next);
  return next.find((row) => row.code === code);
}

// ---------------- General Ledger ----------------

const line = (accountCode, debit, credit) => ({ accountCode, debit, credit });
const JOURNAL_SEED = () => [
  { date: daysAgo(40), reference: 'Saldo awal periode', source: 'manual', lines: [line('1-1002', 650000000, 0), line('3-1001', 0, 650000000)] },
  { date: daysAgo(28), reference: 'Service Oli Gardan HINO', source: 'equipment_purchase', lines: [line('5-1002', 1250000, 0), line('1-1001', 0, 1250000)] },
  { date: daysAgo(21), reference: 'Pembelian Solar Industri (B-05)', source: 'field_expense', lines: [line('5-2005', 45800000, 0), line('2-1001', 0, 45800000)] },
  { date: daysAgo(12), reference: 'Pengembalian Kelebihan Bayar', source: 'manual', lines: [line('1-1002', 5000000, 0), line('1-1100', 0, 5000000)] },
  { date: daysAgo(6), reference: 'Termin progress Galian 12,5%', source: 'income', lines: [line('1-1200', 180000000, 0), line('4-1001', 0, 180000000)] },
].map((journal, index) => ({ ...journal, id: index + 1, journalCode: `TRX-${String(980 + index * 37).padStart(5, '0')}`, createdBy: 'Data Contoh' }));

export async function listJournals() {
  return read(KEYS.journals, JOURNAL_SEED).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/**
 * Catat jurnal berpasangan. Debit harus sama dengan kredit, setiap baris hanya
 * satu sisi, dan akunnya harus aktif — aturan yang kelak ditegakkan backend.
 */
export async function postJournal({ date, reference, source = 'manual', lines }) {
  const accounts = await listAccounts();
  const clean = lines.filter((row) => row.accountCode && (Number(row.debit) || Number(row.credit)));
  if (clean.length < 2) throw new Error('Jurnal butuh minimal dua baris akun.');
  clean.forEach((row, index) => {
    const account = accounts.find((item) => item.code === row.accountCode);
    if (!account?.isActive) throw new Error(`Baris ${index + 1}: akun ${row.accountCode} tidak ada atau nonaktif.`);
    if (Number(row.debit) && Number(row.credit)) throw new Error(`Baris ${index + 1}: isi debit ATAU kredit, bukan keduanya.`);
  });
  const debit = clean.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const credit = clean.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  if (Math.round(debit) !== Math.round(credit)) throw new Error(`Jurnal tidak seimbang: debit ${debit.toLocaleString('id-ID')} vs kredit ${credit.toLocaleString('id-ID')}.`);
  const rows = await listJournals();
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch { /* tanpa nama */ }
  const journal = {
    id,
    journalCode: `TRX-${String(1200 + id).padStart(5, '0')}`,
    date,
    reference: reference.trim(),
    source,
    lines: clean.map((row) => line(row.accountCode, Number(row.debit || 0), Number(row.credit || 0))),
    createdBy: user.fullName || user.username || '-',
  };
  write(KEYS.journals, [...rows, journal]);
  return journal;
}

// ---------------- Payroll staf ----------------

const EMPLOYEE_SEED = () => [
  ['CXP-220101', 'Bambang Susilo', 'Engineering', 12500000, 2500000, 750000],
  ['CXP-220102', 'Siti Maesaroh', 'Finance', 10000000, 1500000, 450000],
  ['CXP-220105', 'Rudi Hermawan', 'Operations', 15200000, 3000000, 920000],
  ['CXP-220108', 'Anisa Putri', 'HR', 8500000, 1200000, 320000],
  ['CXP-220111', 'Dedi Kurniawan', 'Operations', 9200000, 1800000, 410000],
  ['CXP-220114', 'Wulan Sari', 'Finance', 8800000, 1100000, 380000],
  ['CXP-220117', 'Agus Pratama', 'Engineering', 13400000, 2200000, 690000],
  ['CXP-220120', 'Rina Oktaviani', 'Admin', 7200000, 900000, 300000],
].map(([employeeCode, fullName, division, baseSalary, allowance, deduction], index) => ({ id: index + 1, employeeCode, fullName, division, baseSalary, allowance, deduction, isActive: true }));

export const netSalary = (row) => row.baseSalary + row.allowance - row.deduction;

export async function listEmployees() {
  return read(KEYS.employees, EMPLOYEE_SEED);
}

export async function saveEmployee(employee) {
  const rows = await listEmployees();
  if (!employee.fullName.trim()) throw new Error('Nama karyawan wajib diisi.');
  if (!(employee.baseSalary > 0)) throw new Error('Gaji pokok harus lebih dari 0.');
  if (employee.deduction > employee.baseSalary + employee.allowance) throw new Error('Potongan melebihi gaji kotor.');
  const next = employee.id
    ? rows.map((row) => (row.id === employee.id ? { ...row, ...employee } : row))
    : [...rows, { ...employee, id: rows.reduce((max, row) => Math.max(max, row.id), 0) + 1, employeeCode: `CXP-${220100 + rows.length * 3 + 2}`, isActive: true }];
  write(KEYS.employees, next);
  return next;
}

/** Status pembayaran per periode (YYYY-MM): { [period]: { [employeeId]: paidAt } }. Bulan lalu otomatis lunas. */
async function payrollState() {
  return read(KEYS.payroll, () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    const previous = date.toISOString().slice(0, 7);
    return { [previous]: Object.fromEntries(EMPLOYEE_SEED().map((row) => [row.id, `${previous}-25`])) };
  });
}

export async function getPayrollPeriod(period) {
  const [employees, state] = await Promise.all([listEmployees(), payrollState()]);
  const paid = state[period] || {};
  return employees.filter((row) => row.isActive).map((row) => ({ ...row, net: netSalary(row), paidAt: paid[row.id] || null }));
}

/** Tandai lunas + jurnal Beban Gaji / Hutang BPJS & PPh / Bank. */
export async function payPayroll(period, employeeIds) {
  const [state, rows] = await Promise.all([payrollState(), getPayrollPeriod(period)]);
  const targets = rows.filter((row) => employeeIds.includes(row.id) && !row.paidAt);
  if (!targets.length) throw new Error('Tidak ada gaji pending yang dipilih.');
  const gross = targets.reduce((sum, row) => sum + row.baseSalary + row.allowance, 0);
  const deduction = targets.reduce((sum, row) => sum + row.deduction, 0);
  await postJournal({
    date: new Date().toISOString().slice(0, 10),
    reference: `Gaji staf ${period} (${targets.length} karyawan)`,
    source: 'payroll',
    lines: [line('5-1001', gross, 0), line('2-1003', 0, deduction), line('1-1002', 0, gross - deduction)],
  });
  const today = new Date().toISOString().slice(0, 10);
  write(KEYS.payroll, { ...state, [period]: { ...(state[period] || {}), ...Object.fromEntries(targets.map((row) => [row.id, today])) } });
  return targets.length;
}

// ---------------- Pendapatan Divisi Alat (contoh) ----------------

const ALAT_INCOME_SEED = () => [
  { id: 1, claimCode: `CLM-${year}-0901`, claimDate: daysAgo(5), clientName: 'PT Sinar Timur Banten', project: 'Jalan Trans Kalimantan', unitCount: 1, totalHours: 120, totalAmount: 54000000, status: 'pending' },
  { id: 2, claimCode: `CLM-${year}-0902`, claimDate: daysAgo(2), clientName: 'PT Sinar Tenggara Banten', project: 'Jalan Tol Subang', unitCount: 4, totalHours: 450, totalAmount: 202500000, status: 'pending' },
];

export async function listAlatIncome() {
  return read(KEYS.alatIncome, ALAT_INCOME_SEED);
}

export async function decideAlatIncome(id, status, notes) {
  const rows = await listAlatIncome();
  const row = rows.find((item) => item.id === id);
  if (!row || row.status !== 'pending') throw new Error('Klaim ini sudah diputuskan.');
  if (status === 'approved') {
    await postJournal({ date: new Date().toISOString().slice(0, 10), reference: `Pendapatan alat ${row.claimCode} · ${row.clientName}`, source: 'income', lines: [line('1-1003', row.totalAmount, 0), line('4-1002', 0, row.totalAmount)] });
  }
  write(KEYS.alatIncome, rows.map((item) => (item.id === id ? { ...item, status, financeNotes: notes || null, decidedAt: new Date().toISOString() } : item)));
}

/** Jurnal saat income record diverifikasi (Piutang/Pendapatan) atau dilunasi (Bank/Piutang). */
export const REVENUE_ACCOUNT = { construction_project: '4-1001', external_rental: '4-1002', external_supply: '4-1003' };
export async function journalIncome(record, stage) {
  const amount = record.totalAmount;
  const lines = stage === 'verified'
    ? [line('1-1200', amount, 0), line(REVENUE_ACCOUNT[record.projectSourceType], 0, amount)]
    : [line('1-1002', amount, 0), line('1-1200', 0, amount)];
  return postJournal({ date: new Date().toISOString().slice(0, 10), reference: `${stage === 'verified' ? 'Pengakuan pendapatan' : 'Pelunasan'} ${record.referenceCode} · ${record.partyName}`, source: 'income', lines });
}
