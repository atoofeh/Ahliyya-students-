export const ROLE_LABEL = { student: 'Student', teacher: 'Instructor', admin: 'Administrator', super_admin: 'Owner' };

export const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

/** Mirrors the server's authorize(): the owner satisfies any 'admin' check. */
export const roleMatches = (role, roles) => roles.includes(role) || (role === 'super_admin' && roles.includes('admin'));

export const homeFor = (role) => (isAdminRole(role) ? '/admin' : role === 'teacher' ? '/teacher' : '/student');
