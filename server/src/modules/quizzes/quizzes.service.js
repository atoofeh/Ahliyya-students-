const ApiError = require('../../core/ApiError');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const Quiz = require('../../models/Quiz');
const Question = require('../../models/Question');
const QuizAttempt = require('../../models/QuizAttempt');
const Enrollment = require('../../models/Enrollment');
const { notifyUser, notifyMany } = require('../notifications/notifications.service');

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normalizeAnswer = (s, caseSensitive) => {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return caseSensitive ? t : t.toLowerCase();
};

class QuizService {
  // ── Question bank ───────────────────────────────────────────────────

  static async createQuestion(courseId, userId, data) {
    QuizService.#validateQuestionPayload(data);
    return Question.create({ ...data, course: courseId, createdBy: userId });
  }

  static async updateQuestion(courseId, questionId, data) {
    if (data.type || data.options || data.correctAnswers) {
      const existing = await Question.findOne({ _id: questionId, course: courseId, deletedAt: null }).select('+correctAnswers +options.isCorrect');
      if (!existing) throw ApiError.notFound('Question not found');
      QuizService.#validateQuestionPayload({ ...existing.toObject(), ...data });
    }
    const question = await Question.findOneAndUpdate(
      { _id: questionId, course: courseId, deletedAt: null }, { $set: data }, { new: true }
    ).select('+correctAnswers +options.isCorrect');
    if (!question) throw ApiError.notFound('Question not found');
    return question;
  }

  static async deleteQuestion(courseId, questionId) {
    const question = await Question.findOne({ _id: questionId, course: courseId, deletedAt: null });
    if (!question) throw ApiError.notFound('Question not found');
    question.deletedAt = new Date();
    await question.save();
    await Quiz.updateMany({ course: courseId }, { $pull: { questions: questionId } });
  }

  static async listQuestions(courseId, { page, limit, search, tag, difficulty }) {
    const filter = { course: courseId, deletedAt: null };
    if (search) filter.$text = { $search: search };
    if (tag) filter.tags = tag;
    if (difficulty) filter.difficulty = difficulty;
    // Teacher view includes answers.
    const { skip } = require('../../core/pagination').paginate(page, limit);
    const [items, total] = await Promise.all([
      Question.find(filter).select('+correctAnswers +options.isCorrect').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Question.countDocuments(filter),
    ]);
    return { items, meta: require('../../core/pagination').paginationMeta(total, page, limit) };
  }

