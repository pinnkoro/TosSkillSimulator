// Tree of Savior スキルシミュレータの型定義。
// game-data.json (tools/tos_extract.py 由来) の構造に対応する。

/** スキルの数値プロパティ (レベル別に算出するための係数) */
export interface LevelScaled {
  base: number;
  perLevel: number;
}

export type SkillType = 'attack' | 'buff';

export interface Skill {
  id: number;
  name: string;
  icon: string;
  maxLevel: number;
  type: SkillType;
  element: number;
  overheat: number;
  /** クールタイム(ms) */
  cooldown: number;
  unlockClassLevel: number;
  /** SP消費 */
  sp: LevelScaled;
  /** スキルファクター(攻撃力倍率%) */
  factor: LevelScaled;
  /** 固定攻撃力加算 */
  atkAdd: LevelScaled;
  description: string;
}

/** スキルツリー(スターター系統) */
export type TreeId = 'warrior' | 'wizard' | 'archer' | 'cleric' | 'scout';

export interface Job {
  id: number;
  idName: string;
  name: string;
  tree: TreeId;
  treeName: string;
  rank: number;
  circleMax: number;
  isStarter: boolean;
  isHidden: boolean;
  isSecret: boolean;
  icon: string;
  description: string;
  skillIds: number[];
}

export interface GameData {
  meta: {
    source: string;
    note: string;
    jobCount: number;
    skillCount: number;
  };
  jobs: Job[];
  skills: Record<string, Skill>;
}

/** 1ビルドの状態。4つのジョブ枠と、スキルID→振ったレベルのマップ。 */
export interface BuildState {
  tree: TreeId | null;
  /** 4枠。未選択は null。index 0 = スターター。 */
  jobs: (number | null)[];
  /** skillId -> 振ったレベル */
  levels: Record<number, number>;
}
