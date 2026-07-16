import { el } from './ui.js';
import { state, setHelpRequested } from './state.js';
import { requestHelp, cancelHelp, isFirebaseConfigured } from './cloud.js';

// 「補習で解説してほしい」ボタン。押すと Firebase に記録(先生が一覧で確認)。
export function helpButton(questionId, opts = {}) {
  const requested = state.helpRequestedIds.has(questionId);
  const btn = el('button', {
    class: 'btn secondary help-btn' + (requested ? ' requested' : ''),
    onclick: async () => {
      if (!isFirebaseConfigured() || !state.settings.cloudEnabled) {
        alert('この機能を使うには、設定タブで「ランキングに参加」をオンにして、ニックネームを登録してください。（先生が誰のリクエストか分かるようにするためです）');
        return;
      }
      btn.disabled = true;
      const already = state.helpRequestedIds.has(questionId);
      if (already) {
        await cancelHelp(questionId).catch(() => {});
        setHelpRequested(questionId, false);
      } else {
        const r = await requestHelp(questionId);
        if (!r.ok) {
          btn.disabled = false;
          if (r.reason === 'no-nickname') {
            alert('先にニックネームを登録してください（設定タブ → ランキング）。誰のリクエストか先生が分かるようにするためです。');
          } else {
            alert('送信に失敗しました。ネット接続を確認してください。');
          }
          return;
        }
        setHelpRequested(questionId, true);
      }
      btn.replaceWith(helpButton(questionId, opts));
      opts.onChange?.();
    },
  }, [
    el('span', {
      text: requested ? '✅ 補習リクエスト済み（取り消す）' : '🙋 補習で解説してほしい',
    }),
  ]);
  return btn;
}
