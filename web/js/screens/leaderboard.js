import { el, goBack } from '../ui.js';
import { state } from '../state.js';
import {
  isFirebaseConfigured, LEADERBOARD_TABS, MIN_ANSWERED_FOR_ACCURACY,
  currentUid, fetchLeaderboard, fetchMyEntry, fetchGroupLeaderboard, getMyGroups,
} from '../cloud.js';

let kind = 'todayCount';
let scope = 'global';
let selectedGroup = null;

export function LeaderboardScreen() {
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'appbar' }, [
    el('button', { class: 'back', text: '‹', onclick: () => goBack() }),
    el('div', { class: 'title', text: '🏆 ランキング' }),
  ]));

  wrap.appendChild(el('div', { class: 'info-card' }, [
    el('div', { style: { fontWeight: 900, color: 'var(--primary-dark)', marginBottom: '6px', letterSpacing: '1px', fontSize: '13px' }, text: 'このランキングは？' }),
    el('div', { class: 'it' }, [
      el('span', { class: 'bold', text: '今日 / 今週' }), el('span', { text: '・その日(その週)に解いた問題数。' }),
    ]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '連続記録' }), el('span', { text: '・1問でも解いた日が何日続いているか。' })]),
    el('div', { class: 'it' }, [el('span', { class: 'bold', text: '正解率' }), el('span', { text: `・累計の正解数÷解答数。${MIN_ANSWERED_FOR_ACCURACY}問以上 解いた人が対象。` })]),
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
    controls.appendChild(el('div', { class: 'chip-row', style: { padding: '0 0 4px' } }, LEADERBOARD_TABS.map((t) =>
      el('button', { class: 'chip' + (kind === t.key ? ' active' : ''), onclick: () => { kind = t.key; renderControls(); load(); }, text: t.label }),
    )));
    if (scope === 'group' && groups.length > 1) {
      controls.appendChild(el('div', { class: 'chip-row', style: { padding: '4px 0' } }, groups.map((g) =>
        el('button', { class: 'chip' + ((selectedGroup ?? groups[0].code) === g.code ? ' active' : ''), onclick: () => { selectedGroup = g.code; load(); }, text: g.name }),
      )));
    }
  }

  async function load() {
    body.innerHTML = '<div class="empty">読み込み中…</div>';
    const suffix = LEADERBOARD_TABS.find((t) => t.key === kind)?.suffix ?? '';
    try {
      const target = scope === 'group'
        ? (selectedGroup && groups.some((g) => g.code === selectedGroup) ? selectedGroup : groups[0]?.code)
        : null;
      const inGroup = scope === 'group' && target;
      const rows = inGroup ? await fetchGroupLeaderboard(target, kind) : await fetchLeaderboard(kind);
      const myEntry = inGroup ? null : await fetchMyEntry(kind);
      const me = currentUid();
      body.innerHTML = '';
      if (rows.length === 0) {
        body.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'em', text: '🫥' }), el('div', { style: { fontWeight: 700 }, text: 'まだ誰もいません' }), el('div', { class: 'muted', text: '1問解いてみよう' })]));
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
