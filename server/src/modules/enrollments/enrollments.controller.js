const asyncHandler = require('../../core/asyncHandler');
const EnrollmentService = require('./enrollments.service');

const clientIp = (req) => req.ip || '';

// Codes (owner/admin)
const generateCodes = asyncHandler(async (req, res) => {
  const codes = await EnrollmentService.generateCodes(req.course._id, req.user.id, req.body);
  res.status(201).json(codes);
});
const listCodes = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.listCodes(req.course._id, req.query));
});
const revokeCode = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.revokeCode(req.course._id, req.params.codeId));
});

// Student enrollment
const redeemCode = asyncHandler(async (req, res) => {
  const enrollment = await EnrollmentService.enrollWithCode(req.user.id, req.body.code, clientIp(req));
  res.status(201).json(enrollment);
});
const myEnrollments = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.myEnrollments(req.user.id));
});
const toggleFavorite = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.toggleFavorite(req.user.id, req.params.courseId));
});

// Roster management (owner/admin)
const listStudents = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.listStudents(req.course._id, req.query));
});
const assignStudent = asyncHandler(async (req, res) => {
  const enrollment = await EnrollmentService.assignStudent(req.course._id, req.body.student, req.user.id, clientIp(req));
  res.status(201).json(enrollment);
});
const removeStudent = asyncHandler(async (req, res) => {
  await EnrollmentService.removeStudent(req.course._id, req.params.studentId, req.user.id, clientIp(req));
  res.json({ message: 'Student removed' });
});
const expireAccess = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.expireStudentAccess(
    req.course._id, req.params.studentId, req.body.expiresAt, req.user.id, clientIp(req)));
});

// Progress & certificates
const completeLesson = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.markLessonComplete(req.user.id, req.course._id, req.params.lessonId));
});
const myCertificates = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.myCertificates(req.user.id));
});
const verifyCertificate = asyncHandler(async (req, res) => {
  res.json(await EnrollmentService.verifyCertificate(req.params.serial));
});

module.exports = {
  generateCodes, listCodes, revokeCode, redeemCode, myEnrollments,
  toggleFavorite, listStudents, assignStudent, removeStudent, expireAccess,
  completeLesson, myCertificates, verifyCertificate,
};
