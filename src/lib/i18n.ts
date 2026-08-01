// 多言語対応。UI 文言の辞書 + 言語の状態(Context) + データ(Loc)の言語出し分け。
// データ側(スキル名/説明など)は game-data.json が持つ Loc({ja,ko}) を tl() で出す。
// Provider コンポーネントは LangProvider.tsx（この .ts はロジックのみ）。
import { createContext, useContext } from 'react';
import type { Loc } from '../types';

export type Lang = 'ja' | 'ko';

/** セレクタに並べる言語。label はその言語自身での表記。 */
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
];

// UI 文言。ja/ko で同一のキー形を持つ（ko を typeof ja で縛って抜け漏れを型で防ぐ）。
const ja = {
  title: 'ToS スキルシミュレータ',
  total: '合計',
  pt: 'pt',
  add: '追加',
  share: 'URLを共有',
  copied: 'コピーしました',
  reset: 'リセット',
  tree: '系統',
  hint: '系統を選ぶとジョブとスキルが表示されます。',
  jobsLabel: 'ジョブ（枠0=スターター固定）',
  slot0: '枠0 · base',
  slot: (n: number) => `枠${n}`,
  choose: '— 選択 —',
  classAttrs: 'クラス特性',
  footer: (jobs: number, skills: number) => `${jobs}ジョブ / ${skills}スキル`,
  atkBadge: '攻',
  buffBadge: '補',
  atkTag: '攻撃',
  buffTag: '補助',
  reqLv: (n: number) => `Lv${n}〜`,
  curLv: (n: number) => `現在Lv${n}:`,
  factor: '係数',
  factorApproxNote: '※ 正確な係数ではありません（概算値）',
  factorLuaNote: '係数はゲーム内数式のため未対応',
  atkAdd: '+攻',
  sp: 'SP',
  thLv: 'Lv',
  thFactor: '係数%',
  thAtk: '+攻',
  thSp: 'SP',
  lvDown: 'レベルを下げる',
  lvUp: 'レベルを上げる',
  langLabel: '言語',
  gem: 'スキルジェム',
  gemHint: 'このスキルを+1Lv（全クラス合計8個まで）',
  earring: 'イヤリング',
  earringHint: 'この段階のスキルすべてを+1〜+5Lv（全体で3枠まで）',
  earringDown: 'イヤリングの+Lvを下げる',
  earringUp: 'イヤリングの+Lvを上げる',
  tierLabel: (n: number) => `Lv${n}〜`,
  needLv1: 'Lv1以上のスキルにのみ装着できます',
  noSlot: '空き枠がありません',
  effLv: (n: number) => `装備込みLv${n}:`,
  vaivora: 'バイボラ',
  vaivoraHint: 'このクラスのバイボラを装備（同時に2クラスまで）',
};

const ko: typeof ja = {
  title: 'ToS 스킬 시뮬레이터',
  total: '합계',
  pt: 'pt',
  add: '추가',
  share: 'URL 공유',
  copied: '복사했습니다',
  reset: '초기화',
  tree: '계열',
  hint: '계열을 선택하면 직업과 스킬이 표시됩니다.',
  jobsLabel: '직업 (0번=스타터 고정)',
  slot0: '0번 · base',
  slot: (n: number) => `${n}번`,
  choose: '— 선택 —',
  classAttrs: '클래스 특성',
  footer: (jobs: number, skills: number) => `${jobs} 직업 / ${skills} 스킬`,
  atkBadge: '공',
  buffBadge: '보',
  atkTag: '공격',
  buffTag: '보조',
  reqLv: (n: number) => `Lv${n}~`,
  curLv: (n: number) => `현재 Lv${n}:`,
  factor: '계수',
  factorApproxNote: '※ 정확한 계수가 아닙니다 (근사치)',
  factorLuaNote: '계수는 게임 내 수식이라 미지원',
  atkAdd: '+공',
  sp: 'SP',
  thLv: 'Lv',
  thFactor: '계수%',
  thAtk: '+공',
  thSp: 'SP',
  lvDown: '레벨 감소',
  lvUp: '레벨 증가',
  langLabel: '언어',
  gem: '스킬 젬',
  gemHint: '이 스킬 +1Lv (전 클래스 합계 8개까지)',
  earring: '귀걸이',
  earringHint: '해당 단계의 모든 스킬 +1~+5Lv (전체 3슬롯까지)',
  earringDown: '귀걸이 +Lv 감소',
  earringUp: '귀걸이 +Lv 증가',
  tierLabel: (n: number) => `Lv${n}~`,
  needLv1: 'Lv1 이상인 스킬에만 장착할 수 있습니다',
  noSlot: '남은 슬롯이 없습니다',
  effLv: (n: number) => `장비 포함 Lv${n}:`,
  vaivora: '바이보라',
  vaivoraHint: '이 클래스의 바이보라 장착 (동시에 2클래스까지)',
};

export const DICT = { ja, ko };

export const STORAGE_KEY = 'tos-lang';

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'ko') return saved;
  } catch {
    // localStorage 不可の環境では既定へ。
  }
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'ja';
}

export interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const LangContext = createContext<LangCtx>({ lang: 'ja', setLang: () => {} });

/** 現在言語・切替関数・UI辞書(ui)・データ翻訳(tl) をまとめて返す。 */
export function useI18n() {
  const { lang, setLang } = useContext(LangContext);
  const tl = (o: Loc | undefined): string => (o ? o[lang] || o.ja : '');
  return { lang, setLang, ui: DICT[lang], tl };
}
