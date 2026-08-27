import { WifiOff, LockKeyhole, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';

/** Server codes → plain language. Technical detail belongs in the audit log, not the screen. */
const COPY = {
  NETWORK: { icon: WifiOff, title: 'You appear to be offline', body: 'Check your connection — your work is kept on this device.' },
  SESSION_TERMINATED: { icon: LockKeyhole, title: 'Your session has ended', body: 'Sign in again to continue.' },
  SESSION_INACTIVE: { icon: LockKeyhole, title: 'Signed out for inactivity', body: 'Sign in again to continue.' },
  TOKEN_REVOKED: { icon: LockKeyhole, title: 'Your session has ended', body: 'Sign in again to continue.' },
  DEVICE_NOT_AUTHORIZED: { icon: ShieldAlert, title: 'This account is linked to another device', body: 'Contact an administrator or request a device reset.' },
  ACCOUNT_SUSPENDED: { icon: ShieldAlert, title: 'This account is suspended', body: 'Contact an administrator.' },
  ACCOUNT_BANNED: { icon: ShieldAlert, title: 'This account has been banned', body: 'Contact an administrator.' },
  ONBOARDING_REQUIRED: { icon: LockKeyhole, title: 'Finish setting up your account', body: 'Verify your email and choose a password first.' },
  NOT_ENROLLED: { icon: LockKeyhole, title: 'You are not enrolled in this course', body: 'Redeem an access code or ask your teacher to add you.' },
  ENROLLMENT_EXPIRED: { icon: Clock, title: 'Your access to this course has ended', body: 'Ask your teacher to extend it.' },
  COURSE_EXPIRED: { icon: Clock, title: 'This course has ended', body: 'Its content is no longer available.' },
  QUIZ_LOCKED: { icon: LockKeyhole, title: 'This quiz is locked', body: 'Your instructor will unlock it when it is ready.' },
  QUIZ_CLOSED: { icon: Clock, title: 'The quiz window has closed', body: 'Contact your instructor if you missed it.' },
  QUIZ_NOT_OPEN: { icon: Clock, title: 'This quiz has not opened yet', body: 'Come back when it starts.' },
  ATTEMPTS_EXHAUSTED: { icon: AlertTriangle, title: 'No attempts left', body: 'You have used every attempt for this quiz.' },
  TIME_UP: { icon: Clock, title: 'Time is up', body: 'Your attempt was submitted automatically.' },
  RATE_LIMITED: { icon: Clock, title: 'Too many requests', body: 'Wait a moment and try again.' },
  SCANNER_UNAVAILABLE: { icon: AlertTriangle, title: 'Upload scanning is unavailable', body: 'Try again in a few minutes.' },
  MAINTENANCE: { icon: AlertTriangle, title: 'The platform is under maintenance', body: 'Please check back shortly.' },
};

export const errorCopy = (code, message) =>
  COPY[code] || { icon: AlertTriangle, title: 'Something went wrong', body: message || 'Please try again.' };
