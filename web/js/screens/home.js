import { el, navigate } from '../ui.js';
import { state, refresh } from '../state.js';
import { TIER_COLOR, TIER_MARK } from '../theme.js';
import { buildLeitnerQuiz, questionsByIds, LEITNER_TITLE } from '../data.js';
import { clearResumeSession } from '../store.js';

function stickyNotes(tiers) {
  const total = tiers.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const notes = [];
  const cap = 8;
  let placed = 0;
  const tops = [30, 60, 92, 128, 165, 200];
  for (let t = 0; t < 5 && placed < cap; t++) {
    const n = Math.min(tiers[t] > 0 ? Math.max(1, Math.round((tiers[t] / total) * cap)) : 0, cap - placed);
    for (let k = 0; k < n && placed < cap; k++) {
      notes.push(el('span', {
        class: 'sticky',
        style: { background: TIER_COLOR[t], top: `${tops[placed % tops.length] + Math.floor(placed / tops.length) * 8}px`, width: `${18 + (placed % 3) * 6}px` },
      }));
      placed++;
    }
  }
  return notes;
}

export function HomeScreen() {
  const { shelf, srState, resume, smallTestCount, wrongCounts } = state;
  const dueCount = shelf.dueCount;
  const wrap = el('div');

  wrap.appendChild(el('div', { class: 'page-title', text: 'スパイラル英文法' }));

  if (resume) {
    wrap.appendChild(el('div', { class: 'card tap', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('div', {
        class: 'grow', onclick: () => {
          const qs = questionsByIds(resume.questionIds);
          if (!qs.length) return;
          navigate('quiz', { questions: qs, title: resume.title, source: resume.source, resumable: true, fromResume: true });
        },
      }, [
        el('div', { class: 'card-title', html: '▶ つづきから' }),
        el('div', { class: 'card-sub', text: `${resume.title}・残り${resume.questionIds.length}問` }),
      ]),
      el('button', {
        class: 'icon-btn', text: '✕',
        onclick: async () => { await clearResumeSession(); await refresh(); },
      }),
    ]));
  }

  // 本 + 付箋
  const book = el('div', { class: 'book' }, [
    el('span', { class: 'band', text: '大学受験 改訂版' }),
    el('span', { class: 'eng', text: 'ENGLISH GRAMMAR' }),
    el('span', { class: 'spiral', text: '🌀' }),
    el('span', { class: 'jp', text: '英文法' }),
    el('span', { class: 'count', text: '全3,767問 収録' }),
    ...stickyNotes(shelf.tiers),
  ]);
  book.addEventListener('click', () => navigate('stickyList', {}));
  wrap.appendChild(el('div', { class: 'book-wrap' }, [
    book,
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' }, text: '📖 本をタップすると付箋のついた問題が見れるよ' }),
    el('div', { class: 'tier-legend' }, TIER_MARK.map((m, i) =>
      el('span', { class: 't', style: { color: TIER_COLOR[i] } }, [
        el('span', { class: 'dot', style: { background: TIER_COLOR[i] } }),
        el('span', { text: `${m}${shelf.tiers[i]}` }),
      ]),
    )),
  ]));

  // 付箋をはがしにいく
  const reviewBtn = el('button', {
    class: 'btn', style: { margin: '8px 16px', width: 'calc(100% - 32px)' },
    disabled: dueCount === 0,
    onclick: () => {
      const qs = buildLeitnerQuiz(srState);
      if (!qs.length) return;
      navigate('quiz', { questions: qs, title: LEITNER_TITLE, source: { kind: 'leitner' } });
    },
  }, [el('span', { html: `🩹 付箋をはがしにいく　${dueCount}問` })]);
  wrap.appendChild(reviewBtn);

  // 分野から解く / 小テストを作る
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '8px 16px' } }, [
    el('button', { class: 'card tap', style: { margin: 0, textAlign: 'left', border: '2px solid var(--primary)', borderBottomWidth: '5px' }, onclick: () => navigate('topicPicker', {}) }, [
      el('div', { style: { fontSize: '28px' }, text: '📗' }),
      el('div', { class: 'card-title', style: { color: 'var(--primary-dark)' }, text: '分野から解く' }),
      el('div', { class: 'card-sub', text: '分野・トピック →' }),
    ]),
    el('button', { class: 'card tap', style: { margin: 0, textAlign: 'left', border: '2px solid var(--test)', borderBottomWidth: '5px' }, onclick: () => navigate('smallTests', {}) }, [
      el('div', { style: { fontSize: '28px' }, text: '📝' }),
      el('div', { class: 'card-title', style: { color: 'var(--test-dark)' }, text: '小テストを作る' }),
      el('div', { class: 'card-sub', text: `保存済み ${smallTestCount}件` }),
    ]),
  ]);
  wrap.appendChild(grid);

  const row2 = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '4px 16px 8px' } }, [
    el('button', { class: 'chip', style: { justifyContent: 'center', padding: '14px' }, onclick: () => navigate('search', {}) }, [el('span', { text: '🔎 検索' })]),
    el('button', { class: 'chip', style: { justifyContent: 'center', padding: '14px' }, onclick: () => navigate('stickyList', { bookmarkOnly: true }) }, [el('span', { text: '⭐ ブックマーク' })]),
  ]);
  wrap.appendChild(row2);

  // 間違えた問題
  const wrongN = wrongCounts.size;
  wrap.appendChild(el('button', {
    class: 'card tap', style: { width: 'calc(100% - 32px)', textAlign: 'left', border: '2px solid var(--wrong)', borderBottomWidth: '5px' },
    onclick: () => navigate('wrong', {}),
  }, [
    el('div', { class: 'row between' }, [
      el('div', [
        el('div', { class: 'card-title', style: { color: 'var(--wrong)' }, text: '❌ 間違えた問題' }),
        el('div', { class: 'card-sub', text: `${wrongN}問たまっています` }),
      ]),
      el('div', { style: { fontSize: '22px', color: 'var(--muted)' }, text: '›' }),
    ]),
  ]));

  wrap.appendChild(el('div', { style: { height: '24px' } }));
  return wrap;
}
