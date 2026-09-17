const asyncHandler = require('../../core/asyncHandler');
const ApiError = require('../../core/ApiError');
const VideoService = require('./videos.service');

const initUpload = asyncHandler(async (req, res) => {
  const result = await VideoService.initUpload({
    courseId: req.course._id,
    userId: req.user.id,
    title: req.body.title,
    originalName: req.body.originalName,
    sizeBytes: req.body.sizeBytes,
    mimeType: req.body.mimeType,
  });
  res.status(201).json({
    videoId: result.video._id,
    uploadId: result.uploadId,
    chunkSize: result.chunkSize,
    totalChunks: result.totalChunks,
  });
});

const uploadChunk = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) throw ApiError.badRequest('Chunk data missing');
  const chunkIndex = parseInt(req.body.chunkIndex, 10);
  if (Number.isNaN(chunkIndex)) throw ApiError.badRequest('chunkIndex required');
  res.json(await VideoService.saveChunk(req.params.uploadId, chunkIndex, req.file.buffer, req.user.id));
});

const uploadStatus = asyncHandler(async (req, res) => {
  res.json(await VideoService.uploadStatus(req.params.uploadId, req.user.id));
});

const completeUpload = asyncHandler(async (req, res) => {
  const video = await VideoService.completeUpload(req.params.uploadId, req.user.id, req.ip);
  res.json({ videoId: video._id, status: video.status });
});

const streamToken = asyncHandler(async (req, res) => {
  res.json(await VideoService.issueStreamToken(req.params.videoId, req.user, req.session._id));
});

const stream = asyncHandler(async (req, res) => {
  if (!req.query.token) throw ApiError.unauthorized('Stream token required');
  await VideoService.stream(req.params.videoId, req.query.token, req.headers.range, res);
});

const saveProgress = asyncHandler(async (req, res) => {
  res.json(await VideoService.saveProgress(req.user.id, req.params.videoId, req.body));
});

const listCourseVideos = asyncHandler(async (req, res) => {
  res.json(await VideoService.listCourseVideos(req.course._id));
});

const deleteVideo = asyncHandler(async (req, res) => {
  await VideoService.deleteVideo(req.params.videoId, req.user, req.ip);
  res.json({ message: 'Video deleted' });
});

const watermark = asyncHandler(async (req, res) => {
  res.json(await VideoService.watermarkData(req.user, req));
});

const videoViews = asyncHandler(async (req, res) => {
  res.json(await VideoService.courseVideoViews(req.course._id, req.params.videoId));
});

const resetVideoViews = asyncHandler(async (req, res) => {
  await VideoService.resetViews(req.course._id, req.params.videoId, req.params.studentId, req.user, req.ip);
  res.json({ message: 'This student can watch the video again' });
});

module.exports = {
  initUpload, uploadChunk, uploadStatus, completeUpload,
  streamToken, stream, saveProgress, listCourseVideos, deleteVideo, watermark,
  videoViews, resetVideoViews,
};
