// 端末内データ保存。src/db/database.ts の SQLite を IndexedDB に移植。
const DB_NAME = 'spiral-grammar';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('answers')) {
        const s = db.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
        s.createIndex('created_at', 'createdAt');
        s.createIndex('question_id', 'questionId');
      }
      if (!db.objectStoreNames.contains('sr')) {
        db.createObjectStore('sr', { keyPath: 'questionId' });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        db.createObjectStore('bookmarks', { keyPath: 'questionId' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'questionId' });
      }
      if (!db.objectStoreNames.contains('smallTests')) {
        db.createObjectStore('smallTests', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}
function reqP(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function getAll(store) {
  return reqP((await tx(store, 'readonly')).getAll());
}
async function put(store, value) {
  return reqP((await tx(store, 'readwrite')).put(value));
}
async function del(store, key) {
  return reqP((await tx(store, 'readwrite')).delete(key));
}
async function clearStore(store) {
  return reqP((await tx(store, 'readwrite')).clear());
}

// ── 日付ユーティリティ(ローカル時刻基準) ──
function pad(n) { return n < 10 ? `0${n}` : String(n); }
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateOf(ms) { return localDateString(new Date(ms)); }

// ── SR(付箋)定数 ──
const DAY_MS = 86_400_000;
export const BOX_INTERVALS_MS = [1 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS];
export const MAX_BOX = BOX_INTERVALS_MS.length;
export const CLEARED_BOX = MAX_BOX + 1;

// ── answer_log ──
export async function recordAnswer(questionId, isCorrect) {
  await put('answers', { questionId, isCorrect: isCorrect ? 1 : 0, createdAt: Date.now() });
}
async function allAnswers() {
  return getAll('answers');
}

export async function getActiveWrongCounts() {
  const rows = await allAnswers();
  const byId = new Map();
  rows.sort((a, b) => b.createdAt - a.createdAt); // 新しい順
  for (const r of rows) {
    const list = byId.get(r.questionId) ?? [];
    list.push(r.isCorrect);
    byId.set(r.questionId, list);
  }
  const result = new Map();
  for (const [id, history] of byId) {
    const wrongTotal = history.filter((c) => !c).length;
    if (wrongTotal === 0) continue;
    const mastered = history.length >= 2 && history[0] === 1 && history[1] === 1;
    if (mastered) continue;
    result.set(id, wrongTotal);
  }
  return result;
}

export async function getQuestionStats() {
  const rows = await allAnswers();
  const map = new Map();
  for (const r of rows) {
    const s = map.get(r.questionId) ?? { wrong: 0, correct: 0 };
    if (r.isCorrect) s.correct += 1; else s.wrong += 1;
    map.set(r.questionId, s);
  }
  return map;
}

export async function getActiveDays() {
  const rows = await allAnswers();
  const set = new Set();
  for (const r of rows) set.add(dateOf(r.createdAt));
  return set;
}

export async function getDailyStats() {
  const rows = await allAnswers();
  const map = new Map();
  for (const r of rows) {
    const d = dateOf(r.createdAt);
    const s = map.get(d) ?? { date: d, answered: 0, correct: 0 };
    s.answered += 1;
    if (r.isCorrect) s.correct += 1;
    map.set(d, s);
  }
  return map;
}

export async function getLifetimeStat() {
  const rows = await allAnswers();
  let correct = 0;
  for (const r of rows) if (r.isCorrect) correct += 1;
  return { answered: rows.length, correct };
}

export async function getTodayAnswers() {
  const rows = await allAnswers();
  const today = localDateString();
  return rows
    .filter((r) => dateOf(r.createdAt) === today)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({ questionId: r.questionId, isCorrect: r.isCorrect === 1, createdAt: r.createdAt }));
}

export async function getRecentAnswers(limit = 20) {
  const rows = await allAnswers();
  rows.sort((a, b) => b.createdAt - a.createdAt);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.questionId)) continue;
    seen.add(r.questionId);
    out.push({ questionId: r.questionId, isCorrect: r.isCorrect === 1, createdAt: r.createdAt });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getRecentWrongRanked(days = 7, limit = 20) {
  const rows = await allAnswers();
  const since = Date.now() - days * DAY_MS;
  const agg = new Map();
  for (const r of rows) {
    if (r.createdAt < since) continue;
    const a = agg.get(r.questionId) ?? { wrong: 0, last: 0 };
    if (!r.isCorrect) a.wrong += 1;
    a.last = Math.max(a.last, r.createdAt);
    agg.set(r.questionId, a);
  }
  return [...agg.entries()]
    .filter(([, a]) => a.wrong > 0)
    .sort((x, y) => y[1].wrong - x[1].wrong || y[1].last - x[1].last)
    .slice(0, limit)
    .map(([questionId, a]) => ({ questionId, wrong: a.wrong }));
}

