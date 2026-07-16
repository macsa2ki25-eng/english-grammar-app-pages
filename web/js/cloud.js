// Firebase(ランキング/グループ)。src/cloud/*.ts の移植。
// iOS版と同じ Firestore を共有する(スキーマ完全一致)。
// Firebase CDN が読めない環境では静かに無効化される。
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDA9mAynci7ARaFADocQiuTns2PIrVRVGo',
  authDomain: 'english-grammar-app-20e06.firebaseapp.com',
  projectId: 'english-grammar-app-20e06',
  storageBucket: 'english-grammar-app-20e06.firebasestorage.app',
  messagingSenderId: '887200503682',
  appId: '1:887200503682:web:7c35d3edda73088cc1619b',
};

const V = '12.0.0';
export const MAX_GROUPS = 3;
export const MIN_ANSWERED_FOR_ACCURACY = 10;
export const LEADERBOARD_TABS = [
  { key: 'todayCount', label: '今日', suffix: '問' },
  { key: 'weekCount', label: '今週', suffix: '問' },
  { key: 'streak', label: '連続記録', suffix: '日' },
  { key: 'accuracy', label: '正解率', suffix: '%' },
];

export function isFirebaseConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

let fb = null;
let initErr = false;

async function ensureFb() {
  if (fb) return fb;
  if (initErr) return null;
  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
    const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    fb = { app, auth, db, authMod, fsMod };
    return fb;
  } catch (e) {
    console.warn('[cloud] Firebase 初期化に失敗(オフラインまたはCDN不可):', e);
    initErr = true;
    return null;
  }
}

let uidCache = null;
export function currentUid() { return uidCache; }

export async function ensureAnonUser() {
  const f = await ensureFb();
  if (!f) return null;
  if (f.auth.currentUser) { uidCache = f.auth.currentUser.uid; return f.auth.currentUser; }
  const cred = await f.authMod.signInAnonymously(f.auth);
  uidCache = cred.user.uid;
  return cred.user;
}

function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function todayStr() {
  const d = new Date();
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getCloudProfile() {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return null;
  const { doc, getDoc } = f.fsMod;
  const snap = await getDoc(doc(f.db, 'users', user.uid));
  if (!snap.exists()) return { uid: user.uid, nickname: '' };
  const data = snap.data();
  return {
    uid: user.uid,
    nickname: data.nickname ?? '',
    todayCount: data.todayCount ?? 0, todayDate: data.todayDate ?? '',
    weekCount: data.weekCount ?? 0, weekStart: data.weekStart ?? '',
    streak: data.streak ?? 0, accuracy: data.accuracy ?? 0,
    lifetimeAnswered: data.lifetimeAnswered ?? 0,
  };
}

export async function setNickname(nickname) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return false;
  const { doc, setDoc, serverTimestamp } = f.fsMod;
  await setDoc(doc(f.db, 'users', user.uid),
    { nickname: nickname.trim(), updatedAt: serverTimestamp() }, { merge: true });
  return true;
}

export async function pushStats(stats) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return false;
  const { doc, setDoc, serverTimestamp } = f.fsMod;
  const today = todayStr();
  await setDoc(doc(f.db, 'users', user.uid), {
    todayCount: stats.todayCount, todayDate: today,
    weekCount: stats.weekCount, weekStart: mondayOf(today),
    streak: stats.streak, accuracy: stats.accuracy,
    lifetimeAnswered: stats.lifetimeAnswered, updatedAt: serverTimestamp(),
  }, { merge: true });
  return true;
}

export async function fetchMyEntry(kind) {
  const p = await getCloudProfile();
  if (!p || !p.nickname) return null;
  const today = todayStr();
  const week = mondayOf(today);
  let value;
  if (kind === 'todayCount') value = p.todayDate === today ? p.todayCount : 0;
  else if (kind === 'weekCount') value = p.weekStart === week ? p.weekCount : 0;
  else if (kind === 'accuracy') value = p.accuracy;
  else value = p.streak;
  return { uid: p.uid, nickname: p.nickname, value };
}

