// src/streak.ts の移植。
import { localDateString } from './store.js';

function previousDay(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return localDateString(date);
}

export function computeStreak(activeDays, today = localDateString()) {
  const todayActive = activeDays.has(today);
  let cursor = todayActive ? today : previousDay(today);
  if (!activeDays.has(cursor)) return { days: 0, todayActive };
  let count = 0;
  while (activeDays.has(cursor)) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return { days: count, todayActive };
}

export function longestStreak(activeDays) {
  if (activeDays.size === 0) return 0;
  const sorted = [...activeDays].sort();
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (previousDay(sorted[i]) === sorted[i - 1]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

export function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  return localDateString(dt);
}
