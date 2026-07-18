// Tree of Savior スキルシミュレータの型定義。
// src/data/game-data.json（tools/build_game_data.py 由来）の実スキーマに対応する。
// HANDOFF.md §5 参照。

/** スキルの数値プロパティ。レベル L の値 ≒ base + perLevel*(L-1)。 */
export interface LevelScaled {
  base: number;
  perLevel: number;
}

export type SkillType = 'attack' | 'buff';

/** スキル特性（別途取得する強化。ability.ies 由来）。 */
export interface SkillAttribute {
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
}

export interface Skill {
  id: number;
  className: string;
  name: string;
  icon: string;
  maxLevel: number;
  unlockClassLevel: number;
  type: SkillType;
  /** Attribute 文字列（'Melee' | 'Holy' | 'Fire' | ... | ''） */
  element: string;
  /** クールタイム(ms) */
  cooldown: number;
  /** オーバーヒート回数（0=なし） */
  overheat: number;
  /** AoE攻撃比率。0以下は該当なし。 */
  aoeRatio: number;
  /** SP消費 */
  sp: LevelScaled;
  /** スキルファクター(攻撃力倍率%) */
  factor: LevelScaled;
  /** 固定攻撃力加算 */
  atkAdd: LevelScaled;
  description: string;
  /** スキル特性一覧 */
  attributes: SkillAttribute[];
}

/** スキルツリー（スターター系統） */
export type TreeId = 'warrior' | 'wizard' | 'archer' | 'cleric' | 'scout';

export interface Tree {
  id: TreeId;
  name: string;
  baseJobId: number;
}

export interface Job {
  id: number;
  className: string;
  name: string;
  engName: string;
  tree: TreeId;
  isBase: boolean;
  rank: number;
  icon: string;
  skillIds: number[];
}

export interface GameData {
  meta: {
    source: string;
    note: string;
    jobCount: number;
    skillCount: number;
  };
  trees: Tree[];
  jobs: Job[];
  skills: Record<string, Skill>;
}

/** 1ビルドの状態。系統・4つのジョブ枠・スキルID→振ったレベル。 */
export interface BuildState {
  tree: TreeId | null;
  /** 4枠。未選択は null。index 0 = スターター(base)固定。 */
  jobs: (number | null)[];
  /** skillId -> 振ったレベル(1以上のみ保持) */
  levels: Record<number, number>;
}
