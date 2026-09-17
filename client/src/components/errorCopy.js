import { WifiOff, LockKeyhole, ShieldAlert, Clock, AlertTriangle } from 'lucide-react';

/**
 * Server codes → plain language. Technical detail belongs in the audit log,
 * not the screen.
 *
 * Each entry names an icon and a translation key; the wording itself lives in
 * the dictionaries, so these read in whichever language the student chose.
 */
const CODES = {
  NETWORK: WifiOff,
  SESSION_TERMINATED: LockKeyhole,
  SESSION_INACTIVE: LockKeyhole,
  TOKEN_REVOKED: LockKeyhole,
  DEVICE_NOT_AUTHORIZED: ShieldAlert,
  ACCOUNT_SUSPENDED: ShieldAlert,
  ACCOUNT_BANNED: ShieldAlert,
  ONBOARDING_REQUIRED: LockKeyhole,
  NOT_ENROLLED: LockKeyhole,
  ENROLLMENT_EXPIRED: Clock,
  COURSE_EXPIRED: Clock,
  QUIZ_LOCKED: LockKeyhole,
  QUIZ_NOT_PUBLISHED: Clock,
  QUIZ_CLOSED: Clock,
  QUIZ_NOT_OPEN: Clock,
  ATTEMPTS_EXHAUSTED: AlertTriangle,
  VIDEO_VIEW_LIMIT: LockKeyhole,
  TIME_UP: Clock,
  RATE_LIMITED: Clock,
  SCANNER_UNAVAILABLE: AlertTriangle,
  MAINTENANCE: AlertTriangle,
};

/**
 * `t` is the caller's translate function. An unrecognised code falls back to
 * the server's own message, which is already written for a person to read.
 */
export const errorCopy = (code, message, t) => {
  const icon = CODES[code];
  if (!icon) {
    return {
      icon: AlertTriangle,
      title: t('common.somethingWrong'),
      body: message || t('common.tryAgainBody'),
    };
  }
  return { icon, title: t(`err.${code}.title`), body: t(`err.${code}.body`) };
};
