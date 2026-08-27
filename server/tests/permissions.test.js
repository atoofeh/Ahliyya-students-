const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS: P, hasPermission, isAdminRole, canAssignRole, ROLE_RANK } = require('../src/core/permissions');

test('rank order', () => {
  assert.deepEqual(ROLE_RANK, { student: 0, teacher: 1, admin: 2, super_admin: 3 });
});

test('student has no platform permissions; teacher may manage own courses', () => {
  assert.equal(hasPermission('student', P.USERS_VIEW), false);
  assert.equal(hasPermission('student', P.COURSES_MANAGE_OWN), false);
  assert.equal(hasPermission('teacher', P.COURSES_MANAGE_OWN), true);
  assert.equal(hasPermission('teacher', P.USERS_CREATE), false);
});

test('admin has operational permissions but not owner-only ones', () => {
  assert.equal(hasPermission('admin', P.USERS_CREATE), true);
  assert.equal(hasPermission('admin', P.ACCESS_CODES_MANAGE), true);
  assert.equal(hasPermission('admin', P.SETTINGS_MANAGE), true);
  assert.equal(hasPermission('admin', P.ADMINS_VIEW), true);
  assert.equal(hasPermission('admin', P.ADMINS_CREATE), false);
  assert.equal(hasPermission('admin', P.ADMINS_MANAGE), false);
  assert.equal(hasPermission('admin', P.SECURITY_MANAGE), false);
});

test('super_admin has every permission', () => {
  for (const perm of Object.values(P)) assert.equal(hasPermission('super_admin', perm), true, perm);
});

test('unknown role has nothing', () => {
  assert.equal(hasPermission('ghost', P.USERS_VIEW), false);
  assert.equal(hasPermission(undefined, P.USERS_VIEW), false);
});

test('isAdminRole', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('super_admin'), true);
  assert.equal(isAdminRole('teacher'), false);
});

test('canAssignRole: nobody assigns super_admin; admin needs admins.create', () => {
  assert.equal(canAssignRole('super_admin', 'super_admin'), false);
  assert.equal(canAssignRole('admin', 'super_admin'), false);
  assert.equal(canAssignRole('super_admin', 'admin'), true);
  assert.equal(canAssignRole('admin', 'admin'), false);
  assert.equal(canAssignRole('admin', 'teacher'), true);
  assert.equal(canAssignRole('admin', 'student'), true);
  assert.equal(canAssignRole('teacher', 'student'), true);
  assert.equal(canAssignRole('teacher', 'teacher'), false);
});
