import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const day = 86400;
const cookieName = '__Host-nelc_student';
const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const studentPattern = /^[A-Za-z0-9_-]{1,128}$/;
const profileFields = [
  'schema', 'sid', 'bookIndex', 'unitIndex', 'placedAt', 'cefrEstimate',
  'placementDetail', 'placementNote', 'placementSource', 'vocabSize',
  'vocabTests', 'streak', 'lastCompletedDate', 'wordLog', 'history',
  'dictHistory', 'gramHistory', 'prefs'
];

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    fail(415, '请求格式有误。');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 900_000) fail(413, '练习记录太大，无法保存。');
    chunks.push(chunk);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, '请求格式有误。'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, '请求格式有误。');
  return payload;
}

function sessionCookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function studentProfile(data, uid) {
  return { ...Object.fromEntries(profileFields.filter(key => key in data).map(key => [key, data[key]])),
    uid, username: data.username, tier: data.tier, role: 'student' };
}

function validateProgress(profile) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const nonnegative = value => Number.isFinite(value) && value >= 0;
  const shortText = value => value === null || (typeof value === 'string' && value.length <= 5000);
  const counters = ['timesSeen', 'timesCorrect', 'timesWrong', 'dSeen', 'dOk', 'dBad', 'cSeen', 'cOk', 'cBad'];
  const validWord = entry => record(entry) && Object.entries(entry).every(([key, value]) =>
    counters.includes(key) ? nonnegative(value) : shortText(value));
  const validScore = entry => record(entry) && shortText(entry.date ?? null) &&
    nonnegative(entry.correct) && nonnegative(entry.total) && entry.correct <= entry.total;
  const validators = {
    schema: nonnegative, bookIndex: nonnegative, unitIndex: nonnegative, streak: nonnegative,
    vocabSize: value => value === null || nonnegative(value),
    wordLog: value => record(value) && Object.values(value).every(validWord),
    history: value => Array.isArray(value) && value.every(entry => record(entry) && shortText(entry.date)),
    dictHistory: value => Array.isArray(value) && value.every(validScore),
    gramHistory: value => Array.isArray(value) && value.every(validScore),
    vocabTests: value => Array.isArray(value) && value.every(entry =>
      record(entry) && typeof entry.date === 'string' && nonnegative(entry.estimate) &&
      Array.isArray(entry.bands) && entry.bands.every(band => record(band) && nonnegative(band.rate))),
    prefs: value => record(value) && ['us', 'uk'].includes(value.accent) && nonnegative(value.rate) &&
      typeof value.autoPlay === 'boolean' && typeof value.showPos === 'boolean'
  };
  const entries = profileFields.filter(key => Object.hasOwn(profile, key)).map(key => [key, profile[key]]);
  if (!entries.length || !entries.every(([key, value]) => (validators[key] || shortText)(value))) {
    fail(400, '练习记录格式有误。');
  }
  return Object.fromEntries(entries);
}