export async function fetchLeaderboard(kind, topN = 50) {
  const f = await ensureFb();
  if (!f) return [];
  const { collection, query, orderBy, limit, getDocs } = f.fsMod;
  const today = todayStr();
  const week = mondayOf(today);
  const fetchN = kind === 'accuracy' ? 200 : topN;
  const snap = await getDocs(query(collection(f.db, 'users'), orderBy(kind, 'desc'), limit(fetchN)));
  const rows = [];
  snap.forEach((d) => {
    const data = d.data();
    if (!data.nickname) return;
    if (kind === 'weekCount' && data.weekStart !== week) return;
    if (kind === 'todayCount' && data.todayDate !== today) return;
    if (kind === 'accuracy' && (data.lifetimeAnswered ?? 0) < MIN_ANSWERED_FOR_ACCURACY) return;
    rows.push({ uid: d.id, nickname: data.nickname, value: data[kind] ?? 0 });
  });
  return rows.slice(0, topN);
}

// ── グループ ──
function genCode() { return String(Math.floor(10000 + Math.random() * 90000)); }

async function readMyCodes(f, uid) {
  const { doc, getDoc } = f.fsMod;
  const snap = await getDoc(doc(f.db, 'users', uid));
  if (!snap.exists()) return [];
  const data = snap.data();
  const set = new Set();
  if (Array.isArray(data.groupCodes)) for (const c of data.groupCodes) if (typeof c === 'string') set.add(c);
  if (typeof data.groupCode === 'string') set.add(data.groupCode);
  return [...set];
}

async function countMembers(f, code) {
  const { collection, query, where, getDocs } = f.fsMod;
  const ids = new Set();
  try {
    (await getDocs(query(collection(f.db, 'users'), where('groupCodes', 'array-contains', code)))).forEach((d) => ids.add(d.id));
  } catch {}
  try {
    (await getDocs(query(collection(f.db, 'users'), where('groupCode', '==', code)))).forEach((d) => ids.add(d.id));
  } catch {}
  return ids.size;
}

export async function createGroup(name) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return null;
  const { doc, getDoc, setDoc, serverTimestamp, arrayUnion } = f.fsMod;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 20) return null;
  if ((await readMyCodes(f, user.uid)).length >= MAX_GROUPS) return null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = genCode();
    const ref = doc(f.db, 'groups', code);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { name: trimmed, createdBy: user.uid, createdAt: serverTimestamp() });
    await setDoc(doc(f.db, 'users', user.uid),
      { groupCodes: arrayUnion(code), updatedAt: serverTimestamp() }, { merge: true });
    return { code, name: trimmed, memberCount: 1 };
  }
  return null;
}

export async function joinGroup(code) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return null;
  const { doc, getDoc, setDoc, serverTimestamp, arrayUnion } = f.fsMod;
  const c = code.trim();
  if (!/^\d{5}$/.test(c)) return null;
  const snap = await getDoc(doc(f.db, 'groups', c));
  if (!snap.exists()) return null;
  const myCodes = await readMyCodes(f, user.uid);
  if (myCodes.includes(c)) return { code: c, name: snap.data().name ?? '', memberCount: await countMembers(f, c) };
  if (myCodes.length >= MAX_GROUPS) return null;
  await setDoc(doc(f.db, 'users', user.uid),
    { groupCodes: arrayUnion(c), updatedAt: serverTimestamp() }, { merge: true });
  return { code: c, name: snap.data().name ?? '', memberCount: await countMembers(f, c) };
}

export async function leaveGroup(code) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return false;
  const { doc, getDoc, updateDoc, serverTimestamp, arrayRemove } = f.fsMod;
  const update = { updatedAt: serverTimestamp() };
  if (code) {
    update.groupCodes = arrayRemove(code);
    const snap = await getDoc(doc(f.db, 'users', user.uid));
    if (snap.exists() && snap.data().groupCode === code) update.groupCode = null;
  } else {
    update.groupCodes = []; update.groupCode = null;
  }
  await updateDoc(doc(f.db, 'users', user.uid), update);
  return true;
}

