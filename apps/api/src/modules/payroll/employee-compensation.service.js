const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { todayDate } = require('../../utils/date.js');
const { toNumber, toDateOnly, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const employees = require('./employee.service.js');

// ============================================================
// RIWAYAT GAJI POKOK (plan Finance 3c, F29). Tanpa tanggal akhir & tanpa status:
// gaji berlaku = baris effective_start_date terbaru ≤ tanggal. Immutable — kenaikan
// gaji = baris baru; tidak ada endpoint ubah/hapus, jadi baris yang sudah dipakai
// payroll tidak pernah berubah.
// ============================================================

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const shapeCompensation = (row, currentId) => ({
  id: row.id,
  employeeId: row.employeeId,
  baseSalary: toNumber(row.baseSalary),
  effectiveStartDate: toDateOnly(row.effectiveStartDate),
  isCurrent: row.id === currentId,
  notes: row.notes,
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
});

const listByEmployee = async (employeeId) => {
  await employees.findOrFail(employeeId);
  const [rows, current] = await Promise.all([
    prisma.employeeCompensation.findMany({
      where: { employeeId }, include: { createdByUser: { select: ACTOR_SELECT } }, orderBy: { effectiveStartDate: 'desc' },
    }),
    employees.compensationOn(employeeId, todayDate()),
  ]);
  return rows.map((r) => shapeCompensation(r, current?.id));
};

const create = async ({ employeeId, baseSalary, effectiveStartDate, notes }, userId) => {
  const employee = await employees.findOrFail(employeeId);
  const start = new Date(effectiveStartDate);
  if (employee.endDate && start > employee.endDate) {
    throw httpError(`Tanggal berlaku setelah ${employee.fullName} keluar (${toDateOnly(employee.endDate)})`, 400);
  }
  const duplicate = await prisma.employeeCompensation.findUnique({
    where: { employeeId_effectiveStartDate: { employeeId, effectiveStartDate: start } },
  });
  if (duplicate) {
    throw httpError(`Gaji ${employee.fullName} yang berlaku ${toDateOnly(start)} sudah tercatat — kenaikan gaji pakai tanggal berlaku lain`, 409);
  }
  const row = await prisma.employeeCompensation.create({
    data: { employeeId, baseSalary: round2(baseSalary), effectiveStartDate: start, notes: notes?.trim() || null, createdBy: userId },
    include: { createdByUser: { select: ACTOR_SELECT } },
  });
  const current = await employees.compensationOn(employeeId, todayDate());
  return shapeCompensation(row, current?.id);
};

module.exports = { listByEmployee, create };
