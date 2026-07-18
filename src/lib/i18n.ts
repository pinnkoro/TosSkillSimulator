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
  title: 'jTOS スキルシミュレータ',
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
  atkAdd: '+攻',
  sp: 'SP',
  thLv: 'Lv',
  thFactor: '係数%',
  thAtk: '+攻',
  thSp: 'SP',
  lvDown: 'レベルを下げる',
  lvUp: 'レベルを上げる',
  langLabel: '言語',
};

const ko: typeof ja = {
  title: 'jTOS 스킬 시뮬레이터',
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
  atkAdd: '+공',
  sp: 'SP',
  thLv: 'Lv',
  thFactor: '계수%',
  thAtk: '+공',
  thSp: 'SP',
  lvDown: '레벨 감소',
  lvUp: '레벨 증가',
  langLabel: '언어',
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
