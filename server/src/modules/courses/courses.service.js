const ApiError = require('../../core/ApiError');
const { isCourseStaff, staffCourseFilter } = require('./courseStaff');
const audit = require('../../core/audit');
const { paginatedQuery } = require('../../core/pagination');
const Course = require('../../models/Course');
const Section = require('../../models/Section');
const Lesson = require('../../models/Lesson');
const Enrollment = require('../../models/Enrollment');
const LessonProgress = require('../../models/LessonProgress');
const Video = require('../../models/Video');
const FileAsset = require('../../models/FileAsset');
const Quiz = require('../../models/Quiz');
const Question = require('../../models/Question');
const Assignment = require('../../models/Assignment');
const Announcement = require('../../models/Announcement');
const QAThread = require('../../models/QAThread');

class CourseService {
  // ── Courses ─────────────────────────────────────────────────────────

  static async createCourse(teacherId, data, ip) {
    const course = await Course.create({ ...data, teacher: data.teacher || teacherId });
    await audit({ user: teacherId, action: 'COURSE_CREATED', course: course._id, ip });
    return course;
  }

  static async updateCourse(course, data, actorId, ip) {
    const publishing = data.isPublished === true && !course.isPublished;
    Object.assign(course, data);
    await course.save();
    await audit({ user: actorId, action: publishing ? 'COURSE_PUBLISHED' : 'COURSE_UPDATED', course: course._id, ip });
    return course;
  }

  /**
   * Deleting a course takes its content with it.
   *
   * Previously this marked only the course, so every lesson, quiz and — crucially
   * — every uploaded video stayed live: still counted by the storage figure on the
   * dashboard, and still occupying disk. A single deleted course could leave
   * hundreds of megabytes behind with nothing in the interface pointing at it.
   *
   * Media bytes are removed here, the same way deleting a single video or file
   * already does. Academic history is deliberately kept: certificates, quiz
   * attempts, submissions and progress are a record of what a student actually
   * did, and the audit log is never touched.
   */
  static async deleteCourse(course, actorId, ip) {
    const now = new Date();
    const courseId = course._id;

    course.deletedAt = now;
    course.isPublished = false;
    await course.save();

    const softDelete = (model, extra = {}) =>
      model.updateMany({ course: courseId, deletedAt: null, ...extra }, { $set: { deletedAt: now } });

    // Reclaim the bytes before the records are marked, so a failure here cannot
    // orphan a file that nothing points to any more.
    const freed = await CourseService.#purgeCourseMedia(courseId);

    await Promise.all([
      softDelete(Section),
      softDelete(Lesson),
      softDelete(Video),
      softDelete(FileAsset),
      softDelete(Quiz),
      softDelete(Question),
      softDelete(Assignment),
      softDelete(Announcement),
      softDelete(QAThread),
      Enrollment.updateMany({ course: courseId, status: 'active' }, { $set: { status: 'removed' } }),
    ]);

    await audit({
      user: actorId, action: 'COURSE_DELETED', course: courseId, ip,
      meta: { videosRemoved: freed.videos, filesRemoved: freed.files, bytesFreed: freed.bytes },
    });
  }

  /** Unlinks the encrypted media of a course and reports what it reclaimed. */
  static async #purgeCourseMedia(courseId) {
    const fs = require('fs');
    const path = require('path');
    let bytes = 0;

    const videos = await Video.find({ course: courseId, deletedAt: null }).select('+storagePath sizeBytes');
    for (const v of videos) {
      bytes += v.sizeBytes || 0;
      // Each video owns a directory; deleting a single video removes it the same way.
      if (v.storagePath) await fs.promises.rm(path.dirname(v.storagePath), { recursive: true, force: true }).catch(() => {});
    }

    const files = await FileAsset.find({ course: courseId, deletedAt: null }).select('+storagePath sizeBytes');
    for (const f of files) {
      bytes += f.sizeBytes || 0;
      if (f.storagePath) await fs.promises.unlink(f.storagePath).catch(() => {});
    }

