const service = require('./project-file.service.js');
const { success, created, paginated } = require('../../utils/response.js');
const { pageParams, numQuery } = require('../../utils/query.js');

const listProjects = async (req, res, next) => {
  try {
    return success(res, await service.listProjects({ type: req.query.type }));
  } catch (err) { next(err); }
};

const getDirectory = async (req, res, next) => {
  try {
    return success(res, await service.getDirectory(req.params.type, req.params.projectId, req.user));
  } catch (err) { next(err); }
};

const createFolder = async (req, res, next) => {
  try {
    const data = await service.createFolder(req.params.type, req.params.projectId, req.body, req.user.id);
    return created(res, data, 'Folder dibuat');
  } catch (err) { next(err); }
};

const renameFolder = async (req, res, next) => {
  try {
    return success(res, await service.renameFolder(req.params.id, req.body), 'Nama folder diubah');
  } catch (err) { next(err); }
};

const deleteFolder = async (req, res, next) => {
  try {
    await service.deleteFolder(req.params.id);
    return success(res, null, 'Folder dihapus');
  } catch (err) { next(err); }
};

const listFolderFiles = async (req, res, next) => {
  try {
    const result = await service.listFolderFiles(req.params.id, {
      ...pageParams(req), q: req.query.q || undefined, kind: req.query.kind,
    });
    return paginated(res, result);
  } catch (err) { next(err); }
};

const uploadFile = async (req, res, next) => {
  try {
    const data = await service.uploadFile(req.params.id, req.upload, req.body, req.user.id);
    return created(res, data, `${data.name} berhasil diunggah`);
  } catch (err) { next(err); }
};

const getFile = async (req, res, next) => {
  try {
    return success(res, await service.getFile(req.params.id));
  } catch (err) { next(err); }
};

const updateFile = async (req, res, next) => {
  try {
    return success(res, await service.updateFile(req.params.id, req.body), 'Berkas diperbarui');
  } catch (err) { next(err); }
};

const trashFile = async (req, res, next) => {
  try {
    return success(res, await service.trashFile(req.params.id, req.user.id), 'Berkas dipindah ke sampah');
  } catch (err) { next(err); }
};

const restoreFile = async (req, res, next) => {
  try {
    return success(res, await service.restoreFile(req.params.id), 'Berkas dipulihkan');
  } catch (err) { next(err); }
};

const listTrash = async (req, res, next) => {
  try {
    return paginated(res, await service.listTrash(req.params.type, req.params.projectId, pageParams(req)));
  } catch (err) { next(err); }
};

const listSystemFolder = async (req, res, next) => {
  try {
    const result = await service.listSystemFolder(req.params.type, req.params.projectId, req.params.key, {
      ...pageParams(req), subProjectId: numQuery(req.query.subProjectId),
    }, req.user);
    return paginated(res, result);
  } catch (err) { next(err); }
};

module.exports = {
  listProjects, getDirectory, createFolder, renameFolder, deleteFolder,
  listFolderFiles, uploadFile, getFile, updateFile, trashFile, restoreFile, listTrash, listSystemFolder,
};
