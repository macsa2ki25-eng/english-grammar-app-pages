import { el, render } from '../ui.js';
import { state, updateSettings, refresh, reloadHelpRequests } from '../state.js';
import { clearStudyData } from '../store.js';
import {
  isFirebaseConfigured, MAX_GROUPS, ensureAnonUser, getCloudProfile,
  setNickname, createGroup, joinGroup, leaveGroup, getMyGroups,
} from '../cloud.js';

const FONT_OPTIONS = [['0.9', '小'], ['1', '中'], ['1.15', '大'], ['1.3', '特大']];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

function toggleRow(title, sub, value, onChange) {
  const t = el('button', { class: 'toggle' + (value ? ' on' : ''), onclick: () => onChange(!value) });
  return el('div', { class: 'row between', style: { padding: '12px 0' } }, [
    el('div', { class: 'grow' }, [el('div', { style: { fontWeight: 700 }, text: title }), sub ? el('div', { class: 'card-sub', text: sub }) : null]),
    t,
  ]);
}

export function SettingsScreen() {
  const s = state.settings;
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'page-title', text: '⚙️ 設定' }));

  const set = (patch) => updateSettings({ ...state.settings, ...patch }).then(() => render());

  // 学習
  wrap.appendChild(el('div', { class: 'section-label', text: '学習' }));
  const learn = el('div', { class: 'card' });
  learn.appendChild(toggleRow('間違えたらもう一度', '不正解時に再度解く', s.retryOnWrong, (v) => set({ retryOnWrong: v })));
  learn.appendChild(divider());
  learn.appendChild(toggleRow('効果音', '正解・不正解・レベルアップ時に再生', s.soundEnabled, (v) => set({ soundEnabled: v })));
  learn.appendChild(divider());
  learn.appendChild(toggleRow('英文を自動で読み上げ', '問題が変わるたびに英文を音声で再生', s.autoSpeak, (v) => set({ autoSpeak: v })));
  learn.appendChild(divider());
  learn.appendChild(toggleRow('バイブ（触覚）', '正解・不正解時に端末を振動', s.hapticsEnabled, (v) => set({ hapticsEnabled: v })));
  learn.appendChild(divider());
  learn.appendChild(el('div', { style: { paddingTop: '12px' } }, [
    el('div', { style: { fontWeight: 700, marginBottom: '8px' }, text: '文字サイズ' }),
    el('div', { class: 'row', style: { gap: '8px' } }, FONT_OPTIONS.map(([v, label]) =>
      el('button', { class: 'chip' + (String(s.fontScale) === v ? ' active' : ''), style: { flex: 1, justifyContent: 'center' }, onclick: () => set({ fontScale: Number(v) }), text: label }),
    )),
  ]));
  wrap.appendChild(learn);

  // 通知
  wrap.appendChild(el('div', { class: 'section-label', text: '通知' }));
  const notif = el('div', { class: 'card' });
  notif.appendChild(toggleRow('連続記録のリマインダー', '毎日決まった時刻に通知', s.notificationEnabled, async (v) => {
    if (v && 'Notification' in window && Notification.permission !== 'granted') {
      try { await Notification.requestPermission(); } catch {}
    }
    set({ notificationEnabled: v });
  }));
  if (s.notificationEnabled) {
    notif.appendChild(divider());
    notif.appendChild(el('div', { style: { paddingTop: '10px' } }, [
      el('div', { style: { fontWeight: 700, marginBottom: '8px' }, text: '時刻' }),
      el('div', { class: 'chip-row', style: { padding: '0 0 4px' } }, HOURS.map((h) =>
        el('button', { class: 'chip' + (s.notificationHour === h ? ' active' : ''), onclick: () => set({ notificationHour: h }), text: `${h}:00` }),
      )),
      el('div', { class: 'card-sub', text: '※ ブラウザ版は端末やOSにより通知が届かない場合があります。ホーム画面に追加すると届きやすくなります。' }),
    ]));
  }
  wrap.appendChild(notif);

  // ランキング
  wrap.appendChild(el('div', { class: 'section-label', text: 'ランキング（クラウド）' }));
  const cloud = el('div', { class: 'card' });
  cloud.appendChild(toggleRow('ランキングに参加', isFirebaseConfigured() ? '匿名IDで今日の問題数・連続記録・正解率を共有' : '設定が必要', s.cloudEnabled, async (v) => {
    if (v) {
      const u = await ensureAnonUser().catch(() => null);
      if (!u) { alert('クラウドに接続できません。ネット接続を確認してください。'); return; }
    }
    await updateSettings({ ...state.settings, cloudEnabled: v });
    reloadHelpRequests();
    render();
  }));
  if (s.cloudEnabled) {
    const cloudBody = el('div');
    cloud.appendChild(cloudBody);
    renderCloudBody(cloudBody);
  }
  wrap.appendChild(cloud);

  // データ
  wrap.appendChild(el('div', { class: 'section-label', text: 'データ' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('button', { class: 'btn secondary', style: { color: 'var(--wrong)', borderColor: 'var(--wrong)' }, onclick: async () => {
      if (!confirm('解答履歴と付箋の進捗をすべて消します。元に戻せません。')) return;
      await clearStudyData(); await refresh(); render();
    }, text: '学習データをクリア' }),
  ]));

  // アプリについて
  wrap.appendChild(el('div', { class: 'section-label', text: 'このアプリ' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'card-sub', text: 'スパイラル英文法 Web版 v1.2' }),
    el('div', { class: 'card-sub', style: { marginTop: '6px' }, text: 'ブラウザのメニューから「ホーム画面に追加」すると、アプリのように使えてオフラインでも動きます。' }),
  ]));

  wrap.appendChild(el('div', { class: 'section-label', text: '先生用' }));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('a', { href: './teacher.html', style: { textDecoration: 'none' } }, [
      el('div', { class: 'btn secondary', text: '🧑‍🏫 補習リクエスト一覧（先生用）' }),
    ]),
    el('div', { class: 'card-sub', style: { marginTop: '8px' }, text: '生徒が「補習で解説してほしい」を押した問題の一覧・印刷ページです（パスコードあり）。' }),
  ]));

  wrap.appendChild(el('div', { style: { height: '24px' } }));
  return wrap;
}

