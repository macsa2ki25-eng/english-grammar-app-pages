// 問題データの読み込みとクイズ生成。src/data.ts の移植。
export const QUIZ_SIZE = 10;
export const LEITNER_TITLE = '間違えた問題を復習';
export const WRONG_TITLE = '間違えた問題';

export let QUESTIONS = [];
export let CATEGORIES = [];
export const QUESTIONS_BY_ID = new Map();
const QUESTIONS_BY_MEDIUM = new Map();
export const MEDIUM_COUNTS = new Map();
export let ALL_QUESTION_IDS = [];

export function mediumKey(large, medium) {
  return `${large}\t${medium}`;
}

export async function loadData() {
  const [q, c] = await Promise.all([
    fetch('./data/questions.json').then((r) => r.json()),
    fetch('./data/categories.json').then((r) => r.json()),
  ]);
  QUESTIONS = q;
  CATEGORIES = c;
  QUESTIONS_BY_ID.clear();
  QUESTIONS_BY_MEDIUM.clear();
  MEDIUM_COUNTS.clear();
  for (const item of QUESTIONS) {
    QUESTIONS_BY_ID.set(item.id, item);
    const k = mediumKey(item.category_large, item.category_medium);
    const list = QUESTIONS_BY_MEDIUM.get(k) ?? [];
    list.push(item);
    QUESTIONS_BY_MEDIUM.set(k, list);
    MEDIUM_COUNTS.set(k, (MEDIUM_COUNTS.get(k) ?? 0) + 1);
  }
  ALL_QUESTION_IDS = QUESTIONS.map((x) => x.id);
}

export function questionById(id) {
  return QUESTIONS_BY_ID.get(id) ?? null;
}
export function questionsByIds(ids) {
  const out = [];
  for (const id of ids) {
    const item = QUESTIONS_BY_ID.get(id);
    if (item) out.push(item);
  }
  return out;
}
export function questionsByLarge(large) {
  return QUESTIONS.filter((x) => x.category_large === large);
}
export function questionsByMedium(large, medium) {
  return QUESTIONS_BY_MEDIUM.get(mediumKey(large, medium)) ?? [];
}

export function pickRandom(pool, size) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(size, a.length));
}

const MAX_SHELF_BOX = 5;
function isOnShelf(entry) {
  return entry.box >= 1 && entry.box <= MAX_SHELF_BOX;
}

export function countDueQuestions(srState, now = Date.now()) {
  let count = 0;
  for (const entry of srState.values()) {
    if (isOnShelf(entry) && entry.nextDueAt <= now) count += 1;
  }
  return count;
}

export function countDueQuestionsByLarge(srState, now = Date.now()) {
  const map = new Map();
  for (const [id, entry] of srState) {
    if (!isOnShelf(entry) || entry.nextDueAt > now) continue;
    const q = QUESTIONS_BY_ID.get(id);
    if (!q) continue;
    map.set(q.category_large, (map.get(q.category_large) ?? 0) + 1);
  }
  return map;
}

export function tier1CountsByLarge(srState) {
  const map = new Map();
  for (const [id, entry] of srState) {
    if (entry.box !== 1) continue;
    const q = QUESTIONS_BY_ID.get(id);
    if (!q) continue;
    map.set(q.category_large, (map.get(q.category_large) ?? 0) + 1);
  }
  return map;
}

export function buildLeitnerQuiz(srState, size = QUIZ_SIZE, now = Date.now(), filter) {
  const largesSet =
    filter?.larges && filter.larges.length > 0
      ? new Set(filter.larges)
      : filter?.large
        ? new Set([filter.large])
        : null;
  const due = [];
  for (const [id, entry] of srState) {
    if (!isOnShelf(entry) || entry.nextDueAt > now) continue;
    if (largesSet) {
      const q = QUESTIONS_BY_ID.get(id);
      if (!q || !largesSet.has(q.category_large)) continue;
    }
    due.push({ id, overdueBy: now - entry.nextDueAt });
  }
  due.sort((a, b) => b.overdueBy - a.overdueBy);
  return questionsByIds(due.slice(0, size).map((d) => d.id));
}

export function buildTopicQuiz(large, medium) {
  const pool = medium ? questionsByMedium(large, medium) : questionsByLarge(large);
  return pickRandom(pool, pool.length);
}

export function buildSimilarQuiz(large, medium, excludeId, size = QUIZ_SIZE) {
  const pool = questionsByMedium(large, medium).filter((q) => q.id !== excludeId);
  if (pool.length === 0) return [];
  return pickRandom(pool, Math.min(size, pool.length));
}

export function wrongQuestionList(wrongCounts) {
  return QUESTIONS.filter((q) => (wrongCounts.get(q.id) ?? 0) > 0).sort(
    (a, b) => (wrongCounts.get(b.id) ?? 0) - (wrongCounts.get(a.id) ?? 0),
  );
}

export function buildWrongQuiz(wrongCounts, size = QUIZ_SIZE) {
  const ranked = wrongQuestionList(wrongCounts);
  const top = ranked.slice(0, Math.min(size * 3, ranked.length));
  return pickRandom(top, Math.min(size, top.length));
}

export function buildCustomQuiz(selectedMediums, count, method, wrongCounts) {
  const set = new Set(selectedMediums);
  const pool =
    set.size === 0
      ? [...QUESTIONS]
      : QUESTIONS.filter((q) => set.has(mediumKey(q.category_large, q.category_medium)));
  const size = count === 'all' ? pool.length : Math.min(count, pool.length);
  if (method === 'sequential') return pool.slice(0, size);
  if (method === 'random') return pickRandom(pool, size);
  const shuffled = pickRandom(pool, pool.length);
  shuffled.sort((a, b) => (wrongCounts.get(b.id) ?? 0) - (wrongCounts.get(a.id) ?? 0));
  return shuffled.slice(0, size);
}

export function buildCategoryStats(stats) {
  const result = CATEGORIES.map((cat) => {
    const pool = questionsByLarge(cat.large);
    let attempted = 0, correct = 0, wrong = 0;
    for (const q of pool) {
      const s = stats.get(q.id);
      if (!s) continue;
      attempted += 1;
      correct += s.correct;
      wrong += s.wrong;
    }
    const attempts = correct + wrong;
    return {
      large: cat.large,
      totalQuestions: pool.length,
      attempted, attempts, correct, wrong,
      accuracy: attempts > 0 ? correct / attempts : null,
    };
  });
  return result.sort((a, b) => {
    if (a.attempts === 0 && b.attempts === 0) return 0;
    if (a.attempts === 0) return 1;
    if (b.attempts === 0) return -1;
    return (a.accuracy ?? 1) - (b.accuracy ?? 1);
  });
}