export function makeHandler({ db, auth, origin, teacherUids }) {
  const users = db.collection('users');
  const accounts = db.collection('vocabAccounts');
  const links = db.collection('vocabLoginLinks');
  const sessions = db.collection('vocabSessions');

  async function teacher(req) {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!match) fail(401, '请先登录教师账号。');
    let identity;
    try { identity = await auth.verifyIdToken(match[1], true); }
    catch { fail(401, '请重新登录教师账号。'); }
    if (!teacherUids.has(identity.uid)) fail(403, '该教师账号还未获准管理学生登录链接。');
    const profile = (await users.doc(identity.uid).get()).data();
    if (profile?.role !== 'teacher') fail(403, '需要教师账号。');
    return identity.uid;
  }

  function sessionRef(req) {
    const value = req.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return tokenPattern.test(value || '') ? sessions.doc(hash(value)) : null;
  }

  async function student(req, reader) {
    const ref = sessionRef(req);
    const session = ref && (await reader(ref)).data();
    if (!session || session.expiresAt.toMillis() <= Date.now()) return null;
    const account = (await reader(accounts.doc(session.uid))).data();
    if (!account || account.generation !== session.generation) return null;
    const profileRef = users.doc(session.uid);
    const profile = (await reader(profileRef)).data();
    if (!profile || profile.role !== 'student') return null;
    return { uid: session.uid, profile, profileRef };
  }

  return async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const path = new URL(req.url, origin).pathname;
      if ((path === '/healthz' || path === '/vocab/api/healthz') && req.method === 'GET') return reply(200, { ok: true });
      const route = path.replace(/^\/vocab\/api\//, '');
      const writing = req.method === 'POST';
      if (writing && req.headers.origin !== origin) fail(403, '请求来源有误。');

      if (writing && route === 'teacher/link') {
        const owner = await teacher(req);
        const { nickname, uid: existingUid } = await jsonBody(req);
        const name = typeof nickname === 'string' ? nickname.trim() : '';
        if (existingUid == null ? !name || name.length > 40 : !studentPattern.test(existingUid)) {
          fail(400, '请输入 1–40 个字符的学生昵称或选择学生。');
        }
        const uid = existingUid ?? randomUUID();
        const accountRef = accounts.doc(uid);
        const profileRef = users.doc(uid);
        const token = secret();
        await db.runTransaction(async tx => {
          const account = (await tx.get(accountRef)).data();
          const profile = (await tx.get(profileRef)).data();
          if (existingUid && (!profile || profile.role !== 'student')) fail(404, '未找到学生。');
          if (account && account.owner !== owner) fail(403, '请由创建该账号的老师补发链接。');
          if (!existingUid) tx.create(profileRef, { uid, username: name, role: 'student' });
          if (account?.pendingLink) tx.delete(links.doc(account.pendingLink));
          const pendingLink = hash(token);
          const generation = (account?.generation ?? 0) + 1;
          tx.set(accountRef, { owner, generation, pendingLink });
          tx.create(links.doc(pendingLink), { uid, generation, expiresAt: new Date(Date.now() + 7 * day * 1000) });
        });
        return reply(200, { link: `${origin}/vocab/#login=${token}` });
      }

      if (writing && route === 'session/redeem') {
        const { token } = await jsonBody(req);
        if (!tokenPattern.test(token || '')) fail(400, '登录链接有误。');
        const linkRef = links.doc(hash(token));
        const sessionToken = secret();
        const oldSession = sessionRef(req);
        await db.runTransaction(async tx => {
          const link = (await tx.get(linkRef)).data();
          if (!link || link.expiresAt.toMillis() <= Date.now()) fail(410, '登录链接已使用或过期，请联系老师。');
          const accountRef = accounts.doc(link.uid);
          const account = (await tx.get(accountRef)).data();
          if (account?.pendingLink !== linkRef.id || account.generation !== link.generation) {
            fail(410, '登录链接已失效，请联系老师。');
          }
          tx.delete(linkRef);
          if (oldSession) tx.delete(oldSession);
          tx.update(accountRef, { pendingLink: null });
          tx.create(sessions.doc(hash(sessionToken)), { uid: link.uid, generation: link.generation,
            expiresAt: new Date(Date.now() + 90 * day * 1000) });
        });
        res.setHeader('Set-Cookie', sessionCookie(sessionToken, 90 * day));
        return reply(200, { ok: true });
      }

      if (writing && route === 'session/logout') {
        const ref = sessionRef(req);
        if (ref) await ref.delete();
        res.setHeader('Set-Cookie', sessionCookie('', 0));
        return reply(200, { ok: true });
      }

      if (req.method === 'GET' && route === 'session') {
        const user = await student(req, ref => ref.get());
        return reply(200, user ? { profile: studentProfile(user.profile, user.uid),
          version: user.profile.vocabVersion || 0 } : { profile: null });
      }

      if (req.method === 'GET' && route === 'books') {
        const snapshot = await db.collection('books').get();
        return reply(200, snapshot.docs.map(doc => doc.data()));
      }

      const assignmentMatch = /^assignments\/([A-Z0-9]{6,8})$/.exec(route);
      if (req.method === 'GET' && assignmentMatch) {
        const data = (await db.collection('assignments').doc(assignmentMatch[1]).get()).data();
        if (!data?.open) fail(404, '作业不存在或已关闭。');
        const { code, title, teacherName, scopeLabel, due, open, type, items, words, mode, hint, sentCn } = data;
        return reply(200, { code, title, teacherName, scopeLabel, due, open, type, items, words, mode, hint, sentCn });
      }

      if (writing && route === 'progress') {
        const { profile, version } = await jsonBody(req);
        if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Number.isSafeInteger(version)) fail(400, '练习记录格式有误。');
        const updates = validateProgress(profile);
        const next = await db.runTransaction(async tx => {
          const user = await student(req, ref => tx.get(ref));
          if (!user) fail(401, '登录已失效，请联系老师。');
          const current = user.profile.vocabVersion || 0;
          if (version !== current) fail(409, '进度已在另一页面更新，请刷新后继续。');
          tx.update(user.profileRef, { ...updates, vocabVersion: current + 1 });
          return current + 1;
        });
        return reply(200, { version: next });
      }

      if (writing && assignmentMatch) {
        const { results, secs, attemptId, uid } = await jsonBody(req);
        if (!Array.isArray(results) || !results.length || results.length > 600 ||
            !Number.isSafeInteger(secs) || secs < 0 || secs > 86400 ||
            typeof attemptId !== 'string' || !/^[a-f0-9-]{36}$/.test(attemptId)) fail(400, '成绩格式有误。');
        const code = assignmentMatch[1];
        const assignment = db.collection('assignments').doc(code);
        await db.runTransaction(async tx => {
          const user = await student(req, ref => tx.get(ref));
          if (!user || user.uid !== uid) fail(401, '请用做题时的学生账号登录。');
          const receipt = db.collection('vocabSubmissionReceipts').doc(hash(`${uid}/${code}/${attemptId}`));
          if ((await tx.get(receipt)).exists) return;
          const data = (await tx.get(assignment)).data();
          const graded = results.map(result => {
            if (typeof result?.correct !== 'boolean') fail(400, '成绩格式有误。');
            return { w: String(result.w ?? '').slice(0, 200), input: String(result.input ?? '').slice(0, 200),
              correct: result.correct, kind: result.kind === 'choice' ? 'choice' : 'spell' };
          });
          if (!data?.open) fail(404, '作业不存在或已关闭。');
          const total = data.type === 'grammar'
            ? (data.items || []).reduce((count, item) => count + Math.max(1, item.blanks?.length || 0), 0)
            : data.words?.length;
          if (graded.length !== total) fail(400, '作业题目已变更，请重新打开作业。');
          const sub = assignment.collection('submissions').doc(uid);
          const previous = (await tx.get(sub)).data();
          tx.set(sub, { uid, code, subId: uid, name: user.profile.username, isGuest: false,
            total, correct: graded.filter(r => r.correct).length, secs, results: graded,
            attempt: (Number(previous?.attempt) || 0) + 1, submittedAt: new Date().toISOString() });
          tx.create(receipt, { expiresAt: new Date(Date.now() + 90 * day * 1000) });
        });
        return reply(200, { ok: true });
      }

      fail(404, '未找到接口。');
    } catch (error) {
      if (!error.status) console.error('Vocabulary API failure', error.code || error.name);
      return reply(error.status || 500, { error: error.status ? error.message : '服务暂时不可用，请稍后再试。' });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'nelc-vocab2' });
  const db = getFirestore(app);
  const origin = process.env.PUBLIC_ORIGIN || 'https://nelc.sg';
  const teacherUids = new Set((process.env.TEACHER_UIDS || '').split(',').map(uid => uid.trim()).filter(Boolean));
  createServer(makeHandler({ db, auth: getAuth(app), origin, teacherUids }))
    .listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
