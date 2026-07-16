import { el } from './ui.js';
import { state, setHelpRequested } from './state.js';
import { requestHelp, cancelHelp, isFirebaseConfigured } from './cloud.js';

// コメント入力の小窓
function openCommentModal(onSubmit) {
  const overlay = el('div', { class: 'modal-overlay' });
  const ta = el('textarea', { class: 'input', rows: '3', maxlength: '300', placeholder: '例：なぜ②ではダメなのか分かりません' });
  const box = el('div', { class: 'modal-box' }, [
    el('div', { class: 'modal-title', text: '🙋 補習で解説してほしい' }),
    el('div', { class: 'card-sub', text: 'どこが分からなかったか、先生に伝えたいことを書いてください（空でもOK）。' }),
    ta,
    el('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } }, [
      el('button', { class: 'btn', style: { flex: 1 }, onclick: () => { overlay.remove(); onSubmit(ta.value); }, text: '送信する' }),
      el('button', { class: 'chip', style: { padding: '12px 16px' }, onclick: () => overlay.remove(), text: 'キャンセル' }),
    ]),
  ]);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  ta.focus();
}

// 「補習で解説してほしい」ボタン。押すとコメント入力→Firebaseに記録。
export function helpButton(questionId, opts = {}) {
  const requested = state.helpRequestedIds.has(questionId);
  const btn = el('button', {
    class: 'btn secondary help-btn' + (requested ? ' requested' : ''),
    onclick: async () => {
      if (!isFirebaseConfigured() || !state.settings.cloudEnabled) {
        alert('この機能を使うには、設定タブで「ランキングに参加」をオンにして、ニックネームを登録してください。（先生が誰のリクエストか分かるようにするためです）');
        return;
      }
      if (state.helpRequestedIds.has(questionId)) {
        // 取り消し
        btn.disabled = true;
        await cancelHelp(questionId).catch(() => {});
        setHelpRequested(questionId, false);
        btn.replaceWith(helpButton(questionId, opts));
        opts.onChange?.();
        return;
      }
      openCommentModal(async (comment) => {
        btn.disabled = true;
        const r = await requestHelp(questionId, comment);
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
        btn.replaceWith(helpButton(questionId, opts));
        opts.onChange?.();
      });
    },
  }, [
    el('span', {
      text: opts.short
        ? (requested ? '✅ 希望中' : '🙋 補習希望')
        : (requested ? '✅ 補習リクエスト済み（取り消す）' : '🙋 補習で解説してほしい'),
    }),
  ]);
  return btn;
}
