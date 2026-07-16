import { el, renderQuestionText, navigate, goBack, render } from '../ui.js';
import { state, toggleBookmarkId, setNoteFor, refresh } from '../state.js';
import { TIER_COLOR, TIER_MARK, TIER_NAME, categoryPalette } from '../theme.js';
import {
  CATEGORIES, QUESTIONS, mediumKey, MEDIUM_COUNTS, questionsByLarge, questionsByMedium,
  questionById, buildTopicQuiz, buildSimilarQuiz, buildWrongQuiz, buildCustomQuiz,
  wrongQuestionList, WRONG_TITLE,
} from '../data.js';
import {
  createSmallTest, deleteSmallTest, listSmallTests, getTodayAnswers,
  getRecentAnswers, getRecentWrongRanked,
} from '../store.js';
import { hapticLight } from '../fx.js';
import { helpButton } from '../helpui.js';

function appbar(title) {
  return el('div', { class: 'appbar' }, [
    el('button', { class: 'back', text: '‹', onclick: () => goBack() }),
    el('div', { class: 'title', text: title }),
  ]);
}

const LABELS = ['①', '②', '③', '④'];

// 問題カード(選択肢・和訳解説・ブックマーク・メモ・似た問題)
export function questionCard(q, opts = {}) {
  const isBk = state.bookmarkedIds.has(q.id);
  const note = state.notes.get(q.id);
  const card = el('div', { class: 'card', style: { margin: '10px 0' } });
  if (opts.leftBadge) card.style.borderLeft = `6px solid ${opts.leftBadge.color}`;

  card.appendChild(el('div', { class: 'row between', style: { marginBottom: '6px' } }, [
    el('div', { class: 'card-sub', text: `${q.category_large}・${q.category_medium}` }),
    el('div', { class: 'row', style: { gap: '6px' } }, [
      opts.leftBadge ? el('span', { style: { color: opts.leftBadge.color, fontWeight: 800 }, text: opts.leftBadge.text } ) : null,
      el('button', { class: 'icon-btn', style: { width: '34px', height: '34px', fontSize: '16px' }, text: isBk ? '⭐' : '☆', onclick: async (e) => { hapticLight(); await toggleBookmarkId(q.id); e.target.textContent = state.bookmarkedIds.has(q.id) ? '⭐' : '☆'; } }),
    ]),
  ]));

  const qEl = el('div', { style: { fontSize: 'calc(16px * var(--fs))', fontWeight: 600, lineHeight: 1.5, marginBottom: '8px' } });
  qEl.appendChild(renderQuestionText(q.question));
  card.appendChild(qEl);

  const showAns = opts.showAnswer !== false;
  q.choices.forEach((c, i) => {
    const correct = i === q.answer_index;
    card.appendChild(el('div', {
      style: {
        padding: '8px 10px', borderRadius: '10px', marginBottom: '6px',
        background: showAns && correct ? 'var(--correct-bg)' : 'var(--surface-alt)',
        border: showAns && correct ? '1.5px solid var(--correct)' : '1px solid var(--border)',
        fontWeight: showAns && correct ? 800 : 400, fontSize: 'calc(15px * var(--fs))',
      },
    }, [el('span', { class: 'muted', text: LABELS[i] + ' ' }), el('span', { text: c }), showAns && correct ? el('span', { text: ' ✅' }) : null]));
  });

  const detail = el('div', { style: { display: 'none', marginTop: '8px' } }, [
    el('div', { class: 'block-label', text: '和訳' }), el('div', { class: 'block-text', text: q.translation ?? '' }),
    el('div', { class: 'block-label', text: '解説' }), el('div', { class: 'block-text', text: q.explanation ?? '' }),
    q.column ? el('div', { class: 'column-box' }, [el('div', { class: 'block-text', text: q.column })]) : null,
  ]);
  card.appendChild(el('button', { class: 'chip', style: { marginTop: '6px' }, onclick: () => { detail.style.display = detail.style.display === 'none' ? 'block' : 'none'; }, text: 'タップで和訳・解説を表示 ▾' }));
  card.appendChild(detail);

  // メモ
  const noteWrap = el('div', { style: { marginTop: '8px' } });
  const noteView = el('div');
  function renderNote() {
    noteView.innerHTML = '';
    const cur = state.notes.get(q.id);
    if (cur) {
      noteView.appendChild(el('div', { class: 'row between', style: { background: 'var(--gold-bg)', borderRadius: '10px', padding: '8px 10px' } }, [
        el('div', { class: 'grow', style: { fontSize: '13px', whiteSpace: 'pre-wrap' }, text: cur }),
        el('button', { class: 'chip', style: { padding: '4px 8px' }, onclick: () => editNote(cur), text: '編集' }),
      ]));
    } else {
      noteView.appendChild(el('button', { class: 'chip', onclick: () => editNote(''), text: '✏️ メモを書く' }));
    }
  }
  function editNote(cur) {
    noteView.innerHTML = '';
    const ta = el('textarea', { class: 'input', value: cur });
    noteView.appendChild(el('div', [ta, el('div', { class: 'row', style: { gap: '8px', marginTop: '6px' } }, [
      el('button', { class: 'btn', style: { width: 'auto', padding: '8px 14px' }, onclick: async () => { await setNoteFor(q.id, ta.value); renderNote(); }, text: '保存' }),
      el('button', { class: 'chip', onclick: renderNote, text: 'キャンセル' }),
    ])]));
    ta.focus();
  }
  renderNote();
  noteWrap.appendChild(noteView);
  card.appendChild(noteWrap);

  const actions = el('div', { class: 'row', style: { gap: '8px', marginTop: '8px', flexWrap: 'wrap' } });
  if (opts.onSimilar) {
    actions.appendChild(el('button', { class: 'chip', onclick: opts.onSimilar, text: '🔀 似た問題に挑戦' }));
  }
  const help = helpButton(q.id);
  help.style.width = 'auto';
  help.style.flex = '1';
  help.style.padding = '10px 14px';
  actions.appendChild(help);
  card.appendChild(actions);
  return card;
}

