// アプリ本体 src/theme.ts / CLAUDE.md の配色を Web に移植したもの。
export const TIER_COLOR = ['#DC2626', '#EA580C', '#F59E0B', '#65A30D', '#15803D'];
export const TIER_MARK = ['①', '②', '③', '④', '⑤'];
export const TIER_NAME = ['要復習', '慣れ中', '定着中', 'もう一歩', 'クリア寸前'];

const LARGE_TO_GROUP = {
  時制: 'verb', 態: 'verb', 主語と動詞の一致: 'verb', 助動詞: 'verb',
  不定詞: 'verbal', 動名詞: 'verbal', 分詞: 'verbal',
  関係詞: 'relation', 比較: 'relation', 仮定法: 'relation',
  '否定・省略・強調': 'structure', 疑問文と語順: 'structure', 接続詞: 'structure',
  前置詞: 'structure', 群前置詞: 'structure',
  代名詞: 'usage', 形容詞の語法: 'usage', 名詞の語法: 'usage',
  副詞の語法: 'usage', 動詞の語法: 'usage',
  '会話表現（機能別）': 'conversation', '会話表現（場面別）': 'conversation',
  副詞中心のイディオム: 'conversation', 形容詞中心のイディオム: 'conversation',
  名詞中心のイディオム: 'conversation', 動詞中心のイディオム: 'conversation',
};

const GROUPS = {
  verb: { tone: '#2563EB', tint: '#DBEAFE', dark: '#1D4ED8' },
  verbal: { tone: '#7C3AED', tint: '#EDE9FE', dark: '#5B21B6' },
  relation: { tone: '#16A34A', tint: '#DCFCE7', dark: '#15803D' },
  structure: { tone: '#0891B2', tint: '#CFFAFE', dark: '#0E7490' },
  usage: { tone: '#EA580C', tint: '#FFEDD5', dark: '#C2410C' },
  conversation: { tone: '#DB2777', tint: '#FCE7F3', dark: '#9D174D' },
};

export function categoryPalette(large) {
  return GROUPS[LARGE_TO_GROUP[large] ?? 'relation'];
}
