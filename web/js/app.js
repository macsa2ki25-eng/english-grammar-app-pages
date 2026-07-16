import { loadData } from './data.js';
import { initState, state, subscribe } from './state.js';
import { initAudio } from './fx.js';
import {
  el, registerScreen, setRouterRoot, render, switchTab, currentTab,
  currentScreen, goBack, canGoBack, navigate,
} from './ui.js';
import { HomeScreen } from './screens/home.js';
import { QuizScreen, ResultScreen } from './screens/quiz.js';
import { TrailScreen } from './screens/trail.js';
import { SettingsScreen } from './screens/settings.js';
import { LeaderboardScreen } from './screens/leaderboard.js';
import {
  TopicPickerScreen, SmallTestsScreen, SmallTestEditScreen, StickyListScreen,
  SearchScreen, WrongScreen, WeaknessScreen, TodayAnswersScreen, RecentScreen,
} from './screens/more.js';

registerScreen('home', HomeScreen);
registerScreen('quiz', QuizScreen);
registerScreen('result', ResultScreen);
registerScreen('trail', TrailScreen);
registerScreen('settings', SettingsScreen);
registerScreen('leaderboard', LeaderboardScreen);
registerScreen('topicPicker', TopicPickerScreen);
registerScreen('smallTests', SmallTestsScreen);
registerScreen('smallTestEdit', SmallTestEditScreen);
registerScreen('stickyList', StickyListScreen);
registerScreen('search', SearchScreen);
registerScreen('wrong', WrongScreen);
registerScreen('weakness', WeaknessScreen);
registerScreen('todayAnswers', TodayAnswersScreen);
registerScreen('recent', RecentScreen);

const TABS = [
  { key: 'solve', icon: '🎓', label: '解く' },
  { key: 'trail', icon: '👣', label: 'あしあと' },
  { key: 'settings', icon: '⚙️', label: '設定' },
];

let tabbar;
function buildTabbar() {
  tabbar = el('div', { id: 'tabbar' },
    TABS.map((t) =>
      el('button', {
        onclick: () => { switchTab(t.key); history.pushState({ n: depth() }, ''); },
        dataset: { tab: t.key },
      }, [el('span', { class: 'ic', text: t.icon }), el('span', { text: t.label })]),
    ),
  );
  return tabbar;
}
function syncTabbar() {
  if (!tabbar) return;
  for (const b of tabbar.children) {
    b.classList.toggle('active', b.dataset.tab === currentTab());
  }
  // フォントスケールをCSS変数へ
  document.documentElement.style.setProperty('--fs', String(state.settings?.fontScale ?? 1));
}

// Android 端末の戻るボタン対応
function depth() { return canGoBack() ? 1 : 0; }
window.addEventListener('popstate', () => {
  if (canGoBack()) {
    goBack();
    history.pushState({ n: depth() }, '');
  }
});
const origNavigate = navigate;

async function boot() {
  if ('serviceWorker' in navigator) {
    // updateViaCache:'none' で sw.js の更新チェックがHTTPキャッシュを無視する
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      // 起動のたびに更新チェック。新版があれば取り込む
      reg.update().catch(() => {});
    }).catch(() => {});
  }
  await loadData();
  await initState();
  initAudio();

  const root = document.getElementById('root');
  root.innerHTML = '';
  const app = el('div', { id: 'app' });
  root.appendChild(app);
  root.appendChild(buildTabbar());
  setRouterRoot(app, syncTabbar);
  history.replaceState({ n: 0 }, '');
  render();

  subscribe(() => {
    // 状態変化時、現在表示中の画面を必要に応じ再描画する画面もあるが、
    // 主要な再描画は各画面の操作ハンドラが render() を呼ぶ設計。
    syncTabbar();
  });
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('root').innerHTML =
    '<div class="pad">読み込みに失敗しました。ページを再読み込みしてください。<br><br>' + String(e) + '</div>';
});