// ── 分野から解く ──
const expanded = new Set();
export function TopicPickerScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('📗 分野から解く'));
  const list = el('div', { class: 'list' });
  const stats = state.questionStats;
  for (const cat of CATEGORIES) {
    const pal = categoryPalette(cat.large);
    const pool = questionsByLarge(cat.large);
    let attempted = 0;
    for (const q of pool) if (stats.has(q.id)) attempted += 1;
    const pct = pool.length ? Math.round((attempted / pool.length) * 100) : 0;
    const header = el('button', { class: 'card tap', style: { width: '100%', textAlign: 'left', margin: '0 0 10px', border: `2px solid ${pal.tone}`, borderBottomWidth: '4px' }, onclick: () => { if (expanded.has(cat.large)) expanded.delete(cat.large); else expanded.add(cat.large); render(); } }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'card-title', style: { color: pal.dark }, text: `${expanded.has(cat.large) ? '▾' : '▸'} ${cat.large}` }),
        el('div', { class: 'card-sub', text: `${pool.length}問・取り組み${pct}%` }),
      ]),
      el('div', { class: 'pbar', style: { marginTop: '8px' } }, [el('i', { style: { width: `${pct}%`, background: pal.tone } })]),
    ]);
    list.appendChild(header);
    if (expanded.has(cat.large)) {
      const mediums = el('div', { style: { margin: '-4px 0 12px 8px' } });
      mediums.appendChild(el('button', { class: 'chip active', style: { margin: '4px' }, onclick: () => startTopic(cat.large, null), text: `この分野ぜんぶ (${pool.length})` }));
      for (const m of cat.mediums) {
        const n = MEDIUM_COUNTS.get(mediumKey(cat.large, m.medium)) ?? 0;
        if (n === 0) continue;
        mediums.appendChild(el('button', { class: 'chip', style: { margin: '4px' }, onclick: () => startTopic(cat.large, m.medium), text: `${m.medium} (${n})` }));
      }
      list.appendChild(mediums);
    }
  }
  wrap.appendChild(list);
  return wrap;
}
function startTopic(large, medium) {
  const qs = buildTopicQuiz(large, medium);
  if (!qs.length) return;
  navigate('quiz', { questions: qs, title: medium ? `${large}・${medium}` : large, source: { kind: 'topic', large, medium }, resumable: true });
}

