// 効果音・触覚・読み上げ。src/sound.ts / haptic.ts / speech.ts の移植。
import { state } from './state.js';

const SOURCES = {
  correct: './sounds/correct.mp3',
  wrong: './sounds/wrong.mp3',
  levelup: './sounds/levelup.mp3',
};
const players = {};

export function initAudio() {
  for (const key of Object.keys(SOURCES)) {
    try {
      const a = new Audio(SOURCES[key]);
      a.preload = 'auto';
      a.volume = 1;
      players[key] = a;
    } catch {}
  }
}

function play(key) {
  if (!state.settings?.soundEnabled) return;
  const a = players[key];
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch {}
}
export function playCorrect() { play('correct'); }
export function playWrong() { play('wrong'); }
export function playLevelUp() { play('levelup'); }

function vibrate(pattern) {
  if (!state.settings?.hapticsEnabled) return;
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch {} }
}
export function hapticLight() { vibrate(10); }
export function hapticSuccess() { vibrate([0, 30, 40, 30]); }
export function hapticError() { vibrate([0, 60, 40, 60]); }
export function hapticWarning() { vibrate(40); }
export function hapticHeavy() { vibrate([0, 50, 30, 50, 30, 80]); }

// 読み上げ(Web Speech API)。空所()は読み飛ばす。
export function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  const clean = text.replace(/[（(][\s　]*[)）]/g, ' blank ').replace(/[　]+/g, ' ');
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {}
}
