import { el, navigate } from '../ui.js';
import { state } from '../state.js';
import { tier1CountsByLarge } from '../data.js';
import { longestStreak } from '../streak.js';
import { isFirebaseConfigured } from '../cloud.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
function pad(n) { return n < 10 ? `0${n}` : String(n); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

let viewMonth = null;

export function TrailScreen() {
  const { streak, daily, lifetime, categoryStats, srState, settings } = state;
  const today = new Date();
  if (!viewMonth) viewMonth = { year: today.getFullYear(), month: today.getMonth() };
  const todayStr = ymd(today);
  const wrap = el('div');

  wrap.appendChild(el('div', { class: 'page-title', text: '👣 あしあと' }));

  // さっきの問題
  wrap.appendChild(el('button', { class: 'card tap', style: { width: 'calc(100% - 32px)', textAlign: 'left', border: '2px solid var(--primary-dark)', borderBottomWidth: '4px' }, onclick: () => navigate('recent', {}) }, [
    el('div', { class: 'row between' }, [
      el('div', [el('div', { class: 'card-title', text: '🕒 さっきの問題' }), el('div', { class: 'card-sub', text: '直近解いた20問・最近詰まった問題TOP20' })]),
      el('div', { style: { fontSize: '22px', color: 'var(--muted)' }, text: '›' }),
    ]),
  ]));

  // 弱点ベスト3
  const tier1 = tier1CountsByLarge(srState);
  const weak = categoryStats.filter((c) => c.attempts > 0).map((c) => ({
    large: c.large, accuracy: c.accuracy, tier1: tier1.get(c.large) ?? 0,
    score: (tier1.get(c.large) ?? 0) * 1.5 + (1 - (c.accuracy ?? 0)) * Math.min(40, c.attempts),
  })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const weakCard = el('div', { class: 'card', style: { border: '2px solid var(--wrong)', borderBottomWidth: '4px' } }, [
    el('div', { class: 'row between' }, [
      el('div', { class: 'card-title', text: '📊 弱点ベスト3' }),
      el('button', { class: 'chip', style: { padding: '4px 10px' }, onclick: () => navigate('weakness', {}), text: 'すべて見る →' }),
    ]),
  ]);
  if (weak.length === 0) weakCard.appendChild(el('div', { class: 'card-sub', text: '少し解くと、ここに弱い分野が出てきます' }));
  else weak.forEach((r, i) => {
    const acc = r.accuracy != null ? `${Math.round(r.accuracy * 100)}%` : '—';
    weakCard.appendChild(el('div', { class: 'row between', style: { padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' } }, [
      el('div', { class: 'row', style: { gap: '10px' } }, [el('b', { style: { color: 'var(--wrong)' }, text: String(i + 1) }), el('span', { text: r.large })]),
      el('div', { class: 'row', style: { gap: '12px' } }, [
        el('span', { style: { color: 'var(--wrong)', fontWeight: 800, fontSize: '13px' }, text: `①${r.tier1}` }),
        el('span', { style: { fontWeight: 800 }, text: acc }),
      ]),
    ]));
  });
  wrap.appendChild(weakCard);

  // カレンダー + 連続記録 + 今日
  const best = longestStreak(new Set(daily.keys()));
  const streakAlert = streak.days > 0 && !streak.todayActive;
  const calCard = el('div', { class: 'card' });
  calCard.appendChild(el('div', { class: 'stat-row', style: { paddingBottom: '10px', borderBottom: '1px solid var(--border)', marginBottom: '8px' } }, [
    el('div', { class: 'stat-cell' }, [
      el('div', { class: 'k', text: '🔥 連続記録' }),
      el('div', { class: 'v', style: { color: streakAlert ? 'var(--wrong)' : 'var(--text)' } }, [el('span', { text: String(streak.days) }), el('small', { text: ` 日　最長${best}日` })]),
    ]),
    el('div', { class: 'divider-v' }),
    el('button', { class: 'stat-cell', style: { background: 'none', border: 'none', textAlign: 'left', padding: 0 }, onclick: () => navigate('todayAnswers', {}) }, [
      el('div', { class: 'k' }, [el('span', { text: '📝 今日　' }), el('span', { style: { color: 'var(--primary)' }, text: '一覧 →' })]),
      el('div', { class: 'v' }, [el('span', { text: String(daily.get(todayStr)?.answered ?? 0) }), el('small', { text: ' 問' })]),
    ]),
  ]));

  calCard.appendChild(el('div', { class: 'cal-head' }, [
    el('button', { text: '‹', onclick: () => { viewMonth = shiftMonth(viewMonth, -1); rerenderTrail(); } }),
    el('div', { style: { fontWeight: 800 }, text: `${viewMonth.year}年${viewMonth.month + 1}月` }),
    el('button', { text: '›', onclick: () => { viewMonth = shiftMonth(viewMonth, 1); rerenderTrail(); } }),
  ]));
  // 曜日ヘッダーも同じグリッドに入れて列を完全一致させる
  const grid = el('div', { class: 'cal-grid' });
  for (const w of WEEK) grid.appendChild(el('div', { class: 'cal-wcell', text: w }));
  for (const cell of buildCalendar(viewMonth.year, viewMonth.month)) {
    if (!cell.inMonth) { grid.appendChild(el('div', { class: 'cal-cell' })); continue; }
    const answered = daily.get(cell.date)?.answered ?? 0;
    const cls = 'cal-cell ' + (answered > 0 ? 'active' : 'empty') + (cell.date === todayStr ? ' today' : '');
    grid.appendChild(el('div', { class: cls }, [
      el('div', { class: 'n', text: String(cell.day) }),
      answered > 0 ? el('div', { class: 'a', text: `${answered}問` }) : null,
    ]));
  }
  calCard.appendChild(grid);
  wrap.appendChild(calCard);

  // ランキング
  const rankSub = !isFirebaseConfigured() ? '設定が必要'
    : !settings.cloudEnabled ? '設定タブで参加をオンに'
      : '今日/今週の問題数・連続記録・正解率';
  wrap.appendChild(el('button', {
    class: 'card tap', style: { width: 'calc(100% - 32px)', textAlign: 'left', background: 'var(--gold)', border: '2px solid #B45309', borderBottomWidth: '6px', color: '#fff' },
    onclick: () => navigate('leaderboard', {}),
  }, [
    el('div', { class: 'row between' }, [
      el('div', [el('div', { class: 'card-title', style: { color: '#fff' }, text: '🏆 ランキングを見る' }), el('div', { style: { color: '#FEF3C7', fontSize: '13px', marginTop: '3px' }, text: rankSub })]),
      el('div', { style: { fontSize: '22px', color: '#fff' }, text: '›' }),
    ]),
  ]));

  // 累計
  const pct = lifetime.answered > 0 ? Math.round((lifetime.correct / lifetime.answered) * 100) : null;
  wrap.appendChild(el('div', { class: 'section-label', text: '累計' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'stat-row' }, [
      el('div', { class: 'stat-cell' }, [el('div', { class: 'k', text: '解答数' }), el('div', { class: 'v', text: String(lifetime.answered) })]),
      el('div', { class: 'divider-v' }),
      el('div', { class: 'stat-cell' }, [el('div', { class: 'k', text: '正解数' }), el('div', { class: 'v', text: String(lifetime.correct) })]),
      el('div', { class: 'divider-v' }),
      el('div', { class: 'stat-cell' }, [el('div', { class: 'k', text: '正解率' }), el('div', { class: 'v', text: pct != null ? `${pct}%` : '—' })]),
    ]),
  ]));

  wrap.appendChild(el('div', { style: { height: '24px' } }));
  return wrap;
}

function shiftMonth(vm, delta) {
  const d = new Date(vm.year, vm.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
function buildCalendar(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ inMonth: false });
  for (let d = 1; d <= days; d++) cells.push({ inMonth: true, day: d, date: ymd(new Date(year, month, d)) });
  while (cells.length % 7 !== 0) cells.push({ inMonth: false });
  return cells;
}

// カレンダー月移動時だけ再描画(ルーターの現在画面を作り直す)
function rerenderTrail() {
  import('../ui.js').then((m) => m.render());
}