// ── 小テスト一覧 ──
export function SmallTestsScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('📝 小テスト'));
  const body = el('div', { class: 'list' });
  wrap.appendChild(body);
  body.appendChild(el('button', { class: 'btn', style: { marginBottom: '12px' }, onclick: () => navigate('smallTestEdit', {}), text: '＋ 新しい小テストを作る' }));
  (async () => {
    const tests = await listSmallTests();
    if (tests.length === 0) { body.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '📝' }), el('div', { class: 'muted', text: '範囲・問題数・出題方法を決めて保存できます' })])); return; }
    for (const t of tests) {
      body.appendChild(el('div', { class: 'card', style: { margin: '0 0 10px' } }, [
        el('div', { class: 'row between' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'card-title', text: t.name }),
            el('div', { class: 'card-sub', text: `${t.mediums.length}分野・${t.size ? `${t.size}問` : '全問'}・${methodLabel(t.method)}` }),
          ]),
          el('button', { class: 'chip', style: { color: 'var(--wrong)', borderColor: 'var(--wrong)' }, onclick: async () => { if (confirm('削除しますか？')) { await deleteSmallTest(t.id); render(); } }, text: '削除' }),
        ]),
        el('button', { class: 'btn secondary', style: { marginTop: '10px' }, onclick: () => {
          const qs = buildCustomQuiz(t.mediums, t.size ?? 'all', t.method, state.wrongCounts);
          if (!qs.length) { alert('対象の問題がありません'); return; }
          navigate('quiz', { questions: qs, title: t.name, source: { kind: 'fixed' }, resumable: true, smallTestId: t.id });
        }, text: '▶ 挑戦する' }),
      ]));
    }
  })();
  return wrap;
}
function methodLabel(m) { return m === 'random' ? 'ランダム' : m === 'sequential' ? '順番' : '苦手優先'; }

