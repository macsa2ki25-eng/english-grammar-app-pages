import { el, renderQuestionText, replace, switchTab, resetTabToRoot, currentTab } from '../ui.js';
import { state, applyQuizResult, toggleBookmarkId } from '../state.js';
import { recordAnswer, saveResumeSession, clearResumeSession, touchSmallTestRun } from '../store.js';
import { buildSimilarQuiz } from '../data.js';
import {
  playCorrect, playWrong, playLevelUp, speakEnglish,
  hapticSuccess, hapticError, hapticWarning, hapticHeavy, hapticLight,
} from '../fx.js';

const LABELS = ['①', '②', '③', '④'];

function goToSolveHome() {
  const t = currentTab();
  resetTabToRoot(t);
  if (t !== 'solve') resetTabToRoot('solve');
  switchTab('solve');
}

export function QuizScreen(params) {
  const questions = params.questions;
  const title = params.title;
  const source = params.source ?? { kind: 'fixed' };
  const retryOnWrong = state.settings.retryOnWrong;
  const autoSpeak = state.settings.autoSpeak;
  const resumable = !!params.resumable;
  const mode = source.kind === 'leitner' ? 'review' : 'practice';

  const container = el('div');
  let index = 0;
  const answers = [];
  let graded = null;
  let firstChoice = null;
  let tried = [];
  let revealed = false;
  let shelfMarked = false;
  let shelfRemoved = false;
  const graduateIds = new Set();
  const forceShelfIds = new Set();

  if (params.smallTestId != null) touchSmallTestRun(params.smallTestId).catch(() => {});

  function q() { return questions[index]; }
  function onShelf() {
    const box = state.srState.get(q().id)?.box ?? 0;
    return box >= 1 && box <= 5;
  }

  function select(choiceIndex) {
    if (revealed || tried.includes(choiceIndex)) return;
    const correct = choiceIndex === q().answer_index;
    graded = choiceIndex;
    if (firstChoice === null) {
      firstChoice = choiceIndex;
      recordAnswer(q().id, correct).catch(() => {});
    }
    if (!retryOnWrong || correct) {
      revealed = true;
      if (correct) { hapticSuccess(); playCorrect(); } else { hapticError(); playWrong(); }
    } else {
      tried = [...tried, choiceIndex];
      hapticWarning(); playWrong();
    }
    rerender();
  }

  async function finish() {
    const finalAnswers = [...answers, firstChoice];
    await clearResumeSession().catch(() => {});
    const events = await applyQuizResult(questions, finalAnswers, {
      mode, graduateIds: [...graduateIds], forceShelfIds: [...forceShelfIds],
    });
    replace('result', { questions, answers: finalAnswers, title, source, events });
  }

  function next() {
    if (firstChoice === null) return;
    answers.push(firstChoice);
    if (index === questions.length - 1) { finish(); return; }
    index += 1;
    graded = null; firstChoice = null; tried = []; revealed = false;
    shelfMarked = false; shelfRemoved = false;
    rerender();
    if (autoSpeak) speakEnglish(q().question);
  }

  async function quit() {
    const answeredCount = answers.length + (firstChoice !== null ? 1 : 0);
    if (answeredCount === 0 && !params.fromResume) { leaveHome(); return; }
    const remaining = questions.slice(answeredCount);
    const msg = resumable && remaining.length > 0
      ? 'ここまでの解答は付箋に反映されます。続きは次回つづけられます。中断しますか？'
      : 'ここまでの解答は付箋に反映されます。中断しますか？';
    if (!confirm(msg)) return;
    const answeredQs = questions.slice(0, answeredCount);
    const answeredAns = firstChoice !== null ? [...answers, firstChoice] : [...answers];
    await applyQuizResult(answeredQs, answeredAns, {
      mode, graduateIds: [...graduateIds], forceShelfIds: [...forceShelfIds],
    });
    if (resumable && remaining.length > 0) {
      await saveResumeSession({
        title, questionIds: remaining.map((x) => x.id),
        total: questions.length, done: answeredCount, source,
      }).catch(() => {});
    } else {
      await clearResumeSession().catch(() => {});
    }
    leaveHome();
  }

  function leaveHome() { goToSolveHome(); }

  function choiceClass(i) {
    if (revealed) {
      if (i === q().answer_index) return 'choice correct';
      if (i === graded || tried.includes(i)) return 'choice wrong';
      return 'choice dimmed';
    }
    if (tried.includes(i)) return 'choice wrong dimmed';
    return 'choice';
  }

  function rerender() {
    container.innerHTML = '';
    const cur = q();
    const firstAttemptCorrect = firstChoice !== null && firstChoice === cur.answer_index;
    const eventuallyCorrect = retryOnWrong ? revealed && graded === cur.answer_index : firstAttemptCorrect;
    const total = questions.length;
    const wrongCount = state.wrongCounts.get(cur.id) ?? 0;
    const isBookmarked = state.bookmarkedIds.has(cur.id);
    const progress = ((index + (revealed ? 1 : 0)) / total) * 100;

    // ヘッダー
    container.appendChild(el('div', { class: 'quiz-header' }, [
      el('button', { class: 'icon-btn', text: '✕', onclick: quit }),
      el('div', { class: 'progress-track' }, [el('div', { class: 'progress-fill', style: { width: `${progress}%` } })]),
      el('div', { class: 'counter', text: `${index + 1}/${total}` }),
    ]));

    const body = el('div', { class: 'q-body' });
    body.appendChild(el('div', { class: 'q-meta' }, [
      wrongCount > 0 ? el('span', { class: 'wrong-chip', text: `これまで✕${wrongCount}回` }) : el('span'),
      el('div', { class: 'row', style: { gap: '8px' } }, [
        el('button', { class: 'icon-btn', text: '🔊', onclick: () => speakEnglish(cur.question) }),
        el('button', {
          class: 'icon-btn', text: isBookmarked ? '⭐' : '☆',
          onclick: async () => { hapticLight(); await toggleBookmarkId(cur.id); rerender(); },
        }),
      ]),
    ]));

    const qEl = el('div', { class: 'question' });
    qEl.appendChild(renderQuestionText(cur.question));
    body.appendChild(qEl);

    cur.choices.forEach((choice, i) => {
      const btn = el('button', { class: choiceClass(i), onclick: () => select(i) }, [
        el('span', { class: 'label', text: LABELS[i] }),
        el('span', { class: 'txt', text: choice }),
      ]);
      if (revealed && i === cur.answer_index) btn.appendChild(el('span', { class: 'mark', text: '✅' }));
      else if (revealed && (i === graded || tried.includes(i))) btn.appendChild(el('span', { class: 'mark', text: '❌' }));
      body.appendChild(btn);
    });

    if (retryOnWrong && !revealed && tried.length > 0) {
      body.appendChild(el('div', { class: 'retry-hint', text: '不正解。もう一度考えてみよう' }));
    }
    container.appendChild(body);

    if (revealed) container.appendChild(buildPanel(cur, eventuallyCorrect, firstAttemptCorrect));

    if (autoSpeak && index === 0 && !revealed) speakEnglish(cur.question);
  }

  function buildPanel(cur, eventuallyCorrect, firstAttemptCorrect) {
    const panel = el('div', { class: `panel ${eventuallyCorrect ? 'correct' : 'wrong'}` });
    panel.appendChild(el('div', { class: `verdict ${eventuallyCorrect ? 'correct' : 'wrong'}` }, [
      el('div', { class: 'vicon', text: eventuallyCorrect ? '✓' : '✕' }),
      el('div', [
        el('div', { class: 'vtext', text: eventuallyCorrect ? '正解！' : '不正解' }),
        (revealed && tried.length > 0 && graded === cur.answer_index)
          ? el('div', { class: 'muted', style: { fontSize: '12px', fontWeight: 700 }, text: '再挑戦で正解' }) : null,
      ]),
    ]));

    const detail = el('div', { class: 'detail' }, [
      el('div', { class: 'block-label', text: '和訳' }),
      el('div', { class: 'block-text', text: cur.translation ?? '' }),
      el('div', { class: 'block-label', text: '解説' }),
      el('div', { class: 'block-text', text: cur.explanation ?? '' }),
      cur.column ? el('div', { class: 'column-box' }, [el('div', { class: 'block-text', text: cur.column })]) : null,
    ]);
    panel.appendChild(detail);

    // 付箋操作(初回正解時のみ)
    if (firstAttemptCorrect) {
      if (onShelf() || shelfRemoved) {
        const b = el('button', {
          class: 'btn secondary shelf-btn', disabled: shelfRemoved,
          onclick: () => { if (shelfRemoved) return; shelfRemoved = true; graduateIds.add(cur.id); rerender(); },
        }, [el('span', { text: shelfRemoved ? '付箋をはがしました（もう出題されません）' : 'もう覚えた → 付箋をはがす' })]);
        panel.appendChild(b);
      } else {
        const b = el('button', {
          class: 'btn secondary shelf-btn', disabled: shelfMarked,
          onclick: () => { if (shelfMarked) return; shelfMarked = true; forceShelfIds.add(cur.id); rerender(); },
        }, [el('span', { text: shelfMarked ? '付箋を貼りました' : 'あやしい / たまたま → 付箋を貼る' })]);
        panel.appendChild(b);
      }
    }

    panel.appendChild(el('button', {
      class: 'btn', style: { marginTop: '12px' }, onclick: next,
      text: index === questions.length - 1 ? '結果を見る' : '次の問題へ',
    }));
    return panel;
  }

  rerender();
  return container;
}