function divider() { return el('div', { style: { height: '1px', background: 'var(--border)' } }); }

async function renderCloudBody(node) {
  node.appendChild(divider());
  const profile = await getCloudProfile().catch(() => null);
  const nick = profile?.nickname ?? '';
  const nickInput = el('input', { class: 'input', value: nick, maxlength: '16', placeholder: 'ニックネーム(2〜16文字)' });
  node.appendChild(el('div', { style: { paddingTop: '12px' } }, [
    el('div', { style: { fontWeight: 700, marginBottom: '8px' }, text: 'ニックネーム' }),
    el('div', { class: 'row', style: { gap: '8px' } }, [
      nickInput,
      el('button', { class: 'btn', style: { width: 'auto', padding: '10px 16px' }, onclick: async () => {
        const v = nickInput.value.trim();
        if (v.length < 2 || v.length > 16) { alert('2〜16文字で入力してください'); return; }
        const ok = await setNickname(v).catch(() => false);
        alert(ok ? '保存しました' : '保存に失敗しました');
      }, text: '保存' }),
    ]),
  ]));

  node.appendChild(divider());
  node.appendChild(el('div', { style: { paddingTop: '12px', fontWeight: 700 }, text: 'グループ' }));
  const groupsWrap = el('div');
  node.appendChild(groupsWrap);
  await renderGroups(groupsWrap);
}

async function renderGroups(node) {
  node.innerHTML = '';
  node.appendChild(el('div', { class: 'card-sub', text: '読み込み中…' }));
  const groups = await getMyGroups().catch(() => []);
  node.innerHTML = '';
  for (const g of groups) {
    node.appendChild(el('div', { class: 'row between', style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } }, [
      el('div', [el('div', { style: { fontWeight: 700 }, text: g.name }), el('div', { class: 'card-sub', text: `コード ${g.code}・${g.memberCount}人` })]),
      el('button', { class: 'chip', style: { color: 'var(--wrong)', borderColor: 'var(--wrong)' }, onclick: async () => {
        if (!confirm(`「${g.name}」から抜けますか？`)) return;
        await leaveGroup(g.code).catch(() => {});
        await renderGroups(node);
      }, text: '抜ける' }),
    ]));
  }
  if (groups.length >= MAX_GROUPS) {
    node.appendChild(el('div', { class: 'card-sub', style: { paddingTop: '8px' }, text: `参加できるグループは最大${MAX_GROUPS}つまでです` }));
    return;
  }
  const nameIn = el('input', { class: 'input', maxlength: '20', placeholder: 'グループ名(1〜20文字)' });
  const codeIn = el('input', { class: 'input', maxlength: '5', inputmode: 'numeric', placeholder: '5桁コード' });
  node.appendChild(el('div', { style: { paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' } }, [
    el('div', { class: 'row', style: { gap: '8px' } }, [nameIn, el('button', { class: 'btn', style: { width: 'auto', padding: '10px 14px' }, onclick: async () => {
      const g = await createGroup(nameIn.value).catch(() => null);
      if (!g) { alert('作成に失敗しました'); return; }
      alert(`作成しました\nコード: ${g.code}\n友達にこのコードを伝えてね`);
      await renderGroups(node);
    }, text: '作成' })]),
    el('div', { class: 'row', style: { gap: '8px' } }, [codeIn, el('button', { class: 'btn secondary', style: { width: 'auto', padding: '10px 14px' }, onclick: async () => {
      const g = await joinGroup(codeIn.value).catch(() => null);
      if (!g) { alert('参加に失敗しました。コードを確認してください'); return; }
      await renderGroups(node);
    }, text: '参加' })]),
  ]));
}
