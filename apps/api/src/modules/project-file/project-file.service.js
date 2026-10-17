const prisma = require('../../config/database.js');
const { httpError } = require('../../utils/error.js');
const { claimTransition } = require('../../utils/status-transition.js');
const { shapeActor, ACTOR_SELECT } = require('../../utils/shape.js');
const fileService = require('../file/file.service.js');

// ============================================================
// BERKAS PROJECT (L8, docs/keputusan-desain-lampiran.md)
// Direktori: Project → (tahapan, konstruksi saja) → folder → berkas.
// Folder user disimpan; folder sistem dibaca dari tabel sumbernya saat diminta.
// ============================================================

const FILE_PREFIX = 'project-files';
const TRASH_RETENTION_DAYS = 30;

/** Tiga jenis project dipisah fisik; folder menunjuk lewat FK sesuai jenisnya. */
const PROJECT_KINDS = {
  construction: { model: 'constructionProject', fk: 'constructionProjectId', code: 'projectCode', name: 'projectName', start: 'startDate' },
  rental: { model: 'externalRentalProject', fk: 'externalRentalProjectId', code: 'rentalProjectCode', name: 'rentalProjectName', start: 'contractStartDate' },
  supply: { model: 'externalSupplyProject', fk: 'externalSupplyProjectId', code: 'supplyProjectCode', name: 'supplyProjectName', start: 'contractStartDate' },
};

/** Jenis tampilan berkas — turunan mimeType (dipakai filter `kind` dan ikon FE). */
const FILE_KINDS = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  pdf: ['application/pdf'],
  sheet: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  doc: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  cad: ['image/vnd.dwg'],
};
const kindOfMime = (mime) => Object.keys(FILE_KINDS).find((k) => FILE_KINDS[k].includes(mime)) ?? null;

const ownerOf = (folder) => {
  const kind = Object.keys(PROJECT_KINDS).find((k) => folder[PROJECT_KINDS[k].fk] !== null);
  return { kind, projectId: folder[PROJECT_KINDS[kind].fk] };
};

const findProjectOrFail = async (kind, projectId) => {
  const config = PROJECT_KINDS[kind];
  const project = await prisma[config.model].findUnique({ where: { id: projectId } });
  if (!project) throw httpError('Project tidak ditemukan', 404);
  return project;
};

const shapeProjectHeader = (kind, row) => {
  const config = PROJECT_KINDS[kind];
  return {
    type: kind,
    id: row.id,
    code: row[config.code],
    name: row[config.name],
    clientName: row.clientName,
    status: row.status,
    year: (row[config.start] ?? row.createdAt).getUTCFullYear(),
  };
};

// ------------------------------------------------------------
// Folder sistem — lampiran modul, dibaca dari tabel sumber (L7). Pemakai baru
// cukup menambah satu baris di sini. `where(scope)` = filter tabel `files`.
// scope = { subProjectId } (tahapan konstruksi) atau { externalSupplyProjectId }.
// ------------------------------------------------------------

const requestScope = (scope) => (scope.subProjectId
  ? { subProjectId: scope.subProjectId }
  : { externalSupplyProjectId: scope.externalSupplyProjectId });

const SOURCE_DELIVERY_SELECT = {
  id: true, deliveryCode: true, deliveryNoteNumber: true, cancelledAt: true,
  materialRequestItem: { select: { materialType: { select: { materialName: true } } } },
  materialRequest: { select: { subProjectId: true, subProject: { select: { subProjectType: true } } } },
};

