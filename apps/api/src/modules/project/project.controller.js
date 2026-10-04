const { success, created, paginated } = require('../../utils/response.js');
const service = require('./project.service.js');
const subProject = require('./sub-project.service.js');
const progress = require('./progress.service.js');

// ============================================================
// PROJECT HEADERS — tiga tipe, satu set handler
// ============================================================
// `kind` disuntikkan routes lewat req.projectKind, bukan diambil dari URL mentah,
// supaya tipe yang tidak dikenal tidak pernah sampai ke service.

const listProjects = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const result = await service.list(req.projectKind, { page, limit, status, search });
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
    const { page = 1, limit = 20, startDate, endDate, status } = req.query;
    const result = await progress.list(req.params.subProjectId, { page, limit, startDate, endDate, status });
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

module.exports = {
  listProjects, detailProject, createProject, updateProject, changeProjectStatus,
  listSubProjects, detailSubProject, subProjectProgress,
  createSubProject, updateSubProject, changeSubProjectStatus,
  listProgressLogs, detailProgressLog, createProgressLog, updateProgressLog, validateProgressLog,
};
