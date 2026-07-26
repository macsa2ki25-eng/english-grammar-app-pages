import { el, goBack } from '../ui.js';
import { state } from '../state.js';
import {
  isFirebaseConfigured, LEADERBOARD_TABS, MIN_ANSWERED_FOR_ACCURACY,
  RANGE_KIND, DAILY_RETENTION_DAYS,
  currentUid, fetchLeaderboard, fetchMyEntry, fetchGroupLeaderboard, getMyGroups,
  fetchRangeLeaderboard, fetchGroupRangeLeaderboard,
  todayString, weekStartString, shiftDate,
} from '../cloud.js';

let kind = 'todayCount';
let scope = 'global';
let selectedGroup = null;
let range = null;

const RANGE_STORE_KEY = 'spiral-lb-range';

function pad(n) { return n < 10 ? `0${n}` : String(n); }
function firstOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${pad(m)}-01`;
}
function lastOfMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
}
function prevMonth(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function oldestAvailable() {
  return shiftDate(todayString(), -(DAILY_RETENTION_DAYS - 1));
}

function presets() {
  const today = todayString();
  const thisMonth = firstOfMonth(today);
  const prev = prevMonth(today);
  return [
    { label: '今週', start: weekStartString(today), end: today },
    { label: '今月', start: thisMonth, end: today },
    { label: '先月', start: prev, end: lastOfMonth(prev) },
    { label: '過去7日', start: shiftDate(today, -6), end: today },
    { label: '過去30日', start: shiftDate(today, -29), end: today },
  ];
}

function loadRange() {
  if (range) return range;
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_STORE_KEY) || 'null');
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved.start) && /^\d{4}-\d{2}-\d{2}$/.test(saved.end)) {
      range = saved;
      return range;
    }
  } catch {}
  const today = todayString();
  range = { start: firstOfMonth(today), end: today };
  return range;
}
function saveRange(next) {
  range = next;
  try { localStorage.setItem(RANGE_STORE_KEY, JSON.stringify(next)); } catch {}
}

function fmtRange(r) {
  const f = (s) => s.replace(/^\d{4}-/, '').replace('-', '/');
  return `${f(r.start)} 〜 ${f(r.end)}`;
}

export function LeaderboardScreen() {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'appbar' }, [
    el('button', { class: 'back', text: '‹', onclick: () => goBack() }),
    el('div', { class: 'title', text: '🏆 ランキング' }),
  ]));

  wrap.appendChild(el('div', { class: 'info-card' }, [
    el('div', { style: { fontWeight: 900, color: 'var(--primary-dark)', marginBottom: '6px', letterSpacing: '1px', fontSize: '13px' }, text: 'このランキングは？' }),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '今日 / 今週' }), el('span', { text: '・その日(その週)に解いた問題数。' })]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '累計' }), el('span', { text: '・これまでに解いた問題数の合計。' })]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '連続記録' }), el('span', { text: '・1問でも解いた日が何日続いているか。' })]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '正解率' }), el('span', { text: `・累計の正解数÷解答数。${MIN_ANSWERED_FOR_ACCURACY}問以上 解いた人が対象。` })]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '期間指定' }), el('span', { text: `・好きな期間を選んで、その間に解いた問題数で比べる（直近${DAILY_RETENTION_DAYS}日分まで）。` })]),
  ]));

  if (!isFirebaseConfigured() || !state.settings.cloudEnabled) {
    wrap.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'em', text: '🔒' }),
      el('div', { style: { fontWeight: 700, marginTop: '8px' }, text: 'ランキング機能はオフです' }),
      el('div', { class: 'muted', text: '設定タブ → ランキングに参加 をオンにしてください' }),
    ]));
    return wrap;
  }

  const controls = el('div', { style: { padding: '8px 16px' } });
  wrap.appendChild(controls);
  const body = el('div');
  wrap.appendChild(body);

  let groups = [];

  function renderRangePicker() {
    const r = loadRange();
    const min = oldestAvailable();
    const max = todayString();

    const startInput = el('input', { class: 'date-input', type: 'date', value: r.start, min, max });
    const endInput = el('input', { class: 'date-input', type: 'date', value: r.end, min, max });
    const presetList = presets();
    const presetBtns = presetList.map((ps) =>
      el('button', {
        class: 'chip',
        onclick: () => { setRange(ps.start, ps.end); },
        text: ps.label,
      }),
    );
    const note = el('div', { class: 'card-sub', style: { marginTop: '6px', display: 'none' } });

    // 入力欄は作り直さず値だけ更新する(スマホで続けて日付を選べるように)
    function syncUI(cur) {
      startInput.value = cur.start;
      endInput.value = cur.end;
      presetBtns.forEach((btn, i) => {
        const ps = presetList[i];
        btn.classList.toggle('active', cur.start === ps.start && cur.end === ps.end);
      });
      if (cur.start < min) {
        note.textContent = `※ 記録は直近${DAILY_RETENTION_DAYS}日分（${min.replace(/-/g, '/')}以降）まで集計されます。`;
        note.style.display = '';
      } else {
        note.style.display = 'none';
      }
    }
    function setRange(s, e) {
      if (s > e) [s, e] = [e, s];
      saveRange({ start: s, end: e });
      syncUI(range);
      load();
    }
    const onChange = () => setRange(startInput.value || range.start, endInput.value || range.end);
    startInput.addEventListener('change', onChange);
    endInput.addEventListener('change', onChange);

    const box = el('div', { class: 'range-box' }, [
      el('div', { class: 'range-row' }, [startInput, el('span', { class: 'range-sep', text: '〜' }), endInput]),
      el('div', { class: 'chip-row', style: { padding: '8px 0 0' } }, presetBtns),
      note,
    ]);
    syncUI(r);
    return box;
  }

  // 横スクロールするチップ行で、選択中のものを見える位置に寄せる
  function revealActiveChip(rowEl) {
    requestAnimationFrame(() => {
      const active = rowEl.querySelector('.chip.active');
      if (!active || rowEl.scrollWidth <= rowEl.clientWidth) return;
      const target = active.offsetLeft - (rowEl.clientWidth - active.offsetWidth) / 2;
      rowEl.scrollLeft = Math.max(0, target);
    });
  }

  function renderControls() {
    controls.innerHTML = '';
    controls.appendChild(el('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } }, [
      el('button', { class: 'chip' + (scope === 'global' ? ' active' : ''), style: { flex: 1, justifyContent: 'center' }, onclick: () => { scope = 'global'; renderControls(); load(); }, text: '🌐 全体' }),
      el('button', {
        class: 'chip' + (scope === 'group' ? ' active' : ''), style: { flex: 1, justifyContent: 'center' },
        disabled: groups.length === 0,
        onclick: () => { if (groups.length) { scope = 'group'; renderControls(); load(); } },
        text: groups.length === 0 ? '👥 未参加' : groups.length === 1 ? `👥 ${groups[0].name}` : `👥 グループ(${groups.length})`,
      }),
    ]));
    const kindRow = el('div', { class: 'chip-row', style: { padding: '0 0 4px' } }, LEADERBOARD_TABS.map((t) =>
      el('button', { class: 'chip' + (kind === t.key ? ' active' : ''), onclick: () => { kind = t.key; renderControls(); load(); }, text: t.label }),
    ));
    controls.appendChild(kindRow);
    revealActiveChip(kindRow);
    if (scope === 'group' && groups.length > 1) {
      controls.appendChild(el('div', { class: 'chip-row', style: { padding: '4px 0' } }, groups.map((g) =>
        el('button', { class: 'chip' + ((selectedGroup ?? groups[0].code) === g.code ? ' active' : ''), onclick: () => { selectedGroup = g.code; load(); }, text: g.name }),
      )));
    }
    if (kind === RANGE_KIND) controls.appendChild(renderRangePicker());
  }

  // タブを続けて切り替えたとき、遅れて届いた古い応答で上書きしないようにする
  let loadToken = 0;

  async function load() {
    const token = ++loadToken;
    body.innerHTML = '<div class="empty">読み込み中…</div>';
    const suffix = LEADERBOARD_TABS.find((t) => t.key === kind)?.suffix ?? '';
    const isRange = kind === RANGE_KIND;
    const r = loadRange();
    try {
      const target = scope === 'group'
        ? (selectedGroup && groups.some((g) => g.code === selectedGroup) ? selectedGroup : groups[0]?.code)
        : null;
      const inGroup = scope === 'group' && target;
      const rows = inGroup
        ? (isRange ? await fetchGroupRangeLeaderboard(target, r.start, r.end) : await fetchGroupLeaderboard(target, kind))
        : (isRange ? await fetchRangeLeaderboard(r.start, r.end) : await fetchLeaderboard(kind));
      const myEntry = inGroup ? null : await fetchMyEntry(kind, r);
      if (token !== loadToken) return;
      const me = currentUid();
      body.innerHTML = '';

      if (isRange) {
        body.appendChild(el('div', { class: 'range-caption' }, [
          el('span', { text: `📅 ${fmtRange(r)}` }),
          el('span', { class: 'muted', text: `　${rows.length}人` }),
        ]));
      }

      if (rows.length === 0) {
        body.appendChild(el('div', { class: 'empty' }, [
          el('div', { class: 'em', text: '🫥' }),
          el('div', { style: { fontWeight: 700 }, text: isRange ? 'この期間に解いた人はいません' : 'まだ誰もいません' }),
          el('div', { class: 'muted', text: isRange ? '期間を変えてみてください' : '1問解いてみよう' }),
        ]));
        return;
      }
      const list = el('div', { class: 'list' });
      rows.forEach((e, i) => list.appendChild(row(e, i + 1, e.uid === me, suffix)));
      if (myEntry && !rows.some((e) => e.uid === me)) {
        list.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', margin: '12px 0 8px' }, text: 'あなたの順位（圏外）' }));
        list.appendChild(row(myEntry, null, true, suffix));
      }
      body.appendChild(list);
    } catch (e) {
      if (token !== loadToken) return;
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '📡' }), el('div', { style: { fontWeight: 700 }, text: '通信エラー' }), el('div', { class: 'muted', text: 'ネット接続を確認してください' })]));
    }
  }

  (async () => {
    groups = await getMyGroups().catch(() => []);
    renderControls();
    load();
  })();
  renderControls();
  body.innerHTML = '<div class="empty">読み込み中…</div>';
  return wrap;
}

function rankLabel(r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}.`; }
function row(e, rank, isMe, suffix) {
  return el('div', { class: 'lb-row' + (isMe ? ' me' : '') }, [
    el('div', { class: 'lb-rank' + (rank !== null && rank <= 3 ? ' top' : ''), text: rank === null ? '—' : rankLabel(rank) }),
    el('div', { class: 'lb-nick', text: e.nickname + (isMe ? '（あなた）' : '') }),
    el('div', { class: 'lb-val', text: `${e.value}${suffix}` }),
  ]);
}