const SYSTEM_FOLDERS = [
  {
    key: 'delivery-notes',
    name: 'Surat Jalan',
    permission: 'material-request:read',
    // Surat jalan yang sudah diganti (superseded) tidak tampil — hanya yang dirujuk delivery
    where: (scope) => ({ deliveryNoteOf: { is: { materialRequest: requestScope(scope) } } }),
    include: { deliveryNoteOf: { select: SOURCE_DELIVERY_SELECT } },
    source: (file) => {
      const d = file.deliveryNoteOf;
      return {
        cancelled: d.cancelledAt !== null,
        source: {
          type: 'material-delivery', id: d.id, code: d.deliveryCode, deliveryNoteNumber: d.deliveryNoteNumber,
          materialName: d.materialRequestItem.materialType.materialName,
          subProjectId: d.materialRequest.subProjectId, subProjectType: d.materialRequest.subProject?.subProjectType ?? null,
        },
      };
    },
  },
  {
    key: 'receipt-proofs',
    name: 'Bukti Penerimaan',
    permission: 'material-request:read',
    where: (scope) => ({ receiptProofOf: { is: { materialReceipt: { materialDelivery: { materialRequest: requestScope(scope) } } } } }),
    include: {
      receiptProofOf: { select: { materialReceipt: { select: {
        id: true, receiptCode: true, cancelledAt: true, materialDelivery: { select: SOURCE_DELIVERY_SELECT },
      } } } },
    },
    source: (file) => {
      const r = file.receiptProofOf.materialReceipt;
      const d = r.materialDelivery;
      return {
        cancelled: r.cancelledAt !== null,
        source: {
          type: 'material-receipt', id: r.id, code: r.receiptCode, deliveryNoteNumber: d.deliveryNoteNumber,
          materialName: d.materialRequestItem.materialType.materialName,
          subProjectId: d.materialRequest.subProjectId, subProjectType: d.materialRequest.subProject?.subProjectType ?? null,
        },
      };
    },
  },
];

/** Folder sistem lampiran modul hanya untuk tahapan konstruksi dan project supply. */
const systemScopeFor = (kind, projectId, subProjectId) => {
  if (kind === 'construction') return subProjectId ? { subProjectId } : null;
  if (kind === 'supply') return subProjectId ? null : { externalSupplyProjectId: projectId };
  return null;
};

const systemFolderEntries = async (scope, subProjectId, user) => {
  const visible = SYSTEM_FOLDERS.filter((f) => user.permissions.includes(f.permission));
  return Promise.all(visible.map(async (folder) => {
    const agg = await prisma.file.aggregate({
      where: folder.where(scope), _count: { _all: true }, _sum: { sizeBytes: true }, _max: { uploadedAt: true },
    });
    return {
      kind: 'system', id: null, key: folder.key, name: folder.name, subProjectId: subProjectId ?? null,
      fileCount: agg._count._all, totalSize: agg._sum.sizeBytes ?? 0, lastUploadAt: agg._max.uploadedAt,
      createdBy: null, createdAt: null,
    };
  }));
};

// ------------------------------------------------------------
// Ringkasan folder user — dihitung saat dibaca, hanya berkas yang tidak di sampah
// ------------------------------------------------------------