// ── question_sr(付箋) ──
export async function getQuestionSrState() {
  const rows = await getAll('sr');
  const map = new Map();
  for (const r of rows) {
    map.set(r.questionId, { box: r.box, lastReviewedAt: r.lastReviewedAt, nextDueAt: r.nextDueAt });
  }
  return map;
}

export async function recordQuestionReview(questionId, pass) {
  const now = Date.now();
  const existing = await reqP((await tx('sr', 'readonly')).get(questionId));
  const prevBox = existing?.box ?? 0;
  let nextBox;
  if (pass) {
    nextBox = prevBox === 0 ? CLEARED_BOX : Math.min(CLEARED_BOX, prevBox + 1);
  } else {
    nextBox = 1;
  }
  const intervalIdx = Math.max(0, Math.min(MAX_BOX, nextBox) - 1);
  await put('sr', {
    questionId, box: nextBox, lastReviewedAt: now,
    nextDueAt: now + BOX_INTERVALS_MS[intervalIdx],
  });
}

export async function moveQuestionToShelf(questionId) {
  const now = Date.now();
  await put('sr', { questionId, box: 1, lastReviewedAt: now, nextDueAt: now + BOX_INTERVALS_MS[0] });
}
export async function graduateQuestion(questionId) {
  const now = Date.now();
  await put('sr', {
    questionId, box: CLEARED_BOX, lastReviewedAt: now,
    nextDueAt: now + BOX_INTERVALS_MS[MAX_BOX - 1],
  });
}

// ── bookmarks ──
export async function getBookmarks() {
  const rows = await getAll('bookmarks');
  return new Set(rows.map((r) => r.questionId));
}
export async function listBookmarksOrdered() {
  const rows = await getAll('bookmarks');
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows.map((r) => r.questionId);
}
export async function toggleBookmark(questionId) {
  const existing = await reqP((await tx('bookmarks', 'readonly')).get(questionId));
  if (existing) { await del('bookmarks', questionId); return false; }
  await put('bookmarks', { questionId, createdAt: Date.now() });
  return true;
}

// ── notes ──
export async function getNotes() {
  const rows = await getAll('notes');
  const map = new Map();
  for (const r of rows) map.set(r.questionId, r.note);
  return map;
}
export async function setNote(questionId, note) {
  const trimmed = note.trim();
  if (!trimmed) { await del('notes', questionId); return; }
  await put('notes', { questionId, note: trimmed, updatedAt: Date.now() });
}

// ── small tests ──
export async function listSmallTests() {
  const rows = await getAll('smallTests');
  rows.sort((a, b) => (b.lastRunAt ?? b.createdAt) - (a.lastRunAt ?? a.createdAt));
  return rows;
}
export async function createSmallTest(name, mediums, size, method) {
  return put('smallTests', { name, mediums, size, method, createdAt: Date.now(), lastRunAt: null });
}
export async function deleteSmallTest(id) { await del('smallTests', id); }
export async function touchSmallTestRun(id) {
  const row = await reqP((await tx('smallTests', 'readonly')).get(id));
  if (row) { row.lastRunAt = Date.now(); await put('smallTests', row); }
}

// ── kv(設定・レジューム) ──
async function kvGet(k) {
  const row = await reqP((await tx('kv', 'readonly')).get(k));
  return row?.v;
}
async function kvSet(k, v) { await put('kv', { k, v }); }
async function kvDel(k) { await del('kv', k); }

export const DEFAULT_SETTINGS = {
  retryOnWrong: true,
  soundEnabled: true,
  hapticsEnabled: true,
  autoSpeak: false,
  fontScale: 1,
  cloudEnabled: false,
  notificationEnabled: false,
  notificationHour: 20,
  lastTopic: null,
  lastCelebratedStreak: 0,
  bookTapCount: 0,
};

export async function loadSettings() {
  const v = await kvGet('settings');
  return { ...DEFAULT_SETTINGS, ...(v ?? {}) };
}
export async function saveSettings(settings) { await kvSet('settings', settings); }

export async function getResumeSession() {
  return (await kvGet('resume')) ?? null;
}
export async function saveResumeSession(session) {
  await kvSet('resume', { ...session, updatedAt: Date.now() });
}
export async function clearResumeSession() { await kvDel('resume'); }

export async function clearStudyData() {
  await clearStore('answers');
  await clearStore('sr');
  await kvDel('resume');
}
