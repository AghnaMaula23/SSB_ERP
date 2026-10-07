const { success, created, paginated } = require('../../utils/response.js');
// Konversi angka dari query string WAJIB di sini — `.toInt()` pada query()
// tidak berfungsi di Express 5. Lihat utils/query.js.
const { pageParams, numQuery } = require('../../utils/query.js');
const service = require('./project.service.js');
const subProject = require('./sub-project.service.js');
const progress = require('./progress.service.js');
const pool = require('./pool.service.js');
const allocation = require('./allocation.service.js');

// ============================================================
// PROJECT HEADERS — tiga tipe, satu set handler
// ============================================================
// `kind` disuntikkan routes lewat req.projectKind, bukan diambil dari URL mentah,
// supaya tipe yang tidak dikenal tidak pernah sampai ke service.

const listProjects = async (req, res, next) => {
  try {
    const result = await service.list(req.projectKind, {
      ...pageParams(req), status: req.query.status, search: req.query.search,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailProject = async (req, res, next) => {
  try {
    const { config, row } = await service.findOrFail(req.projectKind, req.params.id);
    return success(res, service.shapeProject(config, row));
  } catch (err) { next(err); }
};

const createProject = async (req, res, next) => {
  try {
    const data = await service.create(req.projectKind, req.body, req.user);
    return created(res, data, 'Project berhasil dibuat');
  } catch (err) { next(err); }
};

const updateProject = async (req, res, next) => {
  try {
    const data = await service.update(req.projectKind, req.params.id, req.body);
    return success(res, data, 'Project berhasil diperbarui');
  } catch (err) { next(err); }
};

const changeProjectStatus = async (req, res, next) => {
  try {
    const data = await service.changeStatus(req.projectKind, req.params.id, req.body.status);
    return success(res, data, `Status project berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};

// ============================================================
// SUB-PROJECTS
// ============================================================

const listSubProjects = async (req, res, next) => {
  try {
    const data = await subProject.list(req.params.projectId, { status: req.query.status });
    return success(res, data);
  } catch (err) { next(err); }
};

const detailSubProject = async (req, res, next) => {
  try {
    return success(res, await subProject.getById(req.params.projectId, req.params.id));
  } catch (err) { next(err); }
};

/** Detail tahapan lewat id-nya sendiri, tanpa konteks project di URL. */
const detailSubProjectDirect = async (req, res, next) => {
  try {
    return success(res, await subProject.getByIdDirect(req.params.id));
  } catch (err) { next(err); }
};

const subProjectProgress = async (req, res, next) => {
  try {
    return success(res, await subProject.getProgress(req.params.projectId, req.params.subProjectId));
  } catch (err) { next(err); }
};

const createSubProject = async (req, res, next) => {
  try {
    const data = await subProject.create(req.params.projectId, req.body, req.user.id);
    return created(res, data, 'Sub-project berhasil dibuat');
  } catch (err) { next(err); }
};

const updateSubProject = async (req, res, next) => {
  try {
    const data = await subProject.update(req.params.projectId, req.params.id, req.body);
    return success(res, data, 'Sub-project berhasil diperbarui');
  } catch (err) { next(err); }
};

const changeSubProjectStatus = async (req, res, next) => {
  try {
    const data = await subProject.changeStatus(req.params.projectId, req.params.id, req.body.status);
    return success(res, data, `Status sub-project berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};

// ============================================================
// DAILY PROGRESS
// ============================================================

const listProgressLogs = async (req, res, next) => {
  try {
    const result = await progress.list(req.params.subProjectId, {
      ...pageParams(req),
      startDate: req.query.startDate, endDate: req.query.endDate, status: req.query.status,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailProgressLog = async (req, res, next) => {
  try {
    return success(res, await progress.getById(req.params.subProjectId, req.params.id));
  } catch (err) { next(err); }
};

const createProgressLog = async (req, res, next) => {
  try {
    const data = await progress.create(req.params.subProjectId, req.body, req.user.id);
    return created(res, data, 'Progress harian berhasil dicatat');
  } catch (err) { next(err); }
};

const updateProgressLog = async (req, res, next) => {
  try {
    const data = await progress.update(req.params.subProjectId, req.params.id, req.body, req.user.id);
    return success(res, data, 'Progress harian berhasil diperbarui');
  } catch (err) { next(err); }
};

const validateProgressLog = async (req, res, next) => {
  try {
    const data = await progress.setValidationStatus(
      req.params.subProjectId, req.params.id, req.body.status, req.user.id);
    return success(res, data, `Progress harian berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};


// ============================================================
// EQUIPMENT POOL
// ============================================================

const listPools = async (req, res, next) => {
  try {
    const result = await pool.list({
      ...pageParams(req),
      ownerType: req.query.ownerType,
      constructionProjectId: numQuery(req.query.constructionProjectId),
      externalRentalProjectId: numQuery(req.query.externalRentalProjectId),
      status: req.query.status,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const detailPool = async (req, res, next) => {
  try { return success(res, await pool.getById(req.params.id)); } catch (err) { next(err); }
};

const createPool = async (req, res, next) => {
  try {
    const data = await pool.create(req.body, req.user.id);
    return created(res, data, 'Equipment pool berhasil dibuat');
  } catch (err) { next(err); }
};

const changePoolStatus = async (req, res, next) => {
  try {
    const data = await pool.changeStatus(req.params.id, req.body.status);
    return success(res, data, `Status pool berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};

const addPoolItem = async (req, res, next) => {
  try {
    const data = await pool.addItem(req.params.id, req.body);
    return created(res, data, 'Item berhasil ditambahkan ke pool');
  } catch (err) { next(err); }
};

const bindPoolItemUnit = async (req, res, next) => {
  try {
    const data = await pool.bindItemUnit(req.params.id, req.params.itemId, req.body.equipmentItemId);
    return success(res, data, 'Unit alat berhasil diikat ke pool item');
  } catch (err) { next(err); }
};

const closePoolItem = async (req, res, next) => {
  try {
    const data = await pool.closeItem(req.params.id, req.params.itemId, req.body.status);
    return success(res, data, `Pool item berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};

// ============================================================
// EQUIPMENT ALLOCATIONS
// ============================================================

const listAllocations = async (req, res, next) => {
  try {
    return success(res, await allocation.list(req.params.subProjectId, { status: req.query.status }));
  } catch (err) { next(err); }
};

const detailAllocation = async (req, res, next) => {
  try { return success(res, await allocation.getById(req.params.subProjectId, req.params.id)); } catch (err) { next(err); }
};

const createAllocation = async (req, res, next) => {
  try {
    const data = await allocation.create(req.params.subProjectId, req.body, req.user.id);
    return created(res, data, 'Alat berhasil dialokasikan ke tahapan');
  } catch (err) { next(err); }
};

const receiveAllocation = async (req, res, next) => {
  try {
    const data = await allocation.receive(req.params.subProjectId, req.params.id, req.user.id);
    return success(res, data, 'Penerimaan alat berhasil dikonfirmasi');
  } catch (err) { next(err); }
};

const changeAllocationStatus = async (req, res, next) => {
  try {
    const data = await allocation.changeStatus(req.params.subProjectId, req.params.id, req.body.status, req.user.id);
    return success(res, data, `Status alokasi berhasil diubah menjadi "${req.body.status}"`);
  } catch (err) { next(err); }
};

module.exports = {
  listProjects, detailProject, createProject, updateProject, changeProjectStatus,
  listSubProjects, detailSubProject, detailSubProjectDirect, subProjectProgress,
  createSubProject, updateSubProject, changeSubProjectStatus,
  listProgressLogs, detailProgressLog, createProgressLog, updateProgressLog, validateProgressLog,
  listPools, detailPool, createPool, changePoolStatus, addPoolItem, bindPoolItemUnit, closePoolItem,
  listAllocations, detailAllocation, createAllocation, receiveAllocation, changeAllocationStatus,
};
