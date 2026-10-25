'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers');

test('admin panel APIs enforce admin privileges and provide user and platform management', async t => {
  const adminEmail = 'admin@example.test';
  const f = await fixture(t, { adminEmails: [adminEmail] });

  // Register regular user
  const regularUser = await f.register('student@example.test');
  // Register admin user
  const adminUser = await f.register(adminEmail);

  // 1. Regular user trying to access /api/admin/overview -> 403 Forbidden
  const forbiddenRes = await f.request('/api/admin/overview', undefined, regularUser.cookie);
  assert.equal(forbiddenRes.status, 403);
  assert.equal(forbiddenRes.body.error, 'غير مصرح بالوصول إلى لوحة الإدارة.');

  // 2. Admin user accessing /api/admin/overview -> 200 OK with rich metrics
  const overviewRes = await f.request('/api/admin/overview', undefined, adminUser.cookie);
  assert.equal(overviewRes.status, 200);
  assert(overviewRes.body.stats.totalUsers >= 2);
  assert.equal(typeof overviewRes.body.stats.verifiedUsers, 'number');
  assert.equal(typeof overviewRes.body.stats.totalQuizzes, 'number');
  assert.equal(typeof overviewRes.body.stats.mail, 'object');

  // 3. Admin listing users
  const usersRes = await f.request('/api/admin/users?limit=10', undefined, adminUser.cookie);
  assert.equal(usersRes.status, 200);
  assert(usersRes.body.users.length >= 2);
  assert(usersRes.body.pagination.total >= 2);

  // 4. Admin searching users
  const searchRes = await f.request('/api/admin/users?search=student', undefined, adminUser.cookie);
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.body.users.length, 1);
  assert.equal(searchRes.body.users[0].email, 'student@example.test');

  // 5. Admin manually verifying a user
  const verifyRes = await f.request('/api/admin/users/verify', { id: regularUser.body.user.id }, adminUser.cookie);
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.success, true);

  // Check detail
  const detailRes = await f.request(`/api/admin/users/detail?id=${regularUser.body.user.id}`, undefined, adminUser.cookie);
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.user.email_verified, true);

  // 6. Admin triggering password reset
  const resetRes = await f.request('/api/admin/users/reset-password', { id: regularUser.body.user.id }, adminUser.cookie);
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.body.success, true);

  // 7. Admin cannot delete self
  const selfDelete = await f.request('/api/admin/users/delete', { id: adminUser.body.user.id }, adminUser.cookie);
  assert.equal(selfDelete.status, 400);

  // 8. Admin deleting regular user
  const deleteRes = await f.request('/api/admin/users/delete', { id: regularUser.body.user.id }, adminUser.cookie);
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.success, true);

  // Verify user is gone
  const afterDelete = await f.request(`/api/admin/users/detail?id=${regularUser.body.user.id}`, undefined, adminUser.cookie);
  assert.equal(afterDelete.status, 404);

  // 9. Mail queue inspection
  const mailJobsRes = await f.request('/api/admin/mail-jobs', undefined, adminUser.cookie);
  assert.equal(mailJobsRes.status, 200);
  assert(Array.isArray(mailJobsRes.body.jobs));

  // 10. Retry failed mail
  const retryRes = await f.request('/api/admin/mail-jobs/retry', {}, adminUser.cookie);
  assert.equal(retryRes.status, 200);
  assert.equal(typeof retryRes.body.count, 'number');

  // 11. Page guard for pages/admin.html
  const pageGuardUnauth = await f.request('/pages/admin.html', undefined, null);
  assert.equal(pageGuardUnauth.status, 302);
  assert(pageGuardUnauth.headers.get('location').includes('account.html'));
});
