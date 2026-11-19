import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword } from '../src/utils/password.js';

test('generated account passwords meet the server policy and are independently randomized', () => {
  const passwords = Array.from({ length: 128 }, generatePassword);
  for (const password of passwords) {
    assert.equal(password.length, 16);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /\d/);
    assert.match(password, /[!@#$%&*?]/);
    assert.doesNotMatch(password, /\s/);
  }
  assert.equal(new Set(passwords).size, passwords.length);
});