const folderStats = async (folderIds) => {
  if (!folderIds.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT pf.folder_id AS "folderId", count(*)::int AS "fileCount",
           coalesce(sum(f.size_bytes), 0)::bigint AS "totalSize", max(f.uploaded_at) AS "lastUploadAt"
    FROM project_files pf JOIN files f ON f.id = pf.file_id
    WHERE pf.folder_id = ANY(${folderIds}) AND f.status = 'active'
    GROUP BY pf.folder_id`;
  return new Map(rows.map((r) => [r.folderId, { ...r, totalSize: Number(r.totalSize) }]));
};

const shapeUserFolder = (folder, stats) => ({
  kind: 'user',
  id: folder.id,
  key: null,
  name: folder.name,
  subProjectId: folder.subProjectId,
  fileCount: stats?.fileCount ?? 0,
  totalSize: stats?.totalSize ?? 0,
  lastUploadAt: stats?.lastUploadAt ?? null,
  createdBy: shapeActor(folder.createdByUser),
  createdAt: folder.createdAt,
});

const byName = (a, b) => a.name.localeCompare(b.name, 'id');

// ------------------------------------------------------------
// Project & direktori
// ------------------------------------------------------------

const listProjects = async ({ type }) => {
  const kinds = type ? [type] : Object.keys(PROJECT_KINDS);
  const stats = await prisma.$queryRaw`
    SELECT d.construction_project_id AS c, d.external_rental_project_id AS r, d.external_supply_project_id AS s,
           count(DISTINCT d.id)::int AS "folderCount",
           count(f.id) FILTER (WHERE f.status = 'active')::int AS "fileCount",
           coalesce(sum(f.size_bytes) FILTER (WHERE f.status = 'active'), 0)::bigint AS "totalSize",
           max(f.uploaded_at) FILTER (WHERE f.status = 'active') AS "lastUploadAt"
    FROM project_file_folders d
    LEFT JOIN project_files pf ON pf.folder_id = d.id
    LEFT JOIN files f ON f.id = pf.file_id
    GROUP BY 1, 2, 3`;
  const statKey = { construction: 'c', rental: 'r', supply: 's' };

  const result = [];
  for (const kind of kinds) {
    const rows = await prisma[PROJECT_KINDS[kind].model].findMany({ orderBy: { createdAt: 'desc' } });
    for (const row of rows) {
      const st = stats.find((x) => x[statKey[kind]] === row.id);
      result.push({
        ...shapeProjectHeader(kind, row),
        folderCount: st?.folderCount ?? 0,
        fileCount: st?.fileCount ?? 0,
        totalSize: st ? Number(st.totalSize) : 0,
        lastUploadAt: st?.lastUploadAt ?? null,
      });
    }
  }
  return result;
};

const getDirectory = async (kind, projectId, user) => {
  const project = await findProjectOrFail(kind, projectId);
  const config = PROJECT_KINDS[kind];

  const folders = await prisma.projectFileFolder.findMany({
    where: { [config.fk]: projectId },
    include: { createdByUser: { select: ACTOR_SELECT } },
  });
  const stats = await folderStats(folders.map((f) => f.id));
  const userFolders = (subProjectId) => folders
    .filter((f) => f.subProjectId === subProjectId)
    .map((f) => shapeUserFolder(f, stats.get(f.id)))
    .sort(byName);

  const projectScope = systemScopeFor(kind, projectId, null);
  const projectFolders = [
    ...(projectScope ? await systemFolderEntries(projectScope, null, user) : []),
    ...userFolders(null),
  ];

  let stages = [];
  if (kind === 'construction') {
    const subProjects = await prisma.subProject.findMany({
      where: { constructionProjectId: projectId }, select: { id: true, subProjectType: true, status: true },
      orderBy: { sequenceOrder: 'asc' },
    });
    stages = await Promise.all(subProjects.map(async (sp) => ({
      subProjectId: sp.id,
      subProjectType: sp.subProjectType,
      status: sp.status,
      folders: [...await systemFolderEntries({ subProjectId: sp.id }, sp.id, user), ...userFolders(sp.id)],
    })));
  }

  return { project: shapeProjectHeader(kind, project), folders: projectFolders, stages };
};

// ------------------------------------------------------------
// Folder user
// ------------------------------------------------------------

const FOLDER_INCLUDE = { createdByUser: { select: ACTOR_SELECT } };

const findFolderOrFail = async (id, client = prisma) => {
  const folder = await client.projectFileFolder.findUnique({ where: { id }, include: FOLDER_INCLUDE });
  if (!folder) throw httpError('Folder tidak ditemukan', 404);
  return folder;
};

const nameTaken = (err) => err.code === 'P2002' || /project_file_folders_\w+_name_key/.test(err.message ?? '');

const createFolder = async (kind, projectId, { name, subProjectId }, userId) => {
  await findProjectOrFail(kind, projectId);
  if (subProjectId) {
    if (kind !== 'construction') throw httpError('subProjectId hanya untuk project konstruksi', 400);
    const sp = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { constructionProjectId: true } });
    if (!sp) throw httpError('Tahapan tidak ditemukan', 404);
    if (sp.constructionProjectId !== projectId) throw httpError('Tahapan ini bukan milik project tersebut', 400);
  }

  try {
    const folder = await prisma.projectFileFolder.create({
      data: { [PROJECT_KINDS[kind].fk]: projectId, subProjectId: subProjectId ?? null, name, createdBy: userId },
      include: FOLDER_INCLUDE,
    });
    return shapeUserFolder(folder, null);
  } catch (err) {
    if (nameTaken(err)) throw httpError(`Folder "${name}" sudah ada di tempat ini`, 409);
    throw err;
  }
};

const renameFolder = async (id, { name }) => {
  await findFolderOrFail(id);
  try {
    const folder = await prisma.projectFileFolder.update({ where: { id }, data: { name }, include: FOLDER_INCLUDE });
    return shapeUserFolder(folder, (await folderStats([id])).get(id));
  } catch (err) {
    if (nameTaken(err)) throw httpError(`Folder "${name}" sudah ada di tempat ini`, 409);
    throw err;
  }
};

/** Hanya folder kosong TERMASUK sampah — berkas yang dipulihkan selalu punya folder. */
const deleteFolder = async (id) => {
  await findFolderOrFail(id);
  const counts = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE f.status = 'active')::int AS active,
           count(*) FILTER (WHERE f.status = 'trashed')::int AS trashed
    FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.folder_id = ${id}`;
  const { active, trashed } = counts[0];
  if (active || trashed) {
    const parts = [active && `${active} berkas`, trashed && `${trashed} berkas di sampah`].filter(Boolean).join(' dan ');
    throw httpError(`Folder masih berisi ${parts}. Pindahkan, atau tunggu sampahnya terhapus permanen (${TRASH_RETENTION_DAYS} hari).`, 409);
  }
  try {
    await prisma.projectFileFolder.delete({ where: { id } });
  } catch (err) {
    // Berkas masuk bersamaan dengan penghapusan — FK project_files menolak
    if (err.code === 'P2003') throw httpError('Folder baru saja diisi berkas. Muat ulang datanya.', 409);
    throw err;
  }
};

// ------------------------------------------------------------
// Berkas
// ------------------------------------------------------------

const PROJECT_FILE_INCLUDE = {
  folder: { select: { id: true, name: true } },
  file: { include: { uploadedByUser: { select: ACTOR_SELECT }, trashedByUser: { select: ACTOR_SELECT } } },
};

const purgeAtOf = (trashedAt) => (trashedAt
  ? new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  : null);

const shapeProjectFile = (row) => ({
  id: row.id,
  folderId: row.folderId,
  folderName: row.folder.name,
  name: row.name,
  description: row.description,
  kind: kindOfMime(row.file.mimeType),
  file: {
    id: row.file.id,
    originalName: row.file.originalName,
    mimeType: row.file.mimeType,
    sizeBytes: row.file.sizeBytes,
    uploadedAt: row.file.uploadedAt,
    uploadedBy: shapeActor(row.file.uploadedByUser),
  },
  trashedAt: row.file.trashedAt,
  trashedBy: shapeActor(row.file.trashedByUser),
  purgeAt: purgeAtOf(row.file.trashedAt),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const findProjectFileOrFail = async (id) => {
  const row = await prisma.projectFile.findUnique({ where: { id }, include: PROJECT_FILE_INCLUDE });
  if (!row) throw httpError('Berkas tidak ditemukan', 404);
  return row;
};

const listFolderFiles = async (folderId, { page = 1, limit = 20, q, kind }) => {
  await findFolderOrFail(folderId);
  const where = {
    folderId,
    file: { status: 'active', ...(kind && { mimeType: { in: FILE_KINDS[kind] } }) },
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { file: { originalName: { contains: q, mode: 'insensitive' } } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.projectFile.findMany({
      where, include: PROJECT_FILE_INCLUDE, orderBy: [{ file: { uploadedAt: 'desc' } }, { id: 'desc' }],
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.projectFile.count({ where }),
  ]);
  return { data: rows.map(shapeProjectFile), total, page, limit };
};

/** File ke storage dulu, lalu satu transaksi DB; DB gagal → file dihapus (L4). */
const uploadFile = async (folderId, upload, { name, description }, userId) => {
  await findFolderOrFail(folderId);
  try {
    const created = await fileService.withUploadedFile(upload, { prefix: FILE_PREFIX, userId }, (tx, file) =>
      tx.projectFile.create({ data: { folderId, fileId: file.id, name, description: description || null } }));
    return shapeProjectFile(await findProjectFileOrFail(created.id));
  } catch (err) {
    if (err.code === 'P2003') throw httpError('Folder baru saja dihapus. Muat ulang datanya.', 409);
    throw err;
  }
};

const getFile = async (id) => shapeProjectFile(await findProjectFileOrFail(id));

const assertNotTrashed = (row) => {
  if (row.file.status === 'trashed') throw httpError('Berkas ada di sampah. Pulihkan dulu.', 409);
};

/** Nama, deskripsi, atau pindah folder — hanya di dalam project yang sama. */
const updateFile = async (id, { name, description, folderId }) => {
  const row = await findProjectFileOrFail(id);
  assertNotTrashed(row);

  if (folderId !== undefined && folderId !== row.folderId) {
    const [from, to] = await Promise.all([findFolderOrFail(row.folderId), findFolderOrFail(folderId)]);
    const a = ownerOf(from);
    const b = ownerOf(to);
    if (a.kind !== b.kind || a.projectId !== b.projectId) {
      throw httpError('Berkas hanya bisa dipindah ke folder di project yang sama', 400);
    }
  }

  try {
    await prisma.projectFile.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(folderId !== undefined && { folderId }),
      },
    });
  } catch (err) {
    if (err.code === 'P2003') throw httpError('Folder tujuan baru saja dihapus. Muat ulang datanya.', 409);
    throw err;
  }
  return getFile(id);
};

/** Ke sampah (L6). Dihapus permanen 30 hari kemudian oleh `npm run files:cleanup`. */
const trashFile = async (id, userId) => {
  const row = await findProjectFileOrFail(id);
  assertNotTrashed(row);
  await prisma.$transaction((tx) => claimTransition(tx.file, { id: row.fileId, status: 'active' }, {
    status: 'trashed', trashedBy: userId, trashedAt: new Date(),
  }));
  return getFile(id);
};

const restoreFile = async (id) => {
  const row = await findProjectFileOrFail(id);
  if (row.file.status !== 'trashed') throw httpError('Berkas tidak ada di sampah', 409);
  await prisma.$transaction((tx) => claimTransition(tx.file, { id: row.fileId, status: 'trashed' }, {
    status: 'active', trashedBy: null, trashedAt: null,
  }));
  return getFile(id);
};

const listTrash = async (kind, projectId, { page = 1, limit = 20 }) => {
  await findProjectOrFail(kind, projectId);
  const where = { folder: { [PROJECT_KINDS[kind].fk]: projectId }, file: { status: 'trashed' } };
  const [rows, total] = await Promise.all([
    prisma.projectFile.findMany({
      where, include: PROJECT_FILE_INCLUDE, orderBy: [{ file: { trashedAt: 'desc' } }, { id: 'desc' }],
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.projectFile.count({ where }),
  ]);
  return { data: rows.map(shapeProjectFile), total, page, limit };
};

// ------------------------------------------------------------
// Isi folder sistem (baca-saja)
// ------------------------------------------------------------

const listSystemFolder = async (kind, projectId, key, { subProjectId, page = 1, limit = 20 }, user) => {
  await findProjectOrFail(kind, projectId);
  const folder = SYSTEM_FOLDERS.find((f) => f.key === key);
  if (!folder || kind === 'rental') throw httpError('Folder sistem ini tidak ada untuk jenis project tersebut', 404);

  if (kind === 'construction') {
    if (!subProjectId) throw httpError('subProjectId wajib — folder sistem project konstruksi ada di tahapan', 400);
    const sp = await prisma.subProject.findUnique({ where: { id: subProjectId }, select: { constructionProjectId: true } });
    if (!sp || sp.constructionProjectId !== projectId) throw httpError('Tahapan ini bukan milik project tersebut', 400);
  } else if (subProjectId) {
    throw httpError('subProjectId hanya untuk project konstruksi', 400);
  }
  if (!user.permissions.includes(folder.permission)) {
    throw httpError('Tidak memiliki akses ke folder ini', 403);
  }

  const where = folder.where(systemScopeFor(kind, projectId, subProjectId));
  const [rows, total] = await Promise.all([
    prisma.file.findMany({
      where,
      include: { ...folder.include, uploadedByUser: { select: ACTOR_SELECT } },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.file.count({ where }),
  ]);
  return {
    data: rows.map((f) => ({
      fileId: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      kind: kindOfMime(f.mimeType),
      uploadedAt: f.uploadedAt,
      uploadedBy: shapeActor(f.uploadedByUser),
      ...folder.source(f),
    })),
    total, page, limit,
  };
};

module.exports = {
  PROJECT_KINDS, FILE_KINDS,
  listProjects, getDirectory,
  createFolder, renameFolder, deleteFolder,
  listFolderFiles, uploadFile, getFile, updateFile, trashFile, restoreFile, listTrash,
  listSystemFolder,
};
