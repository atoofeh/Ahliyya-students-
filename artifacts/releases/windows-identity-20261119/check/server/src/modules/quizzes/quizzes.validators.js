const { z } = require('zod');
const { objectId } = require('../../middleware/validate');
const { QUESTION_TYPES } = require('../../config/constants');

const optionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(2000).optional().default(''),
  image: objectId.nullable().optional(),
  isCorrect: z.boolean().optional().default(false),
});

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  text: z.string().min(1).max(10000).trim(),
  image: objectId.nullable().optional(),
  options: z.array(optionSchema).max(10).optional().default([]),
  multipleCorrect: z.boolean().optional().default(false),
  correctAnswers: z.array(z.string().max(500)).max(20).optional().default([]),
  caseSensitive: z.boolean().optional().default(false),
  points: z.number().min(0).max(1000).optional().default(1),
  negativePoints: z.number().min(0).max(1000).optional().default(0),
  explanation: z.string().max(5000).optional().default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
});

const quizSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).optional().default(''),
  questions: z.array(objectId).max(500).optional().default([]),
  pool: z.object({
    enabled: z.boolean().default(false),
    drawCount: z.number().int().min(1).max(500).default(10),
    tags: z.array(z.string().max(50)).optional().default([]),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional().default(null),
  }).optional(),
  timeLimitMinutes: z.number().int().min(0).max(600).optional().default(0),
  shuffleQuestions: z.boolean().optional(),
  shuffleAnswers: z.boolean().optional(),
  passingScore: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(0).max(100).optional(),
  negativeMarking: z.boolean().optional(),
  showExplanations: z.boolean().optional(),
  showResultsImmediately: z.boolean().optional(),
  leaderboardEnabled: z.boolean().optional(),
  availableFrom: z.coerce.date().nullable().optional(),
  availableUntil: z.coerce.date().nullable().optional(),
  isLocked: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  antiCheat: z.object({
    enabled: z.boolean().optional(),
    requireFullscreen: z.boolean().optional(),
    maxViolations: z.number().int().min(1).max(100).optional(),
    blockCopyPaste: z.boolean().optional(),
  }).optional(),
});

const answerSchema = z.object({
  questionId: objectId,
  selectedOptionIds: z.array(z.string().max(64)).max(10).optional().default([]),
  textAnswer: z.string().max(50000).optional().default(''),
  blanks: z.array(z.string().max(500)).max(20).optional().default([]),
});

const saveAnswersSchema = z.object({ answers: z.array(answerSchema).max(500), clientSavedAt: z.coerce.date().optional() });

const gradeSchema = z.object({
  grades: z.array(z.object({
    questionId: objectId,
    points: z.number().min(0).max(1000),
    feedback: z.string().max(5000).optional(),
  })).min(1),
});

const questionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

module.exports = { questionSchema, quizSchema, saveAnswersSchema, gradeSchema, questionListQuery };
