// 軽量DOMヘルパとルーター。
export function el(tag, props = {}, children = []) {
  // 2引数形 el(tag, children) をサポート: 第2引数が配列/ノード/文字列なら子要素扱い
  if (Array.isArray(props) || props instanceof Node || typeof props === 'string') {
    children = props;
    props = {};
  }
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

// 空所「(　　　)」を下線ボックスに。src/components/QuestionText の移植。
export function renderQuestionText(text) {
  const span = document.createElement('span');
  const parts = String(text ?? '').split(/([（(][\s　]*[)）])/);
  for (const part of parts) {
    if (/^[（(][\s　]*[)）]$/.test(part)) {
      const blank = document.createElement('span');
      blank.className = 'blank';
      blank.textContent = '　　　';
      span.appendChild(blank);
    } else if (part) {
      span.appendChild(document.createTextNode(part));
    }
  }
  return span;
}

// ── ルーター(タブ + スタック) ──
const TABS = ['solve', 'trail', 'settings'];
const stacks = { solve: [], trail: [], settings: [] };
let activeTab = 'solve';
const registry = new Map();
let rootEl = null;
let onChange = () => {};

export function registerScreen(name, renderFn) { registry.set(name, renderFn); }
export function setRouterRoot(node, changeCb) { rootEl = node; onChange = changeCb || (() => {}); }

export function currentTab() { return activeTab; }
export function currentScreen() {
  const st = stacks[activeTab];
  return st.length ? st[st.length - 1] : { name: tabRoot(activeTab), params: {} };
}
function tabRoot(tab) {
  return tab === 'solve' ? 'home' : tab === 'trail' ? 'trail' : 'settings';
}

export function switchTab(tab) {
  if (!TABS.includes(tab)) return;
  activeTab = tab;
  render();
}
export function navigate(name, params = {}) {
  stacks[activeTab].push({ name, params });
  render();
}
export function replace(name, params = {}) {
  const st = stacks[activeTab];
  if (st.length) st[st.length - 1] = { name, params };
  else st.push({ name, params });
  render();
}
export function goBack() {
  const st = stacks[activeTab];
  if (st.length) { st.pop(); render(); return true; }
  return false;
}
export function resetTabToRoot(tab = activeTab) { stacks[tab] = []; }
export function canGoBack() { return stacks[activeTab].length > 0; }

export function render() {
  if (!rootEl) return;
  const cur = currentScreen();
  // クイズ中は下部タブバーを隠す(解説パネルのボタンが隠れないように)
  document.body.dataset.screen = cur.name;
  const fn = registry.get(cur.name);
  rootEl.innerHTML = '';
  rootEl.scrollTop = 0;
  if (fn) {
    try { rootEl.appendChild(fn(cur.params)); }
    catch (e) { console.error('[render]', cur.name, e); rootEl.appendChild(el('div', { class: 'pad', text: '画面の表示に失敗しました。' })); }
  }
  onChange();
}
