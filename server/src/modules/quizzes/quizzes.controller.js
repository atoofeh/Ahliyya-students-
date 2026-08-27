const asyncHandler = require('../../core/asyncHandler');
const QuizService = require('./quizzes.service');

// Question bank (owner/admin)
const createQuestion = asyncHandler(async (req, res) => {
  res.status(201).json(await QuizService.createQuestion(req.course._id, req.user.id, req.body));
});
const updateQuestion = asyncHandler(async (req, res) => {
  res.json(await QuizService.updateQuestion(req.course._id, req.params.questionId, req.body));
});
const deleteQuestion = asyncHandler(async (req, res) => {
  await QuizService.deleteQuestion(req.course._id, req.params.questionId);
  res.json({ message: 'Question deleted' });
});
const listQuestions = asyncHandler(async (req, res) => {
  res.json(await QuizService.listQuestions(req.course._id, req.query));
});

// Quiz CRUD
const createQuiz = asyncHandler(async (req, res) => {
  res.status(201).json(await QuizService.createQuiz(req.course._id, req.user.id, req.body, req.ip));
});
const updateQuiz = asyncHandler(async (req, res) => {
  res.json(await QuizService.updateQuiz(req.course._id, req.params.quizId, req.body, req.user.id, req.ip));
});
const deleteQuiz = asyncHandler(async (req, res) => {
  await QuizService.deleteQuiz(req.course._id, req.params.quizId, req.user.id, req.ip);
  res.json({ message: 'Quiz deleted' });
});
const listQuizzes = asyncHandler(async (req, res) => {
  res.json(await QuizService.listQuizzes(req.course._id, req.user));
});

// Attempts (student)
const startAttempt = asyncHandler(async (req, res) => {
  res.status(201).json(await QuizService.startAttempt(req.params.quizId, req.course._id, req.user.id, req.ip));
});
const saveAnswers = asyncHandler(async (req, res) => {
  res.json(await QuizService.saveAnswers(req.params.attemptId, req.user.id, req.body.answers));
});
const submitAttempt = asyncHandler(async (req, res) => {
  res.json(await QuizService.submitAttempt(req.params.attemptId, req.user.id, req.body.answers, req.ip));
});
const attemptResult = asyncHandler(async (req, res) => {
  res.json(await QuizService.getAttemptResult(req.params.attemptId, req.user));
});
const myAttempts = asyncHandler(async (req, res) => {
  res.json(await QuizService.myAttempts(req.user.id, req.query));
});

// Grading & stats (owner/admin)
const listAttempts = asyncHandler(async (req, res) => {
  res.json(await QuizService.listAttempts(req.params.quizId, req.course._id, req.query));
});
const gradeAttempt = asyncHandler(async (req, res) => {
  res.json(await QuizService.gradeAttempt(req.params.attemptId, req.user, req.body.grades, req.ip));
});
const invalidateAttempt = asyncHandler(async (req, res) => {
  res.json(await QuizService.invalidateAttempt(req.params.attemptId, req.user, req.body.reason, req.ip));
});
const quizStats = asyncHandler(async (req, res) => {
  res.json(await QuizService.quizStats(req.params.quizId, req.course._id));
});
const leaderboard = asyncHandler(async (req, res) => {
  res.json(await QuizService.leaderboard(req.params.quizId, req.course._id));
});
const remindStudents = asyncHandler(async (req, res) => {
  res.json(await QuizService.remindStudents(req.params.quizId, req.course._id, req.body.message));
});

module.exports = {
  createQuestion, updateQuestion, deleteQuestion, listQuestions,
  createQuiz, updateQuiz, deleteQuiz, listQuizzes,
  startAttempt, saveAnswers, submitAttempt, attemptResult, myAttempts,
  listAttempts, gradeAttempt, invalidateAttempt, quizStats, leaderboard, remindStudents,
};
