// 先生用: 補習リクエスト一覧・印刷ページ(Web版限定)。
import { loadData, questionById } from './data.js';
import { renderQuestionText, el } from './ui.js';
import { ensureAnonUser, listHelpRequests, markHelpHandled, isFirebaseConfigured } from './cloud.js';

// ── 簡易パスコード(生徒のいたずら防止程度。完全な保護ではありません) ──
// 先生はここを好きな文字列に変更してください。
const PASSCODE = 'sensei';

const LABELS = ['①', '②', '③', '④'];
const app = document.getElementById('teacher');

let allRequests = [];
let groupFilter = 'all';
let showHandled = false;

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function gate() {
  if (sessionStorage.getItem('teacher-ok') === '1') { start(); return; }
  app.innerHTML = '';
  const input = el('input', { class: 't-input', type: 'password', placeholder: 'パスコード', autofocus: true });
  const submit = () => {
    if (input.value === PASSCODE) { sessionStorage.setItem('teacher-ok', '1'); start(); }
    else { input.value = ''; input.placeholder = 'パスコードが違います'; }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  app.appendChild(el('div', { class: 'gate' }, [
    el('div', { class: 'gate-box' }, [
      el('div', { style: { fontSize: '40px' }, text: '🧑‍🏫' }),
      el('h2', { text: '先生用ページ' }),
      el('div', { class: 'muted', text: '補習リクエストの一覧と印刷' }),
      input,
      el('button', { class: 't-btn', onclick: submit, text: '入る' }),
    ]),
  ]));
}

const DEMO = new URLSearchParams(location.search).get('demo') === '1';

async function start() {
  app.innerHTML = '<div class="loading">読み込み中…</div>';
  if (!DEMO && !isFirebaseConfigured()) {
    app.innerHTML = '<div class="loading">Firebaseが設定されていません。</div>';
    return;
  }
  await loadData();
  if (!DEMO) await ensureAnonUser().catch(() => null);
  await reload();
}

async function reload() {
  if (DEMO) {
    const now = Date.now();
    allRequests = [
      { id: 'a_q00001', questionId: 'q00001', uid: 'a', nickname: 'みかん', groupCodes: ['12345'], handled: false, createdAt: now - 3600000 },
      { id: 'b_q00001', questionId: 'q00001', uid: 'b', nickname: 'たろう', groupCodes: ['12345'], handled: false, createdAt: now - 1800000 },
      { id: 'c_q00050', questionId: 'q00050', uid: 'c', nickname: 'こうちゃん', groupCodes: ['12345'], handled: false, createdAt: now - 900000 },
    ];
    renderAll();
    return;
  }
  allRequests = await listHelpRequests().catch(() => []);
  renderAll();
}

function groupCodesPresent() {
  const set = new Set();
  for (const r of allRequests) for (const c of r.groupCodes ?? []) set.add(c);
  return [...set].sort();
}

function buildGroups() {
  // questionId ごとにまとめる
  const byQ = new Map();
  for (const r of allRequests) {
    if (groupFilter !== 'all' && !(r.groupCodes ?? []).includes(groupFilter)) continue;
    const g = byQ.get(r.questionId) ?? { questionId: r.questionId, requesters: [] };
    g.requesters.push(r);
    byQ.set(r.questionId, g);
  }
  let groups = [...byQ.values()];
  // 全リクエストが解説済みの問題は showHandled でなければ隠す
  groups = groups.filter((g) => showHandled || g.requesters.some((r) => !r.handled));
  groups.sort((a, b) => {
    const au = a.requesters.some((r) => !r.handled) ? 0 : 1;
    const bu = b.requesters.some((r) => !r.handled) ? 0 : 1;
    if (au !== bu) return au - bu;
    if (b.requesters.length !== a.requesters.length) return b.requesters.length - a.requesters.length;
    return Math.max(...b.requesters.map((r) => r.createdAt)) - Math.max(...a.requesters.map((r) => r.createdAt));
  });
  return groups;
}

function renderAll() {
  app.innerHTML = '';
  const groups = buildGroups();
  const codes = groupCodesPresent();

  // ── コントロール(印刷では非表示) ──
  const groupSel = el('select', { class: 't-input', onchange: (e) => { groupFilter = e.target.value; renderAll(); } }, [
    el('option', { value: 'all', text: 'すべてのクラス' }),
    ...codes.map((c) => el('option', { value: c, text: `クラスコード ${c}`, selected: groupFilter === c })),
  ]);
  const handledChk = el('input', { type: 'checkbox' });
  handledChk.checked = showHandled;
  handledChk.addEventListener('change', () => { showHandled = handledChk.checked; renderAll(); });
  const namesChk = el('input', { type: 'checkbox' });
  namesChk.checked = !document.body.classList.contains('hide-print-names');
  namesChk.addEventListener('change', () => { document.body.classList.toggle('hide-print-names', !namesChk.checked); });

  app.appendChild(el('div', { class: 'controls no-print' }, [
    el('div', { class: 'ctitle', text: `🧑‍🏫 補習リクエスト一覧（${groups.length}問）` }),
    el('div', { class: 'ctrl-row' }, [
      groupSel,
      el('label', { class: 'ck' }, [handledChk, el('span', { text: ' 解説済みも表示' })]),
      el('label', { class: 'ck' }, [namesChk, el('span', { text: ' 印刷に生徒名を含める' })]),
      el('button', { class: 't-btn ghost', onclick: reload, text: '🔄 更新' }),
      el('button', { class: 't-btn', onclick: () => window.print(), text: '🖨 印刷' }),
    ]),
  ]));

  if (groups.length === 0) {
    app.appendChild(el('div', { class: 'loading', text: 'リクエストはまだありません。' }));
    return;
  }

  const printHead = el('div', { class: 'print-only print-head' }, [
    el('h1', { text: 'スパイラル英文法 — 補習プリント' }),
    el('div', { class: 'muted', text: `${groups.length}問 / 印刷日: ${fmtDate(Date.now())}` }),
  ]);
  app.appendChild(printHead);

  const list = el('div', { class: 't-list' });
  groups.forEach((g, i) => list.appendChild(qcard(g, i + 1)));
  app.appendChild(list);
}

function qcard(g, num) {
  const q = questionById(g.questionId);
  const card = el('div', { class: 'qcard' });
  if (!q) {
    card.appendChild(el('div', { text: `問題が見つかりません (ID: ${g.questionId})` }));
    return card;
  }
  const allHandled = g.requesters.every((r) => r.handled);

  // ヘッダ
  card.appendChild(el('div', { class: 'qhead' }, [
    el('div', { class: 'qnum', text: `${num}` }),
    el('div', { class: 'grow' }, [
      el('div', { class: 'qcat', text: `${q.category_large}・${q.category_medium}` }),
    ]),
    el('div', { class: 'qcount no-print' + (allHandled ? ' done' : ''), text: allHandled ? '解説済み' : `リクエスト ${g.requesters.length}件` }),
  ]));

  // 問題文
  const qt = el('div', { class: 'qtext' });
  qt.appendChild(renderQuestionText(q.question));
  card.appendChild(qt);

  // 選択肢
  const ch = el('div', { class: 'qchoices' });
  q.choices.forEach((c, i) => {
    const correct = i === q.answer_index;
    ch.appendChild(el('div', { class: 'qchoice' + (correct ? ' correct' : '') }, [
      el('span', { text: `${LABELS[i]} ${c}` }), correct ? el('span', { text: '　✓ 正解' }) : null,
    ]));
  });
  card.appendChild(ch);

  // 和訳・解説
  card.appendChild(el('div', { class: 'qblock' }, [el('b', { text: '和訳　' }), el('span', { text: q.translation ?? '' })]));
  card.appendChild(el('div', { class: 'qblock' }, [el('b', { text: '解説' }), el('div', { class: 'qexp', text: q.explanation ?? '' })]));
  if (q.column) card.appendChild(el('div', { class: 'qcolumn', text: q.column }));

  // リクエストした生徒
  const names = g.requesters.map((r) => r.nickname).filter((v, i, a) => a.indexOf(v) === i);
  card.appendChild(el('div', { class: 'requesters' }, [
    el('b', { text: 'リクエスト: ' }),
    el('span', { text: names.join('、') }),
    el('span', { class: 'muted', text: `　（${g.requesters.length}件・最新 ${fmtDate(Math.max(...g.requesters.map((r) => r.createdAt)))}）` }),
  ]));

  // 解説済みトグル(印刷では非表示)
  card.appendChild(el('div', { class: 'no-print', style: { marginTop: '8px' } }, [
    el('button', {
      class: 't-btn ' + (allHandled ? 'ghost' : ''),
      onclick: async () => {
        for (const r of g.requesters) await markHelpHandled(r.id, !allHandled).catch(() => {});
        await reload();
      },
      text: allHandled ? '↩ 未解説に戻す' : '✓ 解説済みにする',
    }),
  ]));

  if (allHandled) card.classList.add('handled');
  return card;
}

if (app) gate();