export async function getMyGroups() {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return [];
  const { doc, getDoc } = f.fsMod;
  const codes = await readMyCodes(f, user.uid);
  const groups = [];
  for (const code of codes) {
    try {
      const gs = await getDoc(doc(f.db, 'groups', code));
      if (!gs.exists()) continue;
      groups.push({ code, name: gs.data().name ?? '', memberCount: await countMembers(f, code) });
    } catch {}
  }
  return groups;
}

export async function fetchGroupLeaderboard(code, kind, topN = 50) {
  const f = await ensureFb();
  if (!f) return [];
  const { collection, query, where, getDocs } = f.fsMod;
  const today = todayStr();
  const week = mondayOf(today);
  const collected = new Map();
  const queries = [
    query(collection(f.db, 'users'), where('groupCodes', 'array-contains', code)),
    query(collection(f.db, 'users'), where('groupCode', '==', code)),
  ];
  for (const q of queries) {
    try {
      (await getDocs(q)).forEach((d) => {
        if (collected.has(d.id)) return;
        const data = d.data();
        if (!data.nickname) return;
        if (kind === 'weekCount' && data.weekStart !== week) return;
        if (kind === 'todayCount' && data.todayDate !== today) return;
        if (kind === 'accuracy' && (data.lifetimeAnswered ?? 0) < MIN_ANSWERED_FOR_ACCURACY) return;
        collected.set(d.id, { uid: d.id, nickname: data.nickname, value: data[kind] ?? 0 });
      });
    } catch {}
  }
  return [...collected.values()].sort((a, b) => b.value - a.value).slice(0, topN);
}

// ── 補習リクエスト(Web版限定) ──
// helpRequests/{uid}_{questionId}: { questionId, uid, nickname, groupCodes, handled, createdAt }
export async function getMyHelpRequests() {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return new Set();
  const { collection, query, where, getDocs } = f.fsMod;
  const ids = new Set();
  try {
    (await getDocs(query(collection(f.db, 'helpRequests'), where('uid', '==', user.uid)))).forEach((d) => {
      const data = d.data();
      if (data.questionId) ids.add(data.questionId);
    });
  } catch {}
  return ids;
}

export async function requestHelp(questionId) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return { ok: false, reason: 'offline' };
  const profile = await getCloudProfile();
  const nickname = profile?.nickname?.trim();
  if (!nickname) return { ok: false, reason: 'no-nickname' };
  const { doc, setDoc, serverTimestamp } = f.fsMod;
  const codes = await readMyCodes(f, user.uid);
  await setDoc(doc(f.db, 'helpRequests', `${user.uid}_${questionId}`), {
    questionId, uid: user.uid, nickname, groupCodes: codes,
    handled: false, createdAt: serverTimestamp(),
  });
  return { ok: true };
}

export async function cancelHelp(questionId) {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return false;
  const { doc, deleteDoc } = f.fsMod;
  await deleteDoc(doc(f.db, 'helpRequests', `${user.uid}_${questionId}`));
  return true;
}

// 先生用: 全リクエストを取得
export async function listHelpRequests() {
  const f = await ensureFb();
  const user = await ensureAnonUser();
  if (!f || !user) return [];
  const { collection, getDocs } = f.fsMod;
  const out = [];
  (await getDocs(collection(f.db, 'helpRequests'))).forEach((d) => {
    const data = d.data();
    out.push({
      id: d.id, questionId: data.questionId, uid: data.uid,
      nickname: data.nickname ?? '匿名', groupCodes: data.groupCodes ?? [],
      handled: !!data.handled, createdAt: data.createdAt?.toMillis?.() ?? 0,
    });
  });
  return out;
}

export async function markHelpHandled(id, handled) {
  const f = await ensureFb();
  await ensureAnonUser();
  if (!f) return false;
  const { doc, updateDoc } = f.fsMod;
  await updateDoc(doc(f.db, 'helpRequests', id), { handled });
  return true;
}
