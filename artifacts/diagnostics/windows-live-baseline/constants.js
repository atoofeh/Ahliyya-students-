/**
 * Domain constants shared across modules. Single source of truth for enums
 * used by models, validators, and the client-facing API.
 */
module.exports = {
  ROLES: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', TEACHER: 'teacher', STUDENT: 'student' },
  ROLE_RANK: { student: 0, teacher: 1, admin: 2, super_admin: 3 },

  USER_STATUS: {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    BANNED: 'banned',
    PENDING: 'pending',
  },

  // 'listed' — signed-in users can find the course and watch the lessons its
  // teacher marked free. Enrolment still needs a code or a staff assignment.
  // 'hidden'  — invisible to anyone who is not enrolled or staff.
  COURSE_VISIBILITY: { LISTED: 'listed', HIDDEN: 'hidden' },
  COURSE_DIFFICULTY: ['beginner', 'intermediate', 'advanced', 'expert'],

  // The institution's currency. Courses carry their own `currency` field, so a
  // course could differ, but nothing sets one today — change it here and every
  // new course and enrollment follows.
  DEFAULT_CURRENCY: 'JOD',

  // How long a session survives when the user ticked "Remember me".
  //
  // Refresh tokens rotate on every use, so each visit renews this window: for
  // anyone who opens the app the session simply does not end. The bound exists
  // for the token that is never used again — a phone left in a drawer — rather
  // than as a deadline for anyone real. Ending a remembered session is done by
  // logging out, revoking the device, or a password change, never by a clock.
  REMEMBERED_SESSION_DAYS: 365,

  LESSON_TYPES: ['video', 'pdf', 'document', 'quiz', 'assignment', 'text'],

  // What a student signed up for. 'mid' and 'final' cover one exam period each;
  // 'full' is the whole course. Recorded on the enrollment together with what
  // they paid, which only administrators and the owner can see.
  ENROLLMENT_PACKAGES: ['mid', 'final', 'full'],

  QUESTION_TYPES: [
    'multiple_choice',
    'true_false',
    'short_answer',
    'essay',
    'fill_blanks',
    'image_choice',
  ],

  ATTEMPT_STATUS: ['in_progress', 'submitted', 'auto_submitted', 'graded', 'invalidated'],

  VIDEO_STATUS: ['uploading', 'processing', 'ready', 'failed'],

  CHEAT_EVENTS: [
    'tab_switch',
    'window_blur',
    'devtools_open',
    'copy',
    'paste',
    'cut',
    'right_click',
    'shortcut_blocked',
    'idle',
    'page_refresh',
    'network_offline',
    'multiple_tabs',
    'fullscreen_exit',
    'fingerprint_mismatch',
    'screen_capture_suspected',
    'mouse_inactive',
  ],

  NOTIFICATION_TYPES: [
    'enrollment',
    'announcement',
    'quiz_reminder',
    'quiz_graded',
    'assignment_due',
    'assignment_graded',
    'certificate',
    'system',
    'qa_reply',
    'deadline',
  ],

  AUDIT_ACTIONS: [
    // auth
    'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_TERMINATED', 'PASSWORD_CHANGED',
    'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'EMAIL_VERIFIED',
    'DEVICE_REGISTER', 'DEVICE_MISMATCH', 'DEVICE_RESET', 'FORCE_LOGOUT',
    // users
    'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_SUSPENDED', 'USER_BANNED',
    'USER_ACTIVATED', 'ROLE_CHANGED',
    // ownership & devices
    'ADMIN_CREATED', 'ADMIN_DISABLED', 'OWNER_ACTION_BLOCKED', 'SECURITY_SETTING_CHANGED',
    'DEVICE_BOUND', 'DEVICE_CHANGED', 'DEVICE_LOGIN_REJECTED', 'DEVICE_REVOKED',
    'DEVICE_FINGERPRINT_DRIFT', 'TOKEN_REUSE_DETECTED', 'POLICY_RELOGIN', 'MEDIA_KEY_REWRAPPED',
    'DEVICE_RESET_REQUESTED', 'DEVICE_RESET_REQUEST_RESOLVED',
    'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_COMPLETED', 'ACCOUNT_DELETION_REQUEST_DISMISSED',
    // courses
    'COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_DELETED', 'COURSE_PUBLISHED',
    'ENROLLED', 'UNENROLLED', 'CODE_REDEEM', 'ENROLLMENT_EXPIRED', 'ENROLLMENT_PAYMENT_RECORDED',
    // content
    'VIDEO_UPLOADED', 'VIDEO_DELETED', 'VIDEO_ACCESSED', 'FILE_UPLOADED', 'FILE_DELETED',
    'VIDEO_VIEWS_EXHAUSTED', 'VIDEO_VIEWS_RESET',
    // news feed
    'NEWS_POSTED', 'NEWS_UPDATED', 'NEWS_DELETED',
    // quizzes
    'QUIZ_CREATED', 'QUIZ_UPDATED', 'QUIZ_DELETED', 'QUIZ_STARTED', 'QUIZ_SUBMIT',
    'QUIZ_GRADED', 'QUIZ_LOCKED', 'QUIZ_UNLOCKED', 'ATTEMPT_INVALIDATED',
    // platform
    'SETTINGS_UPDATED', 'MAINTENANCE_ON', 'MAINTENANCE_OFF', 'ANNOUNCEMENT_CREATED',
    'ANNOUNCEMENT_DELETED', 'REPORT_GENERATED', 'CHEAT_EVENT',
    // q&a moderation
    'QA_QUESTION_ASKED', 'QA_QUESTION_APPROVED', 'QA_QUESTION_REJECTED',
    'QA_REPLY_APPROVED', 'QA_REPLY_REJECTED', 'QA_CONTENT_REPORTED',
    'QA_REPORT_RESOLVED', 'QA_REPORT_DISMISSED', 'USER_BLOCKED', 'USER_UNBLOCKED',
    // co-teaching
    'COTEACH_INVITED', 'COTEACH_ACCEPTED', 'COTEACH_DECLINED', 'COTEACH_REMOVED',
  ],

  UPLOAD: {
    ALLOWED_DOC_TYPES: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.zip', '.txt', '.xls', '.xlsx'],
    ALLOWED_IMAGE_TYPES: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
    ALLOWED_VIDEO_TYPES: ['.mp4', '.webm', '.mov', '.mkv', '.m4v'],
    // Declared MIME type must agree with the extension (checked alongside magic bytes).
    ALLOWED_MIME: {
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.ppt': ['application/vnd.ms-powerpoint'],
      '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      '.xls': ['application/vnd.ms-excel'],
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.zip': ['application/zip', 'application/x-zip-compressed'],
      '.txt': ['text/plain'],
      '.png': ['image/png'],
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.webp': ['image/webp'],
      '.gif': ['image/gif'],
      '.svg': ['image/svg+xml'],
    },
  },
};