// ── 小テスト作成 ──
export function SmallTestEditScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('新規 小テスト'));
  const selected = new Set();
  let method = 'random';
  let size = 10;

  const body = el('div', { class: 'list' });
  wrap.appendChild(body);

  const nameIn = el('input', { class: 'input', placeholder: 'テスト名', value: '英文法テスト' });
  body.appendChild(el('div', { style: { marginBottom: '12px' } }, [el('div', { class: 'section-label', style: { padding: '0 0 4px' }, text: 'テスト名' }), nameIn]));

  body.appendChild(el('div', { class: 'section-label', style: { padding: '0 0 4px' }, text: '出題方法' }));
  const methodRow = el('div', { class: 'row', style: { gap: '8px', marginBottom: '12px' } });
  [['random', 'ランダム'], ['sequential', '順番'], ['weak', '苦手優先']].forEach(([v, l]) => {
    const b = el('button', { class: 'chip' + (method === v ? ' active' : ''), style: { flex: 1, justifyContent: 'center' }, onclick: () => { method = v; for (const c of methodRow.children) c.classList.toggle('active', c === b); }, text: l });
    methodRow.appendChild(b);
  });
  body.appendChild(methodRow);

  body.appendChild(el('div', { class: 'section-label', style: { padding: '0 0 4px' }, text: '問題数' }));
  const sizeRow = el('div', { class: 'row', style: { gap: '8px', marginBottom: '12px' } });
  [10, 20, 30, 50, 'all'].forEach((v) => {
    const b = el('button', { class: 'chip' + (size === v ? ' active' : ''), style: { flex: 1, justifyContent: 'center' }, onclick: () => { size = v; for (const c of sizeRow.children) c.classList.toggle('active', c === b); }, text: v === 'all' ? '全問' : `${v}問` });
    sizeRow.appendChild(b);
  });
  body.appendChild(sizeRow);

  const counter = el('div', { class: 'section-label', style: { padding: '0 0 4px' }, text: '出題範囲を選ぶ（0分野）' });
  body.appendChild(counter);
  function updateCounter() {
    let total = 0;
    for (const k of selected) total += MEDIUM_COUNTS.get(k) ?? 0;
    counter.textContent = `出題範囲を選ぶ（${selected.size}トピック・${total}問）`;
  }
  for (const cat of CATEGORIES) {
    const pal = categoryPalette(cat.large);
    const largeMediumKeys = cat.mediums.map((m) => mediumKey(cat.large, m.medium)).filter((k) => (MEDIUM_COUNTS.get(k) ?? 0) > 0);
    const allBtn = el('button', { class: 'chip', style: { margin: '2px', borderColor: pal.tone, color: pal.dark }, onclick: () => {
      const allSel = largeMediumKeys.every((k) => selected.has(k));
      for (const k of largeMediumKeys) { if (allSel) selected.delete(k); else selected.add(k); }
      render2();
    }, text: `▤ ${cat.large}` });
    const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap' } });
    function render2() {
      chips.innerHTML = '';
      chips.appendChild(allBtn);
      for (const m of cat.mediums) {
        const k = mediumKey(cat.large, m.medium);
        const n = MEDIUM_COUNTS.get(k) ?? 0;
        if (n === 0) continue;
        chips.appendChild(el('button', { class: 'chip' + (selected.has(k) ? ' active' : ''), style: { margin: '2px' }, onclick: () => { if (selected.has(k)) selected.delete(k); else selected.add(k); render2(); updateCounter(); }, text: `${m.medium}(${n})` }));
      }
      updateCounter();
    }
    render2();
    body.appendChild(el('div', { style: { marginBottom: '8px' } }, [chips]));
  }

  body.appendChild(el('button', { class: 'btn', style: { marginTop: '12px' }, onclick: async () => {
    if (selected.size === 0) { alert('分野を1つ以上選んでください'); return; }
    const name = nameIn.value.trim() || '英文法テスト';
    await createSmallTest(name, [...selected], size === 'all' ? null : size, method);
    await refresh();
    goBack();
  }, text: '保存する' }));
  return wrap;
}

// ── 付箋つきの問題 / ブックマーク ──
let tierFilter = 'all';
let largeFilter = 'all';
export function StickyListScreen(params) {
  const bookmarkOnly = !!params.bookmarkOnly;
  const wrap = el('div');
  wrap.appendChild(appbar(bookmarkOnly ? '⭐ ブックマーク' : '🏷️ 付箋つきの問題'));

  let items;
  if (bookmarkOnly) {
    items = [...state.bookmarkedIds].map((id) => ({ q: questionById(id), box: state.srState.get(id)?.box ?? 0 })).filter((x) => x.q);
  } else {
    items = [];
    for (const [id, entry] of state.srState) {
      if (entry.box < 1 || entry.box > 5) continue;
      const q = questionById(id);
      if (q) items.push({ q, box: entry.box });
    }
    items.sort((a, b) => a.box - b.box);
  }

  if (!bookmarkOnly) {
    const counts = [0, 0, 0, 0, 0];
    for (const it of items) counts[it.box - 1] += 1;
    wrap.appendChild(el('div', { class: 'chip-row' }, [
      el('button', { class: 'chip' + (tierFilter === 'all' ? ' active' : ''), onclick: () => { tierFilter = 'all'; render(); }, text: `すべて ${items.length}` }),
      ...counts.map((c, i) => el('button', { class: 'chip' + (tierFilter === `t${i}` ? ' active' : ''), style: { borderColor: TIER_COLOR[i] }, onclick: () => { tierFilter = `t${i}`; render(); }, text: `${TIER_MARK[i]}${TIER_NAME[i]} ${c}` })),
    ]));
  }

  let filtered = items;
  if (tierFilter !== 'all' && !bookmarkOnly) filtered = filtered.filter((x) => x.box === Number(tierFilter.slice(1)) + 1);

  const list = el('div', { class: 'list' });
  if (filtered.length === 0) {
    list.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '✨' }), el('div', { class: 'muted', text: bookmarkOnly ? 'ブックマークはまだありません' : '該当する付箋はありません' })]));
  } else {
    for (const it of filtered.slice(0, 300)) {
      const badge = !bookmarkOnly ? { color: TIER_COLOR[it.box - 1], text: TIER_MARK[it.box - 1] } : null;
      list.appendChild(questionCard(it.q, {
        leftBadge: badge,
        onSimilar: () => { const qs = buildSimilarQuiz(it.q.category_large, it.q.category_medium, it.q.id); if (qs.length) navigate('quiz', { questions: qs, title: `${it.q.category_medium}・似た問題`, source: { kind: 'fixed' } }); },
      }));
    }
    if (filtered.length > 300) list.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', padding: '12px' }, text: `他 ${filtered.length - 300}件` }));
  }
  wrap.appendChild(list);
  return wrap;
}

