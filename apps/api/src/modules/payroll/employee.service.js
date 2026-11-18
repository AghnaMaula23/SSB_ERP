const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { todayDate } = require('../../utils/date.js');
const { nextDocumentNumber } = require('../../utils/document-number.js');
const { toNumber, toDateOnly, coerceDates, pickWritable, shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');

// ============================================================
// MASTER KARYAWAN TETAP (docs/claude_knowledge/plan-divisi-finance.md F26, 3c).
//
// Dikelola Admin. Aktif DITURUNKAN dari end_date (null atau ≥ hari ini) — tidak ada
// kolom status, tidak ada hapus: keluar = isi endDate. Nominal gaji tidak pernah
// keluar dari sini kecuali pemanggil memegang compensation:read (F29).
// ============================================================

const EMPLOYEE_DOC_TYPE = 'EMP';
const EMPLOYEE_DOC_PAD = 4;
const DEPARTMENTS = ['kantor', 'finance', 'divisi_alat', 'lapangan'];
const WRITABLE_FIELDS = ['fullName', 'department', 'positionName', 'joinDate', 'endDate', 'endReason',
  'bankName', 'accountNumber', 'accountName', 'notes'];
const TEXT_FIELDS = ['fullName', 'positionName', 'endReason', 'bankName', 'accountNumber', 'accountName', 'notes'];

const INCLUDE = {
  createdByUser: { select: ACTOR_SELECT },
  user: { select: { id: true, username: true, fullName: true } },
};

const isActiveOn = (row, date) => row.endDate === null || row.endDate >= date;

const shapeEmployee = (row) => ({
  id: row.id,
  employeeCode: row.employeeCode,
  fullName: row.fullName,
  department: row.department,
  positionName: row.positionName,
  joinDate: toDateOnly(row.joinDate),
  endDate: toDateOnly(row.endDate),
  endReason: row.endReason,
  isActive: isActiveOn(row, todayDate()),
  bankName: row.bankName,
  accountNumber: row.accountNumber,
  accountName: row.accountName,
  notes: row.notes,
  user: row.user ?? null,
  createdBy: shapeActor(row.createdByUser),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const findOrFail = async (id, client = prisma) => {
  const row = await client.employee.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw httpError(`Karyawan dengan ID ${id} tidak ditemukan`, 404);
  return row;
};

/** Teks bebas dirapikan; string kosong = dikosongkan. */
const normalize = (payload) => {
  const data = pickWritable(payload, WRITABLE_FIELDS);
  for (const key of TEXT_FIELDS) {
    if (typeof data[key] === 'string') data[key] = data[key].trim() || null;
  }
  return coerceDates(data, ['joinDate', 'endDate']);
};

/** Aturan gabungan setelah perubahan diterapkan ke baris lama (CHECK di DB sebagai jaring terakhir). */
const assertDates = ({ joinDate, endDate, endReason }) => {
  if (endDate && endDate < joinDate) throw httpError('Tanggal keluar tidak boleh sebelum tanggal masuk', 400);
  if (endReason && !endDate) throw httpError('Alasan keluar hanya diisi bersama tanggal keluar', 400);
};

const list = async ({ page = 1, limit = 20, search, active, department }) => {
  const today = todayDate();
  const term = search?.trim();
  const where = {
    AND: [
      active === true ? { OR: [{ endDate: null }, { endDate: { gte: today } }] } : {},
      active === false ? { endDate: { lt: today } } : {},
      department ? { department } : {},
      term ? { OR: [
        { fullName: { contains: term, mode: 'insensitive' } },
        { employeeCode: { contains: term, mode: 'insensitive' } },
        { positionName: { contains: term, mode: 'insensitive' } },
      ] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, include: INCLUDE, orderBy: { fullName: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.employee.count({ where }),
  ]);
  return { data: rows.map(shapeEmployee), total, page, limit };
};

/** Gaji berlaku pada suatu tanggal = effective_start_date terbaru ≤ tanggal itu. */
const compensationOn = (employeeId, date, client = prisma) => client.employeeCompensation.findFirst({
  where: { employeeId, effectiveStartDate: { lte: date } },
  orderBy: { effectiveStartDate: 'desc' },
});

/** `canSeeSalary` = pemanggil memegang compensation:read (F29) — ditentukan controller. */
const getById = async (id, { canSeeSalary = false } = {}) => {
  const row = await findOrFail(id);
  const result = shapeEmployee(row);
  if (canSeeSalary) {
    const current = await compensationOn(id, todayDate());
    result.currentCompensation = current
      ? { id: current.id, baseSalary: toNumber(current.baseSalary), effectiveStartDate: toDateOnly(current.effectiveStartDate) }
      : null;
  }
  return result;
};

const create = async (payload, userId) => {
  const data = normalize(payload);
  delete data.endDate; delete data.endReason; // karyawan baru belum keluar (POST tanpa field ini)
  const row = await prisma.$transaction(async (tx) => {
    const employeeCode = await nextDocumentNumber(tx, EMPLOYEE_DOC_TYPE, { pad: EMPLOYEE_DOC_PAD });
    return tx.employee.create({ data: { ...data, employeeCode, createdBy: userId }, include: INCLUDE });
  });
  return shapeEmployee(row);
};

/** endDate: null = batal keluar (alasan ikut dikosongkan). */
const update = async (id, payload) => {
  const current = await findOrFail(id);
  const data = normalize(payload);
  if (data.endDate === null) data.endReason = null;
  assertDates({ ...current, ...data });
  return shapeEmployee(await prisma.employee.update({ where: { id }, data, include: INCLUDE }));
};

module.exports = { list, getById, create, update, findOrFail, compensationOn, isActiveOn, DEPARTMENTS };