function praise(percent) {
  if (percent === 100) return { message: 'パーフェクト！', color: 'var(--gold)' };
  if (percent >= 80) return { message: 'すばらしい！', color: 'var(--primary)' };
  if (percent >= 60) return { message: 'その調子！', color: 'var(--primary)' };
  return { message: '復習して再挑戦！', color: 'var(--muted)' };
}

export function ResultScreen(params) {
  const { questions, answers, title, source, events } = params;
  const correct = questions.reduce((a, q, i) => a + (answers[i] === q.answer_index ? 1 : 0), 0);
  const total = questions.length;
  const percent = Math.round((correct / total) * 100);
  const { message, color } = praise(percent);
  const wrap = el('div');

  if (percent === 100) { hapticHeavy(); playLevelUp(); showConfetti(); }
  else if (percent >= 80) hapticSuccess();

  wrap.appendChild(el('div', { class: 'appbar' }, [
    el('button', { class: 'back', text: '‹', onclick: () => goToSolveHome() }),
    el('div', { class: 'title', text: '結果' }),
  ]));

  wrap.appendChild(el('div', { class: 'section-label', text: title }));
  wrap.appendChild(el('div', { class: 'card score-card' }, [
    el('div', { class: 'praise', style: { color }, text: message }),
    el('div', { class: 'score-circle', style: { borderColor: color } }, [
      el('div', { class: 'percent', style: { color }, text: `${percent}%` }),
      el('div', { class: 'score-frac', text: `${correct} / ${total}` }),
    ]),
  ]));

  // 付箋の変化
  const flow = events?.peelFlow;
  if (flow && source?.kind === 'leitner') {
    const changed = flow.promote.reduce((a, b) => a + b, 0) + flow.leave.reduce((a, b) => a + b, 0) + flow.enter;
    if (changed > 0) {
      wrap.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-title', text: '🏷️ 付箋の変化' }),
        el('div', { class: 'card-sub', text: `色が進んだ ${flow.promote.reduce((a, b) => a + b, 0)}問・卒業 ${flow.leave.reduce((a, b) => a + b, 0)}問・新しい付箋 ${flow.enter}問` }),
      ]));
    }
  }

  // 間違えた問題の復習ショートカット
  const wrongQs = questions.filter((q, i) => answers[i] !== q.answer_index);
  const btns = el('div', { style: { padding: '8px 16px 32px', display: 'flex', flexDirection: 'column', gap: '10px' } });
  if (wrongQs.length > 0) {
    btns.appendChild(el('button', {
      class: 'btn secondary',
      onclick: () => replace('quiz', { questions: [...wrongQs], title: `${title}・まちがい復習`, source: { kind: 'fixed' } }),
    }, [el('span', { text: `❌ 間違えた${wrongQs.length}問をもう一度` })]));
  }
  btns.appendChild(el('button', {
    class: 'btn secondary',
    onclick: () => replace('quiz', { questions: [...questions], title, source, resumable: source?.kind !== 'leitner' }),
  }, [el('span', { text: '🔁 もう一度' })]));
  btns.appendChild(el('button', {
    class: 'btn', onclick: () => goToSolveHome(),
  }, [el('span', { text: 'ホームへ' })]));
  wrap.appendChild(btns);

  return wrap;
}

function showConfetti() {
  const colors = ['#F59E0B', '#16A34A', '#DC2626', '#7C3AED', '#0891B2'];
  const c = el('div', { class: 'confetti' });
  for (let i = 0; i < 60; i++) {
    c.appendChild(el('i', {
      style: {
        left: `${Math.random() * 100}%`, background: colors[i % colors.length],
        animationDuration: `${1.5 + Math.random() * 1.5}s`, animationDelay: `${Math.random() * 0.4}s`,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      },
    }));
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 3200);
}
