/**
 * One definition of "who runs this course".
 *
 * A course has a creator (`teacher`) and may have accepted co-teachers
 * (`coTeachers`). Every place that used to compare against `course.teacher`
 * asks here instead, so adding a co-teacher cannot leave one forgotten check
 * behind — which is exactly how privilege bugs get in.
 *
 * Administrators and the owner are staff on every course by role.
 */
const { isAdminRole } = require('../../core/permissions');

/** Teacher ids for a course: the creator plus accepted co-teachers. */
const courseStaffIds = (course) => {
  if (!course) return [];
  const ids = [course.teacher, ...(course.coTeachers || [])]
    .filter(Boolean)
    .map((id) => String(id._id || id));
  return [...new Set(ids)];
};

/** Is this user allowed to run this course? */
const isCourseStaff = (course, user) => {
  if (!course || !user) return false;
  if (isAdminRole(user.role)) return true;
  const me = String(user.id || user._id);
  return courseStaffIds(course).includes(me);
};

/** Is this user a teacher of the course specifically (not an admin by role)? */
const isCourseTeacher = (course, user) => {
  if (!course || !user) return false;
  return courseStaffIds(course).includes(String(user.id || user._id));
};

/**
 * Mongo filter for "courses this teacher runs" — creator or accepted
 * co-teacher. Use this instead of { teacher: id } anywhere the query is an
 * authorization decision.
 */
const staffCourseFilter = (userId) => ({ $or: [{ teacher: userId }, { coTeachers: userId }] });

module.exports = { courseStaffIds, isCourseStaff, isCourseTeacher, staffCourseFilter };