// ── 検索 ──
let searchIndex = null;
function normalize(s) { return String(s ?? '').toLowerCase().normalize('NFKC').replace(/[（）()「」『』。、,.\s]/g, ''); }
function getIndex() {
  if (!searchIndex) searchIndex = QUESTIONS.map((q) => ({ q, f: [normalize(q.question), normalize(q.choices.join(' ')), normalize(q.translation), normalize(q.explanation)] }));
  return searchIndex;
}
export function SearchScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('🔎 検索'));
  const input = el('input', { class: 'input', placeholder: '問題文・選択肢・和訳・解説から', autofocus: true });
  wrap.appendChild(el('div', { style: { padding: '8px 16px' } }, [input]));
  const hint = el('div', { class: 'section-label', text: '全3,767問から検索します' });
  wrap.appendChild(hint);
  const results = el('div', { class: 'list' });
  wrap.appendChild(results);
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  function run() {
    const nq = normalize(input.value);
    results.innerHTML = '';
    if (!nq) { hint.textContent = '全3,767問から検索します'; return; }
    const out = [];
    for (const it of getIndex()) {
      let score = 0;
      const w = [10, 6, 5, 3];
      for (let i = 0; i < it.f.length; i++) if (it.f[i].includes(nq)) score += w[i];
      const note = state.notes.get(it.q.id);
      if (note && normalize(note).includes(nq)) score += 8;
      if (score > 0) out.push({ q: it.q, score });
    }
    out.sort((a, b) => b.score - a.score);
    hint.textContent = `${out.length}件`;
    for (const r of out.slice(0, 100)) {
      results.appendChild(questionCard(r.q, { onSimilar: () => { const qs = buildSimilarQuiz(r.q.category_large, r.q.category_medium, r.q.id); if (qs.length) navigate('quiz', { questions: qs, title: `${r.q.category_medium}・似た問題`, source: { kind: 'fixed' } }); } }));
    }
  }
  return wrap;
}

// ── 間違えた問題 ──
export function WrongScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('❌ 間違えた問題'));
  const ranked = wrongQuestionList(state.wrongCounts);
  const body = el('div', { class: 'list' });
  wrap.appendChild(body);
  if (ranked.length === 0) { body.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '🎉' }), el('div', { class: 'muted', text: '間違えた問題はありません' })])); return wrap; }
  body.appendChild(el('button', { class: 'btn', style: { marginBottom: '12px' }, onclick: () => {
    const qs = buildWrongQuiz(state.wrongCounts);
    if (qs.length) navigate('quiz', { questions: qs, title: WRONG_TITLE, source: { kind: 'fixed' }, resumable: true });
  }, text: `▶ まとめて復習 (${Math.min(10, ranked.length)}問)` }));
  for (const q of ranked.slice(0, 200)) {
    const wc = state.wrongCounts.get(q.id) ?? 0;
    body.appendChild(questionCard(q, { leftBadge: { color: 'var(--wrong)', text: `✕${wc}` }, onSimilar: () => { const qs = buildSimilarQuiz(q.category_large, q.category_medium, q.id); if (qs.length) navigate('quiz', { questions: qs, title: `${q.category_medium}・似た問題`, source: { kind: 'fixed' } }); } }));
  }
  return wrap;
}

