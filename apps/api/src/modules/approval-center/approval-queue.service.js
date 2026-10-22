const { Prisma } = require('@prisma/client');
const prisma = require('../../config/database.js');
const { toNumber } = require('../../utils/shape.js');

/**
 * Antrean Approval Center — BACA-SAJA (docs/keputusan-desain-approval-center.md).
 *
 * Datanya dari VIEW `approval_queue` (migrasi 20261017090000), yang membaca langsung
 * tabel sumber: tidak ada salinan yang perlu disinkronkan. Aksi tetap di endpoint
 * modul sumber; di sini hanya menunjuk ke sana.
 *
 * QUEUES adalah SATU-SATUNYA tempat pemetaan (sourceType, stage) → permission aksi
 * & endpoint aksi. Menambah sumber = satu blok UNION ALL di VIEW + satu baris di sini.
 * Endpoint aksi = `detail_path` + '/' + akhiran.
 */
const QUEUES = [
  { sourceType: 'purchase_request', stage: 'admin', permission: 'purchase-request:validate', actions: ['validate', 'reject'] },
  { sourceType: 'purchase_request', stage: 'finance', permission: 'purchase-request:approve', actions: ['approve', 'reject'] },
  { sourceType: 'material_request', stage: 'admin', permission: 'material-request:validate', actions: ['admin-validation', 'costs', 'submit-to-finance', 'reject'] },
  { sourceType: 'material_request', stage: 'finance', permission: 'material-request:approve', actions: ['approve', 'reject'] },
  { sourceType: 'equipment_request', stage: 'admin', permission: 'equipment-request:review', actions: ['admin-review'] },
  { sourceType: 'progress_log', stage: 'admin', permission: 'progress:validate', actions: ['validate'] },
];

const SOURCE_TYPES = [...new Set(QUEUES.map((q) => q.sourceType))];
const STAGES = ['admin', 'finance'];

const queueKey = (sourceType, stage) => `${sourceType}:${stage}`;
const ACTIONS = new Map(QUEUES.map((q) => [queueKey(q.sourceType, q.stage), q.actions]));

/** Antrean yang boleh diproses user ini — ditentukan permission, bukan nama role (A4). */
const allowedQueues = (permissions, { stage, sourceType } = {}) =>
  QUEUES.filter((q) => permissions.includes(q.permission)
    && (!stage || q.stage === stage)
    && (!sourceType || q.sourceType === sourceType));

/**
 * WHERE bersama list & summary. Dokumen yang diajukan/dicatat user sendiri, dan
 * di tahap finance dokumen yang dia teruskan sendiri, disembunyikan — endpoint
 * sumber tetap penjaga sebenarnya (403); antrean hanya tidak menawarkan pekerjaan
 * yang pasti ditolak.
 */
const visibleWhere = (queues, userId) => Prisma.sql`
  (q.source_type, q.stage) IN (${Prisma.join(queues.map((x) => Prisma.sql`(${x.sourceType}, ${x.stage})`))})
  AND q.requested_by IS DISTINCT FROM ${userId}
  AND q.forwarded_by IS DISTINCT FROM ${userId}`;

const shapeRow = (row) => ({
  sourceType: row.source_type,
  sourceId: row.source_id,
  stage: row.stage,
  referenceCode: row.reference_code,
  context: row.context,
  summary: row.summary,
  amount: toNumber(row.amount),
  requestedBy: row.requested_by ? { id: row.requested_by, fullName: row.requested_by_name } : null,
  submittedAt: row.submitted_at,
  detailPath: row.detail_path,
  actionEndpoints: ACTIONS.get(queueKey(row.source_type, row.stage)).map((a) => `${row.detail_path}/${a}`),
});

const list = async ({ userId, permissions, page, limit, stage, sourceType, search, sort = 'oldest' }) => {
  const queues = allowedQueues(permissions, { stage, sourceType });
  if (queues.length === 0) return { data: [], total: 0, page, limit };

  let where = visibleWhere(queues, userId);
  if (search) {
    const pattern = `%${search}%`;
    where = Prisma.sql`${where} AND (q.reference_code ILIKE ${pattern} OR q.context ILIKE ${pattern})`;
  }
  const order = sort === 'newest' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw`
      SELECT q.*, u.full_name AS requested_by_name
      FROM approval_queue q
      LEFT JOIN users u ON u.id = q.requested_by
      WHERE ${where}
      ORDER BY q.submitted_at ${order}, q.source_type, q.source_id
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    prisma.$queryRaw`SELECT count(*)::int AS total FROM approval_queue q WHERE ${where}`,
  ]);

  return { data: rows.map(shapeRow), total, page, limit };
};

/**
 * Jumlah per antrean. Antrean yang boleh diproses tetap muncul walau 0, supaya FE
 * menentukan tab dari response ini, bukan dari nama role.
 */
const summary = async ({ userId, permissions }) => {
  const queues = allowedQueues(permissions);
  if (queues.length === 0) return { total: 0, items: [] };

  const rows = await prisma.$queryRaw`
    SELECT q.source_type, q.stage, count(*)::int AS count, min(q.submitted_at) AS oldest
    FROM approval_queue q
    WHERE ${visibleWhere(queues, userId)}
    GROUP BY q.source_type, q.stage`;
  const counts = new Map(rows.map((r) => [queueKey(r.source_type, r.stage), r]));

  const items = queues.map((q) => {
    const row = counts.get(queueKey(q.sourceType, q.stage));
    return {
      stage: q.stage,
      sourceType: q.sourceType,
      count: row ? row.count : 0,
      oldestSubmittedAt: row ? row.oldest : null,
    };
  });
  return { total: items.reduce((sum, i) => sum + i.count, 0), items };
};

module.exports = { list, summary, SOURCE_TYPES, STAGES };
