const { z } = require('zod');
const { objectId } = require('../../middleware/validate');
const { COURSE_DIFFICULTY, LESSON_TYPES } = require('../../config/constants');

const courseSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  category: z.string().max(100).trim().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  difficulty: z.enum(COURSE_DIFFICULTY).optional(),
  language: z.string().max(10).optional(),
  price: z.number().min(0).optional(),
  currency: z.string().max(5).optional(),
  enrollmentLimit: z.number().int().min(0).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  visibility: z.enum(['listed', 'hidden']).optional(),
  isPublished: z.boolean().optional(),
  certificateEnabled: z.boolean().optional(),
  completionThreshold: z.number().min(0).max(100).optional(),
  thumbnail: objectId.nullable().optional(),
  teacher: objectId.optional(), // admin may assign another teacher
});

const sectionSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  order: z.number().int().min(0).optional(),
});

const lessonSchema = z.object({
  section: objectId,
  title: z.string().min(1).max(200).trim(),
  type: z.enum(LESSON_TYPES),
  video: objectId.nullable().optional(),
  fileAsset: objectId.nullable().optional(),
  quiz: objectId.nullable().optional(),
  assignment: objectId.nullable().optional(),
  content: z.string().max(100000).optional(),
  durationMinutes: z.number().min(0).optional(),
  isFree: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  sections: z.array(objectId).optional(),
  lessons: z.array(z.object({ sectionId: objectId, lessonIds: z.array(objectId) })).optional(),
  videos: z.array(objectId).optional(),
});

module.exports = { courseSchema, sectionSchema, lessonSchema, reorderSchema };