// ── 弱点(全分野) ──
export function WeaknessScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('📊 弱点(全分野)'));
  const list = el('div', { class: 'list' });
  for (const c of state.categoryStats) {
    const acc = c.accuracy != null ? `${Math.round(c.accuracy * 100)}%` : '—';
    const pct = c.attempts > 0 ? Math.round((c.accuracy ?? 0) * 100) : 0;
    list.appendChild(el('button', { class: 'card tap', style: { width: '100%', textAlign: 'left', margin: '0 0 8px' }, onclick: () => { const qs = buildTopicQuiz(c.large, null); if (qs.length) navigate('quiz', { questions: qs, title: c.large, source: { kind: 'topic', large: c.large, medium: null }, resumable: true }); } }, [
      el('div', { class: 'row between' }, [
        el('div', { style: { fontWeight: 700 }, text: c.large }),
        el('div', { class: 'card-sub', text: `${c.attempts}回・正解率${acc}` }),
      ]),
      el('div', { class: 'pbar', style: { marginTop: '8px' } }, [el('i', { style: { width: `${pct}%`, background: c.attempts === 0 ? 'var(--track)' : pct < 60 ? 'var(--wrong)' : 'var(--primary)' } })]),
    ]));
  }
  wrap.appendChild(list);
  return wrap;
}

// ── 今日解いた問題 ──
export function TodayAnswersScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('📝 今日解いた問題'));
  const body = el('div', { class: 'list' });
  wrap.appendChild(body);
  (async () => {
    const ans = await getTodayAnswers();
    if (ans.length === 0) { body.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '💤' }), el('div', { class: 'muted', text: '今日はまだ問題を解いていません' })])); return; }
    for (const a of ans) {
      const q = questionById(a.questionId);
      if (!q) continue;
      body.appendChild(questionCard(q, { leftBadge: { color: a.isCorrect ? 'var(--correct)' : 'var(--wrong)', text: a.isCorrect ? '○' : '✕' } }));
    }
  })();
  return wrap;
}

// ── さっきの問題 ──
export function RecentScreen() {
  const wrap = el('div');
  wrap.appendChild(appbar('🕒 さっきの問題'));
  const body = el('div', { class: 'list' });
  wrap.appendChild(body);
  (async () => {
    const [recent, wrong] = await Promise.all([getRecentAnswers(20), getRecentWrongRanked(7, 20)]);
    body.appendChild(el('div', { class: 'section-label', style: { padding: '0 0 4px' }, text: '直近解いた20問' }));
    if (recent.length === 0) body.appendChild(el('div', { class: 'muted', style: { padding: '8px' }, text: 'まだありません' }));
    for (const a of recent) {
      const q = questionById(a.questionId);
      if (q) body.appendChild(questionCard(q, { leftBadge: { color: a.isCorrect ? 'var(--correct)' : 'var(--wrong)', text: a.isCorrect ? '○' : '✕' } }));
    }
    if (wrong.length) {
      body.appendChild(el('div', { class: 'section-label', style: { padding: '12px 0 4px' }, text: '最近詰まった問題TOP20' }));
      for (const w of wrong) {
        const q = questionById(w.questionId);
        if (q) body.appendChild(questionCard(q, { leftBadge: { color: 'var(--wrong)', text: `✕${w.wrong}` } }));
      }
    }
  })();
  return wrap;
}
