// アプリ全体の状態。src/state/AppContext.tsx の移植。
import {
  ALL_QUESTION_IDS, buildCategoryStats,
} from './data.js';
import {
  CLEARED_BOX, MAX_BOX,
  getActiveDays, getActiveWrongCounts, getBookmarks, getDailyStats,
  getLifetimeStat, getNotes, getQuestionSrState, getQuestionStats,
  getResumeSession, listSmallTests, loadSettings, localDateString,
  moveQuestionToShelf, graduateQuestion, recordQuestionReview, saveSettings,
} from './store.js';
import { computeStreak, weekStartOf } from './streak.js';
import { pushStats } from './cloud.js';

export const state = {
  ready: false,
  settings: null,
  wrongCounts: new Map(),
  questionStats: new Map(),
  categoryStats: [],
  srState: new Map(),
  shelf: { tiers: [0, 0, 0, 0, 0], unseen: ALL_QUESTION_IDS.length, cleared: 0, dueCount: 0 },
  smallTestCount: 0,
  streak: { days: 0, todayActive: false },
  daily: new Map(),
  lifetime: { answered: 0, correct: 0 },
  bookmarkedIds: new Set(),
  notes: new Map(),
  resume: null,
  helpRequestedIds: new Set(),
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

function computeShelfCounts(srState, now = Date.now()) {
  const tiers = [0, 0, 0, 0, 0];
  let cleared = 0;
  for (const entry of srState.values()) {
    if (entry.box >= CLEARED_BOX) { cleared += 1; continue; }
    const i = Math.max(0, Math.min(4, entry.box - 1));
    tiers[i] += 1;
  }
  let dueCount = 0;
  for (const entry of srState.values()) {
    if (entry.box >= 1 && entry.box <= 5 && entry.nextDueAt <= now) dueCount += 1;
  }
  return { tiers, unseen: ALL_QUESTION_IDS.length - srState.size, cleared, dueCount };
}

export async function refresh() {
  const [stats, activeWrong, sr, tests, activeDays, bookmarks, notes, resume, daily, lifetime] =
    await Promise.all([
      getQuestionStats(), getActiveWrongCounts(), getQuestionSrState(), listSmallTests(),
      getActiveDays(), getBookmarks(), getNotes(), getResumeSession(),
      getDailyStats(), getLifetimeStat(),
    ]);
  state.wrongCounts = activeWrong;
  state.questionStats = stats;
  state.categoryStats = buildCategoryStats(stats);
  state.srState = sr;
  state.shelf = computeShelfCounts(sr);
  state.smallTestCount = tests.length;
  state.streak = computeStreak(activeDays);
  state.bookmarkedIds = bookmarks;
  state.notes = notes;
  state.resume = resume;
  state.daily = daily;
  state.lifetime = lifetime;

  if (state.settings?.cloudEnabled) {
    const today = localDateString();
    const weekStart = weekStartOf(today);
    let weekCount = 0;
    for (const [date, s] of daily) {
      if (date >= weekStart && date <= today) weekCount += s.answered;
    }
    const todayCount = daily.get(today)?.answered ?? 0;
    const accuracy = lifetime.answered > 0 ? Math.round((lifetime.correct / lifetime.answered) * 100) : 0;
    const dailyCounts = {};
    for (const [date, s] of daily) {
      if (s.answered > 0) dailyCounts[date] = s.answered;
    }
    pushStats({
      todayCount, weekCount, streak: state.streak.days, accuracy,
      lifetimeAnswered: lifetime.answered, dailyCounts,
    }).catch(() => {});
  }
  emit();
  return state.shelf;
}

export async function initState() {
  state.settings = await loadSettings();
  await refresh();
  reloadHelpRequests();
  state.ready = true;
  emit();
}

export async function reloadHelpRequests() {
  if (!state.settings?.cloudEnabled) { state.helpRequestedIds = new Set(); emit(); return; }
  const { getMyHelpRequests } = await import('./cloud.js');
  state.helpRequestedIds = await getMyHelpRequests().catch(() => new Set());
  emit();
}

export function setHelpRequested(questionId, on) {
  const next = new Set(state.helpRequestedIds);
  if (on) next.add(questionId); else next.delete(questionId);
  state.helpRequestedIds = next;
  emit();
}

export async function updateSettings(next) {
  state.settings = next;
  await saveSettings(next);
  emit();
}

export async function toggleBookmarkId(questionId) {
  const { toggleBookmark } = await import('./store.js');
  const isNow = await toggleBookmark(questionId);
  const nextSet = new Set(state.bookmarkedIds);
  if (isNow) nextSet.add(questionId); else nextSet.delete(questionId);
  state.bookmarkedIds = nextSet;
  emit();
  return isNow;
}

export async function setNoteFor(questionId, note) {
  const { setNote } = await import('./store.js');
  await setNote(questionId, note);
  const next = new Map(state.notes);
  const trimmed = note.trim();
  if (!trimmed) next.delete(questionId); else next.set(questionId, trimmed);
  state.notes = next;
  emit();
}

// クイズ結果の付箋反映。mode: 'review' | 'practice'
export async function applyQuizResult(questions, answers, opts = {}) {
  const graduateIds = new Set(opts.graduateIds ?? []);
  const forceShelfIds = new Set(opts.forceShelfIds ?? []);
  const mode = opts.mode ?? 'review';
  const tier5 = [];
  const prevTiers = [...state.shelf.tiers];
  const flow = { leave: [0, 0, 0, 0, 0], promote: [0, 0, 0, 0], enter: 0 };
  const actions = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const pass = answers[i] === q.answer_index;
    const prevBox = state.srState.get(q.id)?.box ?? 0;
    if (graduateIds.has(q.id)) {
      if (prevBox >= 1 && prevBox <= 5) { flow.leave[prevBox - 1] += 1; tier5.push(q); }
      actions.push(graduateQuestion(q.id));
    } else if (forceShelfIds.has(q.id)) {
      if (prevBox !== 1) flow.enter += 1;
      actions.push(moveQuestionToShelf(q.id));
    } else if (mode === 'review') {
      if (pass) {
        if (prevBox >= 1 && prevBox <= 4) flow.promote[prevBox - 1] += 1;
        else if (prevBox === 5) { flow.leave[4] += 1; tier5.push(q); }
      } else if (prevBox !== 1) {
        flow.enter += 1;
      }
      actions.push(recordQuestionReview(q.id, pass));
    }
  }
  await Promise.all(actions);
  const nextShelf = await refresh();
  return { tier5Questions: tier5, prevTiers, nextTiers: nextShelf.tiers, peelFlow: flow };
}

export async function forceIntoShelf(id) { await moveQuestionToShelf(id); await refresh(); }
export async function graduateFromShelf(id) { await graduateQuestion(id); await refresh(); }
