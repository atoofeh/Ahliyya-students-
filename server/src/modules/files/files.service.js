const fs = require('fs');
const { isAdminRole } = require('../../core/permissions');
const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { persistUpload } = require('../../middleware/uploads');
const { paginatedQuery } = require('../../core/pagination');
const FileAsset = require('../../models/FileAsset');

class FileService {
  static async upload(file, { uploadedBy, course = null, kind, scope = 'course', downloadable = true, allowSvg = false }, ip) {
    if (!file) throw ApiError.badRequest('No file provided');
    const stored = await persistUpload(file, kind, { allowSvg });
    const asset = await FileAsset.create({
      uploadedBy,
      course,
      kind,
      scope,
      originalName: stored.originalName,
      storedName: stored.storedName,
      storagePath: stored.path,
      mimeType: stored.mimeType,
      sizeBytes: stored.size,
      downloadable,
    });
    await audit({ user: uploadedBy, action: 'FILE_UPLOADED', course, ip, resource: `file:${asset._id}`, meta: { name: stored.originalName, size: stored.size } });
    return asset;
  }

  /**
   * Access rules: global files → any authenticated user; course files →
   * course access checked by the route middleware before this is called.
   */
  static async getForServing(fileId) {
    const asset = await FileAsset.findOne({ _id: fileId, deletedAt: null }).select('+storagePath');
    if (!asset) throw ApiError.notFound('File not found');
    if (!fs.existsSync(asset.storagePath)) throw ApiError.notFound('File data missing from storage');
    return asset;
  }

  static async remove(fileId, actor, ip) {
    const asset = await FileAsset.findOne({ _id: fileId, deletedAt: null }).select('+storagePath');
    if (!asset) throw ApiError.notFound('File not found');
    if (!isAdminRole(actor.role) && String(asset.uploadedBy) !== String(actor.id)) {
      throw ApiError.forbidden('You can only delete your own files');
    }
    asset.deletedAt = new Date();
    await asset.save();
    fs.promises.unlink(asset.storagePath).catch(() => {});
    await audit({ user: actor.id, action: 'FILE_DELETED', ip, resource: `file:${fileId}` });
  }

  static async listCourseFiles(courseId, { page, limit }) {
    return paginatedQuery(FileAsset, { course: courseId, deletedAt: null }, { page, limit });
  }

  static async listGlobalFiles({ page, limit }) {
    return paginatedQuery(FileAsset, { scope: 'global', deletedAt: null }, {
      page, limit, populate: { path: 'uploadedBy', select: 'name' },
    });
  }

  static async storageStats() {
    const byKind = await FileAsset.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$kind', bytes: { $sum: '$sizeBytes' }, count: { $sum: 1 } } },
    ]);
    const Video = require('../../models/Video');
    const videos = await Video.aggregate([
      { $match: { deletedAt: null, status: 'ready' } },
      { $group: { _id: 'videos', bytes: { $sum: '$sizeBytes' }, count: { $sum: 1 } } },
    ]);
    return [...byKind, ...videos];
  }
}

module.exports = FileService;
