import { isAdminRole } from './roles';

// Course managers use the teacher URL for every staff role. Return to the
// originating list, including its search/page, instead of guessing from that URL.
export function courseReturnTo(role, requested) {
  const fallback = isAdminRole(role) ? '/admin/courses' : '/teacher/courses';
  const allowed = isAdminRole(role) ? ['/admin/courses', '/teacher/courses'] : ['/teacher/courses'];
  return typeof requested === 'string' && allowed.some((base) => requested === base || requested.startsWith(`${base}?`))
    ? requested : fallback;
}

export function coursePage(params) {
  const page = Number(params.get('page'));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
