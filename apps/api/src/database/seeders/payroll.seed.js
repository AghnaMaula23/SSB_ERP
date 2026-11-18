// Data demo Payroll karyawan tetap (docs/claude_knowledge/plan-divisi-finance.md G6).
// SEMUA lewat service yang dipakai controller, dengan aktor yang benar (Admin mengelola
// karyawan, Finance menetapkan gaji & membayar) — jurnal beban gaji ikut lahir dari jalur
// yang sama. Idempoten: dilewati kalau sudah ada karyawan.
//
// Hasil: 4 karyawan (1 belum bergaji → muncul di `skipped`), payroll BULAN LALU paid dengan
// satu tunjangan & satu potongan manual. Bulan berjalan sengaja kosong untuk dicoba dari layar
// (payroll draft akan menahan tutup buku bulan itu).
const prisma = require('../../config/database.js');
const employeeSvc = require('../../modules/payroll/employee.service.js');
const compensationSvc = require('../../modules/payroll/employee-compensation.service.js');
const payrollSvc = require('../../modules/payroll/payroll.service.js');
const userSvc = require('../../modules/user/user.service.js');
const { toDateOnly } = require('../../utils/shape.js');
const { todayDate } = require('../../utils/date.js');

const EMPLOYEES = [
  { fullName: 'Rina Kartika', department: 'finance', positionName: 'Staf Finance', joinDate: '2024-03-01', bankName: 'BCA', accountNumber: '1234567890', accountName: 'Rina Kartika', salary: 7500000, linkUser: 'finance' },
  { fullName: 'Dedi Pratama', department: 'kantor', positionName: 'Admin Kantor', joinDate: '2023-08-15', bankName: 'Mandiri', accountNumber: '1370012345678', accountName: 'Dedi Pratama', salary: 6500000 },
  { fullName: 'Agus Setiawan', department: 'divisi_alat', positionName: 'Kepala Mekanik', joinDate: '2022-01-10', bankName: 'BRI', accountNumber: '002101000123456', accountName: 'Agus Setiawan', salary: 9000000 },
  { fullName: 'Sari Wulandari', department: 'lapangan', positionName: 'Pengawas Lapangan', joinDate: '2026-01-05', salary: null },
];

const userOf = async (username) => {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`user demo ${username} belum ada`);
  return user.id;
};

const seedPayrollDemo = async () => {
  console.log('Seeding demo Payroll karyawan...');
  if (await prisma.employee.count()) { console.log('  dilewati (sudah ada karyawan)'); return; }
  const [admin, finance] = [await userOf('admin'), await userOf('finance')];

  const created = [];
  for (const { salary, linkUser, ...data } of EMPLOYEES) {
    const employee = await employeeSvc.create(data, admin);
    if (salary) await compensationSvc.create({ employeeId: employee.id, baseSalary: salary, effectiveStartDate: data.joinDate, notes: 'Gaji awal' }, finance);
    if (linkUser) await userSvc.setEmployee(await userOf(linkUser), employee.id);
    created.push(employee);
  }
  console.log(`  - ${created.length} karyawan (${created.map((e) => e.employeeCode).join(', ')}), 1 belum bergaji`);

  try {
    const today = todayDate();
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const { payroll, skipped } = await payrollSvc.create({ year: last.getUTCFullYear(), month: last.getUTCMonth() + 1, notes: 'Gaji bulan lalu (demo)' }, finance);
    const [first, second] = payroll.items;
    await payrollSvc.replaceComponents(payroll.id, first.id, { components: [{ componentType: 'earning', componentName: 'Tunjangan jabatan', amount: 1000000 }] });
    await payrollSvc.replaceComponents(payroll.id, second.id, { components: [{ componentType: 'deduction', componentName: 'Potongan kasbon', amount: 500000 }] });
    await payrollSvc.finalize(payroll.id, finance);
    const paid = await payrollSvc.pay(payroll.id, { paymentDate: toDateOnly(today), paymentReference: 'TRF-GAJI-DEMO' }, [], finance);
    console.log(`  - ${paid.payrollCode} ${paid.period} paid Rp${paid.totalNet} (${paid.employeeCount} karyawan, ${skipped.length} dilewati tanpa gaji)`);
  } catch (err) {
    console.log(`  - payroll: GAGAL ${err.message}`);
  }
};

module.exports = { seedPayrollDemo };
