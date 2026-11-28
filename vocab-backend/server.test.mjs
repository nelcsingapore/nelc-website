import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { makeHandler } from './server.mjs';

function memoryFirestore() {
  const data = new Map([
    ['users/teacher', { role: 'teacher' }],
    ['assignments/ABC234', { code: 'ABC234', open: true, words: [{ w: 'book' }] }]
  ]);
  const collection = path => ({
    doc(id) {
      const key = path + '/' + id;
      return {
        key, id, collection: name => collection(key + '/' + name),
        async get() {
          const value = data.get(key);
          return { exists: value !== undefined, data: () => value };
        },
        async delete() { data.delete(key); }
      };
    }
  });
  let queue = Promise.resolve();
  const put = (ref, value) => data.set(ref.key, Object.fromEntries(Object.entries(value)
    .map(([key, field]) => [key, field instanceof Date ? { toMillis: () => field.getTime() } : field])));
  return {
    collection, data,
    runTransaction(fn) {
      const result = queue.then(async () => {
        const writes = [];
        const value = await fn({
          get: ref => ref.get(),
          create: (ref, value) => writes.push(() => {
            assert(!data.has(ref.key));
            put(ref, value);
          }),
          update: (ref, value) => writes.push(() => put(ref, { ...data.get(ref.key), ...value })),
          set: (ref, value) => writes.push(() => put(ref, value)),
          delete: ref => writes.push(() => data.delete(ref.key))
        });
        writes.forEach(write => write());
        return value;
      });
      queue = result.catch(() => {});
      return result;
    }
  };
}

test('teacher invitations, separate student records, guest reads, and safe retries', async t => {
  const db = memoryFirestore();
  const origin = 'https://nelc.sg';
  const auth = { async verifyIdToken(token) { return { uid: token }; } };
  const handler = makeHandler({ db, auth, origin, teacherUids: new Set(['teacher']) });
  const server = createServer(handler).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  async function request(path, { body, cookie, token, sameOrigin = true } = {}) {
    const headers = {};
    if (sameOrigin) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = 'Bearer ' + token;
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${server.address().port}/vocab/api/${path}`, {
      method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, data: await response.json(),
      cookie: setCookie?.split(';')[0], setCookie };
  }
  async function issue(payload) {
    const reply = await request('teacher/link', { token: 'teacher', body: payload });
    assert.equal(reply.status, 200);
    return new URLSearchParams(new URL(reply.data.link).hash.slice(1)).get('login');
  }

  assert.equal((await request('teacher/link', { token: 'student', body: { nickname: 'A' } })).status, 403);
  const loginA = await issue({ nickname: '小雨' });
  const loginB = await issue({ nickname: '小林' });
  assert.equal((await request('session/redeem?token=' + loginA)).status, 404);
  assert.equal((await request('session/redeem', { body: { token: loginA }, sameOrigin: false })).status, 403);
  const attempts = await Promise.all([1, 2].map(() => request('session/redeem', { body: { token: loginA } })));
  assert.deepEqual(attempts.map(reply => reply.status).sort(), [200, 410]);
  const a = attempts.find(reply => reply.status === 200);
  assert.match(a.setCookie, /Path=\/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax/);
  const b = await request('session/redeem', { body: { token: loginB } });
  const userA = (await request('session', { cookie: a.cookie })).data.profile;
  const userB = (await request('session', { cookie: b.cookie })).data.profile;
  assert.equal(userA.username, '小雨');
  assert.equal(userB.username, '小林');

  const body = { uid: userA.uid, attemptId: randomUUID(), secs: 10,
    results: [{ w: 'book', input: 'book', correct: true }] };
  assert.equal((await request('assignments/ABC234')).status, 200);
  assert.deepEqual((await request('session')).data, { profile: null });
  assert.equal((await request('assignments/ABC234', { body })).status, 401);
  assert.equal((await request('progress', { body: { profile: { streak: 1 }, version: 0 } })).status, 401);
  assert.equal((await request('assignments/ABC234', { body, cookie: b.cookie })).status, 401);
  assert.equal((await request('assignments/ABC234', { body, cookie: a.cookie })).status, 200);
  assert.equal((await request('assignments/ABC234', { body, cookie: a.cookie })).status, 200);
  const bBody = { ...body, uid: userB.uid, attemptId: randomUUID(),
    results: [{ w: 'book', input: 'boook', correct: false }] };
  assert.equal((await request('assignments/ABC234', { body: bBody, cookie: b.cookie })).status, 200);
  const submissions = [...db.data.entries()].filter(([key]) => key.startsWith('assignments/ABC234/submissions/'));
  assert.deepEqual(submissions.map(([, value]) => [value.name, value.correct, value.attempt]), [['小雨', 1, 1], ['小林', 0, 1]]);
  assert.equal((await request('progress', { cookie: a.cookie,
    body: { profile: { role: 'teacher', streak: 1 }, version: 0 } })).data.version, 1);
  assert.equal(db.data.get('users/' + userA.uid).role, 'student');
  assert.equal(db.data.get('users/' + userA.uid).streak, 1);
  assert.equal((await request('progress', { cookie: a.cookie,
    body: { profile: { streak: 99 }, version: 0 } })).status, 409);

  const replacement = await issue({ uid: userA.uid });
  assert.deepEqual((await request('session', { cookie: a.cookie })).data, { profile: null });
  const newSession = await request('session/redeem', { body: { token: replacement } });
  assert.equal((await request('session', { cookie: newSession.cookie })).data.profile.streak, 1);
  assert.equal((await request('session/logout', { body: {}, cookie: newSession.cookie })).status, 200);
  assert.deepEqual((await request('session', { cookie: newSession.cookie })).data, { profile: null });
});