    return { videos: videos.length, files: files.length, bytes };
  }

  /** Catalog: published courses their teacher chose to list. */
  static async catalog({ page, limit, search, category }) {
    const filter = { deletedAt: null, isPublished: true, visibility: 'listed' };
    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;
    return paginatedQuery(Course, filter, {
      page, limit,
      populate: { path: 'teacher', select: 'name' },
      select: '-__v',
    });
  }

  /** Courses this teacher runs — created or co-taught. */
  static async teacherCourses(teacherId, { page, limit, search }) {
    const filter = { ...staffCourseFilter(teacherId), deletedAt: null };
    if (search) filter.$text = { $search: search };
    return paginatedQuery(Course, filter, { page, limit });
  }

  static async allCourses({ page, limit, search }) {
    const filter = { deletedAt: null };
    if (search) filter.$text = { $search: search };
    return paginatedQuery(Course, filter, { page, limit, populate: { path: 'teacher', select: 'name username' } });
  }

  /**
   * Full course detail with curriculum. Students only see published lessons;
   * grading/internal data never leaves the select projections.
   */
  static async courseDetail(course, user, enrollment) {
    const isStaff = isCourseStaff(course, user);
    const lessonFilter = { course: course._id, deletedAt: null, ...(isStaff ? {} : { isPublished: true }) };

    const [sections, lessons, progress] = await Promise.all([
      Section.find({ course: course._id, deletedAt: null }).sort({ order: 1 }).lean(),
      Lesson.find(lessonFilter).sort({ order: 1 }).select('-content').lean(),
      user.role === 'student'
        ? LessonProgress.find({ student: user.id, course: course._id }).lean()
        : Promise.resolve([]),
    ]);

    const progressByLesson = Object.fromEntries(progress.map((p) => [String(p.lesson), p]));
    const curriculum = sections.map((s) => ({
      ...s,
      lessons: lessons
        .filter((l) => String(l.section) === String(s._id))
        .map((l) => ({
          ...l,
          progress: progressByLesson[String(l._id)] || null,
        })),
    }));

    const teacher = await require('../../models/User').findById(course.teacher).select('name username');
    return {
      course: { ...course.toObject(), teacher },
      curriculum,
      enrollment: enrollment || null,
    };
  }

  /**
   * Preview of a listed course for someone who is not enrolled.
   *
   * Returns the course card plus only the lessons its teacher marked free —
   * never the paid curriculum, never quizzes, assignments or announcements.
   * The lesson list is the same set requireLessonAccess will let them open.
   */
  static async coursePreview(courseId, user) {
    const course = await Course.findOne({ _id: courseId, deletedAt: null, isPublished: true, visibility: 'listed' });
    if (!course) throw ApiError.notFound('Course not found');

    const [freeLessons, lessonCount, teacher, enrollment] = await Promise.all([
      Lesson.find({ course: course._id, deletedAt: null, isPublished: true, isFree: true })
        .sort({ order: 1 })
        .select('title type durationMinutes order section video')
        .lean(),
      Lesson.countDocuments({ course: course._id, deletedAt: null, isPublished: true }),
      require('../../models/User').findById(course.teacher).select('name username'),
      user.role === 'student'
        ? Enrollment.findOne({ student: user.id, course: course._id, status: 'active' }).lean()
        : Promise.resolve(null),
    ]);

    return {
      course: {
        _id: course._id,
        title: course.title,
        description: course.description,
        category: course.category,
        difficulty: course.difficulty,
        thumbnail: course.thumbnail,
        durationMinutes: course.durationMinutes,
        tags: course.tags,
        teacher,
      },
      lessonCount,
      freeLessons,
      enrolled: !!enrollment,
    };
  }

  // ── Sections ────────────────────────────────────────────────────────

  static async createSection(courseId, data) {
    const count = await Section.countDocuments({ course: courseId, deletedAt: null });
    return Section.create({ ...data, course: courseId, order: data.order ?? count });
  }

  static async updateSection(courseId, sectionId, data) {
    const section = await Section.findOneAndUpdate(
      { _id: sectionId, course: courseId, deletedAt: null },
      { $set: data },
      { new: true }
    );
    if (!section) throw ApiError.notFound('Section not found');
    return section;
  }

  static async deleteSection(courseId, sectionId) {
    const section = await Section.findOne({ _id: sectionId, course: courseId, deletedAt: null });
    if (!section) throw ApiError.notFound('Section not found');
    section.deletedAt = new Date();
    await section.save();
    await Lesson.updateMany({ section: sectionId }, { $set: { deletedAt: new Date() } });
    await CourseService.refreshCourseAggregates(courseId);
  }

  // ── Lessons ─────────────────────────────────────────────────────────

  static async createLesson(courseId, data) {
    const section = await Section.findOne({ _id: data.section, course: courseId, deletedAt: null });
    if (!section) throw ApiError.badRequest('Section does not belong to this course');
    const count = await Lesson.countDocuments({ section: data.section, deletedAt: null });
    const lesson = await Lesson.create({ ...data, course: courseId, order: data.order ?? count });
    await CourseService.refreshCourseAggregates(courseId);
    return lesson;
  }

  static async updateLesson(courseId, lessonId, data) {
    const lesson = await Lesson.findOneAndUpdate(
      { _id: lessonId, course: courseId, deletedAt: null },
      { $set: data },
      { new: true }
    );
    if (!lesson) throw ApiError.notFound('Lesson not found');
    await CourseService.refreshCourseAggregates(courseId);
    return lesson;
  }

  static async deleteLesson(courseId, lessonId) {
    const lesson = await Lesson.findOne({ _id: lessonId, course: courseId, deletedAt: null });
    if (!lesson) throw ApiError.notFound('Lesson not found');
    lesson.deletedAt = new Date();
    await lesson.save();
    await CourseService.refreshCourseAggregates(courseId);
  }

  static async getLesson(courseId, lessonId, user, { previewOnly = false } = {}) {
    const lesson = await Lesson.findOne({ _id: lessonId, course: courseId, deletedAt: null })
      .populate('fileAsset', 'originalName mimeType sizeBytes downloadable')
      .populate('video', 'title status durationSeconds thumbnail')
      .populate('quiz', 'title timeLimitMinutes passingScore maxAttempts isLocked isPublished availableFrom availableUntil')
      .populate('assignment', 'title dueAt maxPoints isPublished');
    if (!lesson) throw ApiError.notFound('Lesson not found');

    if (user.role === 'student' && !previewOnly) {
      if (!lesson.isPublished) throw ApiError.forbidden('Lesson not available');
      // Touch progress record for recent-activity feeds.
      await LessonProgress.findOneAndUpdate(
        { student: user.id, lesson: lessonId },
        { $set: { course: courseId, lastAccessedAt: new Date() } },
        { upsert: true }
      );
    }
    return lesson;
  }

  static async reorder(courseId, { sections = [], lessons = [] }) {
    const ops = [];
    sections.forEach((s, idx) =>
      ops.push(Section.updateOne({ _id: s, course: courseId }, { $set: { order: idx } })));
    for (const group of lessons) {
      group.lessonIds.forEach((id, idx) =>
        ops.push(Lesson.updateOne({ _id: id, course: courseId }, { $set: { order: idx, section: group.sectionId } })));
    }
    await Promise.all(ops);
  }

  /** Recompute denormalized counters used on catalog cards. */
  static async refreshCourseAggregates(courseId) {
    const [lessonCount, duration, quizCount] = await Promise.all([
      Lesson.countDocuments({ course: courseId, deletedAt: null }),
      Lesson.aggregate([
        { $match: { course: new (require('mongoose').Types.ObjectId)(String(courseId)), deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
      ]),
      require('../../models/Quiz').countDocuments({ course: courseId, deletedAt: null }),
    ]);
    await Course.updateOne(
      { _id: courseId },
      { $set: { lessonCount, quizCount, durationMinutes: duration[0]?.total || 0 } }
    );
  }
}

module.exports = CourseService;