  static #validateQuestionPayload(data) {
    const choiceTypes = ['multiple_choice', 'true_false', 'image_choice'];
    if (choiceTypes.includes(data.type)) {
      const options = data.options || [];
      if (options.length < 2) throw ApiError.badRequest('Choice questions need at least 2 options');
      const correct = options.filter((o) => o.isCorrect);
      if (!correct.length) throw ApiError.badRequest('Mark at least one option as correct');
      if (!data.multipleCorrect && correct.length > 1) {
        throw ApiError.badRequest('Single-answer question has multiple correct options — enable multipleCorrect');
      }
      if (data.type === 'true_false' && options.length !== 2) {
        throw ApiError.badRequest('True/False questions must have exactly 2 options');
      }
    }
    if (['short_answer', 'fill_blanks'].includes(data.type)) {
      if (!data.correctAnswers?.length) throw ApiError.badRequest('Provide at least one accepted answer');
      if (data.type === 'fill_blanks') {
        const blanks = (String(data.text).match(/\{\{blank\}\}/g) || []).length;
        if (!blanks) throw ApiError.badRequest('fill_blanks text must contain {{blank}} markers');
        if (blanks !== data.correctAnswers.length) {
          throw ApiError.badRequest(`Text has ${blanks} blanks but ${data.correctAnswers.length} answers were provided`);
        }
      }
    }
  }

  // ── Quiz CRUD ───────────────────────────────────────────────────────

  static async createQuiz(courseId, userId, data, ip) {
    if (data.questions?.length) await QuizService.#assertQuestionsInCourse(courseId, data.questions);
    const quiz = await Quiz.create({ ...data, course: courseId, createdBy: userId });
    await audit({ user: userId, action: 'QUIZ_CREATED', course: courseId, ip, resource: `quiz:${quiz._id}` });
    const CourseService = require('../courses/courses.service');
    await CourseService.refreshCourseAggregates(courseId);
    return quiz;
  }

  static async updateQuiz(courseId, quizId, data, userId, ip) {
    if (data.questions?.length) await QuizService.#assertQuestionsInCourse(courseId, data.questions);
    const quiz = await Quiz.findOneAndUpdate(
      { _id: quizId, course: courseId, deletedAt: null }, { $set: data }, { new: true });
    if (!quiz) throw ApiError.notFound('Quiz not found');
    let action = 'QUIZ_UPDATED';
    if (data.isLocked === true) action = 'QUIZ_LOCKED';
    if (data.isLocked === false) action = 'QUIZ_UNLOCKED';
    await audit({ user: userId, action, course: courseId, ip, resource: `quiz:${quizId}` });
    return quiz;
  }

  static async deleteQuiz(courseId, quizId, userId, ip) {
    const quiz = await Quiz.findOne({ _id: quizId, course: courseId, deletedAt: null });
    if (!quiz) throw ApiError.notFound('Quiz not found');
    quiz.deletedAt = new Date();
    await quiz.save();
    await audit({ user: userId, action: 'QUIZ_DELETED', course: courseId, ip, resource: `quiz:${quizId}` });
  }

  static async #assertQuestionsInCourse(courseId, questionIds) {
    const count = await Question.countDocuments({ _id: { $in: questionIds }, course: courseId, deletedAt: null });
    if (count !== questionIds.length) {
      throw ApiError.badRequest('Some questions do not belong to this course');
    }
  }

  static async listQuizzes(courseId, user) {
    const filter = { course: courseId, deletedAt: null };
    const isStaff = user.role !== 'student';
    if (!isStaff) filter.isPublished = true;
    const quizzes = await Quiz.find(filter).sort({ createdAt: -1 }).lean();

    if (isStaff) return quizzes;

    // Attach the student's attempt summary to each quiz.
    const attempts = await QuizAttempt.find({ student: user.id, course: courseId })
      .select('quiz status percent passed attemptNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return quizzes.map((q) => ({
      ...q,
      myAttempts: attempts.filter((a) => String(a.quiz) === String(q._id)),
    }));
  }

  // ── Attempt lifecycle ───────────────────────────────────────────────

  static async startAttempt(quizId, courseId, studentId, ip) {
    const quiz = await Quiz.findOne({ _id: quizId, course: courseId, deletedAt: null });
    if (!quiz || !quiz.isPublished) throw ApiError.notFound('Quiz not found');
    if (quiz.isLocked) throw ApiError.forbidden('This quiz is currently locked', 'QUIZ_LOCKED');
    const now = new Date();
    if (quiz.availableFrom && now < quiz.availableFrom) {
      throw ApiError.forbidden(`Quiz opens at ${quiz.availableFrom.toISOString()}`, 'QUIZ_NOT_OPEN');
    }
    if (quiz.availableUntil && now > quiz.availableUntil) {
      throw ApiError.forbidden('The quiz window has closed', 'QUIZ_CLOSED');
    }

    // Resume an in-progress attempt if one exists and hasn't expired.
    // (Answer-key fields are select:false; grading paths must opt in.)
    const inProgress = await QuizAttempt.findOne({ quiz: quizId, student: studentId, status: 'in_progress' })
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect');
    if (inProgress) {
      if (inProgress.deadlineAt && now > inProgress.deadlineAt) {
        await QuizService.#finalizeAttempt(inProgress, { autoSubmitted: true });
      } else {
        return QuizService.#attemptForStudent(inProgress, quiz);
      }
    }

    const priorCount = await QuizAttempt.countDocuments({
      quiz: quizId, student: studentId, status: { $ne: 'in_progress' },
    });
    if (quiz.maxAttempts > 0 && priorCount >= quiz.maxAttempts) {
      throw ApiError.forbidden(`Attempt limit reached (${quiz.maxAttempts})`, 'ATTEMPTS_EXHAUSTED');
    }

    // Select questions: explicit list or random pool draw.
    let questionDocs;
    if (quiz.pool?.enabled) {
      const poolFilter = { course: courseId, deletedAt: null };
      if (quiz.pool.tags?.length) poolFilter.tags = { $in: quiz.pool.tags };
      if (quiz.pool.difficulty) poolFilter.difficulty = quiz.pool.difficulty;
      const all = await Question.find(poolFilter).select('+correctAnswers +options.isCorrect').lean();
      if (all.length < quiz.pool.drawCount) {
        throw ApiError.badRequest(`Question pool has only ${all.length} of the required ${quiz.pool.drawCount} questions`, 'POOL_TOO_SMALL');
      }
      questionDocs = shuffle(all).slice(0, quiz.pool.drawCount);
    } else {
      questionDocs = await Question.find({ _id: { $in: quiz.questions }, deletedAt: null })
        .select('+correctAnswers +options.isCorrect').lean();
      if (!questionDocs.length) throw ApiError.badRequest('This quiz has no questions yet', 'QUIZ_EMPTY');
      if (quiz.shuffleQuestions) questionDocs = shuffle(questionDocs);
      else {
        const order = quiz.questions.map(String);
        questionDocs.sort((a, b) => order.indexOf(String(a._id)) - order.indexOf(String(b._id)));
      }
    }

    const snapshot = questionDocs.map((q) => ({
      questionId: q._id,
      type: q.type,
      text: q.text,
      image: q.image,
      options: quiz.shuffleAnswers && q.type !== 'true_false' ? shuffle(q.options || []) : (q.options || []),
      multipleCorrect: q.multipleCorrect,
      correctAnswers: q.correctAnswers || [],
      caseSensitive: q.caseSensitive,
      points: q.points ?? 1,
      negativePoints: q.negativePoints ?? 0,
      explanation: q.explanation,
    }));

    const attempt = await QuizAttempt.create({
      quiz: quizId,
      student: studentId,
      course: courseId,
      attemptNumber: priorCount + 1,
      questionsSnapshot: snapshot,
      maxScore: snapshot.reduce((s, q) => s + q.points, 0),
      deadlineAt: quiz.timeLimitMinutes ? new Date(Date.now() + quiz.timeLimitMinutes * 60000) : null,
    });

    await audit({ user: studentId, action: 'QUIZ_STARTED', course: courseId, ip, resource: `attempt:${attempt._id}` });
    return QuizService.#attemptForStudent(attempt, quiz);
  }

  /** Student-safe attempt view: strips answer keys & explanations. */
  static #attemptForStudent(attempt, quiz) {
    return {
      attemptId: attempt._id,
      quiz: {
        id: quiz._id,
        title: quiz.title,
        timeLimitMinutes: quiz.timeLimitMinutes,
        passingScore: quiz.passingScore,
        antiCheat: quiz.antiCheat,
      },
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      answers: attempt.answers,
      questions: attempt.questionsSnapshot.map((q) => ({
        questionId: q.questionId,
        type: q.type,
        text: q.text,
        image: q.image,
        multipleCorrect: q.multipleCorrect,
        points: q.points,
        options: (q.options || []).map((o) => ({ id: o.id, text: o.text, image: o.image })),
      })),
    };
  }

  /** Autosave answers during the attempt. */
  static async saveAnswers(attemptId, studentId, answers) {
    const attempt = await QuizAttempt.findOne({ _id: attemptId, student: studentId, status: 'in_progress' })
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect');
    if (!attempt) throw ApiError.notFound('Active attempt not found');
    if (attempt.deadlineAt && new Date() > new Date(attempt.deadlineAt.getTime() + 30000)) {
      await QuizService.#finalizeAttempt(attempt, { autoSubmitted: true });
      throw ApiError.forbidden('Time is up — attempt auto-submitted', 'TIME_UP');
    }
    const validIds = new Set(attempt.questionsSnapshot.map((q) => String(q.questionId)));
    attempt.answers = answers.filter((a) => validIds.has(String(a.questionId)));
    await attempt.save();
    return { saved: true, savedAt: new Date() };
  }

  static async submitAttempt(attemptId, studentId, answers, ip) {
    const attempt = await QuizAttempt.findOne({ _id: attemptId, student: studentId, status: 'in_progress' })
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect');
    if (!attempt) throw ApiError.notFound('Active attempt not found');
    if (answers?.length) {
      const validIds = new Set(attempt.questionsSnapshot.map((q) => String(q.questionId)));
      attempt.answers = answers.filter((a) => validIds.has(String(a.questionId)));
    }
    const late = attempt.deadlineAt && new Date() > new Date(attempt.deadlineAt.getTime() + 30000);
    await QuizService.#finalizeAttempt(attempt, { autoSubmitted: late });
    await audit({ user: studentId, action: 'QUIZ_SUBMIT', course: attempt.course, ip, resource: `attempt:${attempt._id}` });
    return QuizService.getAttemptResult(attemptId, { id: studentId, role: 'student' });
  }

  static async #finalizeAttempt(attempt, { autoSubmitted = false } = {}) {
    const quiz = await Quiz.findById(attempt.quiz);
    let score = 0;
    let needsManual = false;

    const answerByQ = Object.fromEntries(attempt.answers.map((a) => [String(a.questionId), a]));
    const gradedAnswers = attempt.questionsSnapshot.map((q) => {
      const given = answerByQ[String(q.questionId)] || { questionId: q.questionId };
      const graded = QuizService.#gradeAnswer(q, given, quiz?.negativeMarking);
      if (graded.needsManualGrading) needsManual = true;
      score += graded.pointsAwarded;
      return graded;
    });

    attempt.answers = gradedAnswers;
    attempt.score = Math.max(0, Math.round(score * 100) / 100);
    attempt.percent = attempt.maxScore ? Math.max(0, Math.round((attempt.score / attempt.maxScore) * 10000) / 100) : 0;
    attempt.pendingManualGrading = needsManual;
    attempt.passed = needsManual ? null : attempt.percent >= (quiz?.passingScore ?? 60);
    attempt.status = autoSubmitted ? 'auto_submitted' : needsManual ? 'submitted' : 'graded';
    attempt.submittedAt = new Date();
    await attempt.save();

    if (!needsManual) {
      await notifyUser(attempt.student, {
        type: 'quiz_graded',
        title: `Quiz graded: ${quiz?.title || 'Quiz'}`,
        body: `Score ${attempt.percent}% — ${attempt.passed ? 'Passed' : 'Not passed'}`,
        link: `/student/attempts/${attempt._id}`,
        course: attempt.course,
      });
    }
    return attempt;
  }

  static #gradeAnswer(q, given, negativeMarking) {
    const base = {
      questionId: q.questionId,
      selectedOptionIds: given.selectedOptionIds || [],
      textAnswer: given.textAnswer || '',
      blanks: given.blanks || [],
      autoGraded: true,
      needsManualGrading: false,
      graderFeedback: '',
    };

    if (q.type === 'essay') {
      return { ...base, autoGraded: false, needsManualGrading: !!base.textAnswer, isCorrect: null, pointsAwarded: 0 };
    }

    let isCorrect = false;
    let answered = false;

    if (['multiple_choice', 'true_false', 'image_choice'].includes(q.type)) {
      const correctIds = (q.options || []).filter((o) => o.isCorrect).map((o) => o.id).sort();
      const givenIds = [...base.selectedOptionIds].sort();
      answered = givenIds.length > 0;
      isCorrect = answered && correctIds.length === givenIds.length && correctIds.every((id, i) => id === givenIds[i]);
    } else if (q.type === 'short_answer') {
      answered = !!base.textAnswer.trim();
      const accepted = (q.correctAnswers || []).map((a) => normalizeAnswer(a, q.caseSensitive));
      isCorrect = answered && accepted.includes(normalizeAnswer(base.textAnswer, q.caseSensitive));
    } else if (q.type === 'fill_blanks') {
      const accepted = q.correctAnswers || [];
      answered = base.blanks.some((b) => String(b).trim());
      isCorrect = answered && accepted.length === base.blanks.length &&
        accepted.every((a, i) => {
          const options = String(a).split('|'); // multiple accepted per blank: "colour|color"
          return options.some((opt) => normalizeAnswer(opt, q.caseSensitive) === normalizeAnswer(base.blanks[i], q.caseSensitive));
        });
    }

    let pointsAwarded = 0;
    if (isCorrect) pointsAwarded = q.points;
    else if (answered && negativeMarking) pointsAwarded = -(q.negativePoints || 0);

    return { ...base, isCorrect, pointsAwarded };
  }

  // ── Results, manual grading, analytics ─────────────────────────────

  static async getAttemptResult(attemptId, user) {
    const attempt = await QuizAttempt.findById(attemptId)
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect +questionsSnapshot.explanation')
      .populate('quiz', 'title showExplanations showResultsImmediately passingScore')
      .populate('student', 'name username');
    if (!attempt) throw ApiError.notFound('Attempt not found');

    const isOwner = String(attempt.student._id) === String(user.id);
    const isStaff = user.role !== 'student';
    if (!isOwner && !isStaff) throw ApiError.forbidden('Not your attempt');

    const obj = attempt.toObject();
    const showDetails = isStaff || attempt.quiz?.showResultsImmediately;

    if (!showDetails) {
      return {
        _id: obj._id, quiz: obj.quiz, status: obj.status, submittedAt: obj.submittedAt,
        pendingManualGrading: obj.pendingManualGrading,
        message: 'Results will be released by your instructor.',
      };
    }

    // Students see correct answers/explanations only per quiz policy.
    if (!isStaff && !attempt.quiz?.showExplanations) {
      obj.questionsSnapshot = obj.questionsSnapshot.map((q) => ({
        ...q, correctAnswers: undefined, explanation: undefined,
        options: (q.options || []).map((o) => ({ id: o.id, text: o.text, image: o.image })),
      }));
    }
    return obj;
  }

  static async listAttempts(quizId, courseId, { page, limit }) {
    return paginatedQuery(QuizAttempt, { quiz: quizId, course: courseId }, {
      page, limit,
      populate: { path: 'student', select: 'name username email' },
      sort: { createdAt: -1 },
      select: 'quiz student course attemptNumber status score maxScore percent passed pendingManualGrading violationCount riskScore invalidatedReason startedAt deadlineAt submittedAt createdAt',
    });
  }

  static async myAttempts(studentId, { page, limit }) {
    return paginatedQuery(QuizAttempt, { student: studentId, status: { $ne: 'in_progress' } }, {
      page, limit,
      populate: [{ path: 'quiz', select: 'title passingScore' }, { path: 'course', select: 'title' }],
      sort: { createdAt: -1 },
      select: 'quiz student course attemptNumber status score maxScore percent passed pendingManualGrading violationCount riskScore invalidatedReason startedAt deadlineAt submittedAt createdAt',
    });
  }

  /** Manual grading for essay / overridden questions. */
  static async gradeAttempt(attemptId, grader, grades, ip) {
    const attempt = await QuizAttempt.findById(attemptId)
      .select('+questionsSnapshot.correctAnswers +questionsSnapshot.options.isCorrect');
    if (!attempt) throw ApiError.notFound('Attempt not found');
    if (attempt.status === 'in_progress') throw ApiError.badRequest('Attempt not submitted yet');

    const quiz = await Quiz.findById(attempt.quiz);
    const byQ = Object.fromEntries(grades.map((g) => [String(g.questionId), g]));

    attempt.answers = attempt.answers.map((a) => {
      const grade = byQ[String(a.questionId)];
      if (!grade) return a;
      const snap = attempt.questionsSnapshot.find((q) => String(q.questionId) === String(a.questionId));
      const max = snap?.points ?? 1;
      return {
        ...a.toObject(),
        pointsAwarded: Math.min(Math.max(0, grade.points), max),
        isCorrect: grade.points >= max,
        graderFeedback: grade.feedback || '',
        needsManualGrading: false,
        autoGraded: false,
      };
    });

    attempt.score = Math.max(0, attempt.answers.reduce((s, a) => s + (a.pointsAwarded || 0), 0));
    attempt.percent = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 10000) / 100 : 0;
    attempt.pendingManualGrading = attempt.answers.some((a) => a.needsManualGrading);
    if (!attempt.pendingManualGrading) {
      attempt.passed = attempt.percent >= (quiz?.passingScore ?? 60);
      attempt.status = 'graded';
    }
    attempt.gradedBy = grader.id;
    await attempt.save();

    await audit({ user: grader.id, action: 'QUIZ_GRADED', course: attempt.course, ip, resource: `attempt:${attemptId}` });
    await notifyUser(attempt.student, {
      type: 'quiz_graded',
      title: `Quiz graded: ${quiz?.title || 'Quiz'}`,
      body: `Score ${attempt.percent}%${attempt.passed != null ? ` — ${attempt.passed ? 'Passed' : 'Not passed'}` : ''}`,
      link: `/student/attempts/${attempt._id}`,
      course: attempt.course,
    });
    return attempt;
  }

  static async invalidateAttempt(attemptId, actor, reason, ip) {
    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) throw ApiError.notFound('Attempt not found');
    attempt.status = 'invalidated';
    attempt.invalidatedReason = reason || 'Invalidated by instructor';
    attempt.passed = false;
    await attempt.save();
    await audit({ user: actor.id, action: 'ATTEMPT_INVALIDATED', course: attempt.course, ip, resource: `attempt:${attemptId}`, meta: { reason } });
    return attempt;
  }

  static async quizStats(quizId, courseId) {
    const attempts = await QuizAttempt.find({
      quiz: quizId, course: courseId, status: { $in: ['graded', 'submitted', 'auto_submitted'] },
    }).select('percent passed student violationCount riskScore').lean();

    if (!attempts.length) {
      return { attempts: 0, avgPercent: 0, passRate: 0, highest: 0, lowest: 0, distribution: [], flaggedAttempts: 0 };
    }
    const percents = attempts.map((a) => a.percent || 0);
    const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${i * 10 + 10}`, count: 0 }));
    percents.forEach((p) => buckets[Math.min(9, Math.floor(p / 10))].count++);

    return {
      attempts: attempts.length,
      uniqueStudents: new Set(attempts.map((a) => String(a.student))).size,
      avgPercent: Math.round(percents.reduce((s, p) => s + p, 0) / percents.length * 10) / 10,
      passRate: Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 1000) / 10,
      highest: Math.max(...percents),
      lowest: Math.min(...percents),
      distribution: buckets,
      flaggedAttempts: attempts.filter((a) => (a.riskScore || 0) >= 30).length,
    };
  }

  static async leaderboard(quizId, courseId) {
    const quiz = await Quiz.findOne({ _id: quizId, course: courseId, deletedAt: null });
    if (!quiz?.leaderboardEnabled) throw ApiError.forbidden('Leaderboard disabled for this quiz');
    const rows = await QuizAttempt.aggregate([
      { $match: { quiz: quiz._id, status: { $in: ['graded', 'submitted', 'auto_submitted'] } } },
      { $sort: { percent: -1, submittedAt: 1 } },
      { $group: { _id: '$student', best: { $first: '$percent' }, submittedAt: { $first: '$submittedAt' } } },
      { $sort: { best: -1, submittedAt: 1 } },
      { $limit: 20 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $project: { name: '$student.name', percent: '$best', submittedAt: 1 } },
    ]);
    return rows.map((r, i) => ({ rank: i + 1, ...r }));
  }

  /** Notify enrolled students about a quiz (schedule reminder). */
  static async remindStudents(quizId, courseId, message) {
    const quiz = await Quiz.findOne({ _id: quizId, course: courseId, deletedAt: null });
    if (!quiz) throw ApiError.notFound('Quiz not found');
    const enrollments = await Enrollment.find({ course: courseId, status: 'active' }).select('student');
    await notifyMany(enrollments.map((e) => e.student), {
      type: 'quiz_reminder',
      title: `Reminder: ${quiz.title}`,
      body: message || (quiz.availableUntil ? `Closes ${quiz.availableUntil.toLocaleString()}` : 'Quiz is available now'),
      link: `/student/courses/${courseId}`,
      course: courseId,
      email: true,
    });
    return { notified: enrollments.length };
  }
}

module.exports = QuizService;
