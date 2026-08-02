// Tree of Savior スキルシミュレータの型定義。
// src/data/game-data.json（tools/build_game_data.py 由来）の実スキーマに対応する。
// HANDOFF.md §5 参照。

/** スキルの数値プロパティ。レベル L の値 ≒ base + perLevel*(L-1)。 */
export interface LevelScaled {
  base: number;
  perLevel: number;
}

export type SkillType = 'attack' | 'buff';

/** 多言語テキスト。ja=日本語(TSVジョイン結果) / ko=韓国語(IES原文)。 */
export interface Loc {
  ja: string;
  ko: string;
}

/** スキル特性（別途取得する強化。ability.ies 由来）。 */
export interface SkillAttribute {
  /** ability.ies の $ID（ビルド状態・URL共有の識別子） */
  id: number;
  name: Loc;
  desc: Loc;
  icon: string;
  maxLevel: number;
}

export interface Skill {
  id: number;
  className: string;
  name: Loc;
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
  /** factor の信頼度。'exact'=正確 / 'approx'=概算 / 'lua'=ゲーム内数式で未対応 / 'none'=係数なし */
  factorKind: 'exact' | 'approx' | 'lua' | 'none';
  /** 固定攻撃力加算 */
  atkAdd: LevelScaled;
  description: Loc;
  /** スキル特性一覧 */
  attributes: SkillAttribute[];
}

/** スキルツリー（スターター系統） */
export type TreeId = 'warrior' | 'wizard' | 'archer' | 'cleric' | 'scout';

export interface Tree {
  id: TreeId;
  name: Loc;
  baseJobId: number;
}

export interface Job {
  id: number;
  className: string;
  name: Loc;
  engName: string;
  tree: TreeId;
  isBase: boolean;
  rank: number;
  icon: string;
  skillIds: number[];
  /** クラス特性（スキル非依存。ability.ies の SkillCategory=="All" 由来） */
  attributes: SkillAttribute[];
}

/**
 * バイボラの段階(Lv1〜4)。同じバイボラの強化段階で、item_equip の
 * `<ClassName>_Lv2..4` 由来。効果キー(AdditionalOption_1)は4段階とも同じなので
 * スキルレベル上昇(levelUps)は段階に依らず、ここではステータス差だけを持つ。
 */
export interface VaivoraLevel {
  /** 1〜4 */
  level: number;
  /** 装備可能キャラクターLv */
  useLv: number;
  /** サブ武器スロットにも装着できるか（Lv4のみ true） */
  subSlot: boolean;
  /**
   * Lv4 で増える追加オプションのキー（AdditionalOption_2）。
   * 効果内容はクライアント内の .ies に定義が無く取得できないため、キーのみ。
   */
  bonusOption: string;
  /**
   * 段階間で差があるステータスのみ（IES のフィールド名 -> 値）。
   * 全段階で同値の項目は「Lvによる違い」ではないので入らない。
   */
  stats: Record<string, number>;
}

/** バイボラ(ビジョン)。クラスごとに1つ。tools/build_vaivora.py 由来。 */
export interface Vaivora {
  /** アイテムの ClassName（識別子） */
  item: string;
  /** 対象クラスの job.id */
  jobId: number;
  /** 効果キー（item_equip の AdditionalOption_1） */
  key: string;
  name: Loc;
  /** 武器種（ClassType2。空のこともある） */
  weapon: string;
  /** 効果説明。クライアントから拾えなかった分は空文字。 */
  desc: Loc;
  /**
   * 効果説明から読み取ったスキルレベル上昇（skillId → +Lv）。
   * 「○○の全てのスキルレベル▲1」「××スキルレベル▲3」等をスキルIDに解決したもの。
   */
  levelUps: Record<string, number>;
  /** 強化段階(Lv1〜4)。レベル昇順。 */
  levels: VaivoraLevel[];
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

/** 1ビルドの状態。系統・4つのジョブ枠・スキルID→振ったレベル・選択した特性ID。 */
export interface BuildState {
  tree: TreeId | null;
  /** 4枠。未選択は null。index 0 = スターター(base)固定。 */
  jobs: (number | null)[];
  /** skillId -> 振ったレベル(1以上のみ保持) */
  levels: Record<number, number>;
  /** ONにした特性IDの集合（ON/OFFのみ） */
  attrs: number[];
  /** スキルジェムを付けたスキルID（各+1Lv、全クラス合計 GEM_MAX 個まで） */
  gems: number[];
  /**
   * イヤリング。`${jobId}_${tier}` -> +Lv(1..EARRING_MAX)。
   * tier は解放クラスLvの段階(1/16/31)で、その段階のスキル全部に効く。枠は EARRING_SLOTS 個まで。
   * 基礎職(isBase)には付けられない。
   */
  earrings: Record<string, number>;
  /**
   * バイボラ。jobId -> 装備している段階(1..VAIVORA_LV_MAX)。
   * 基礎職には付けられず、VAIVORA_MAX クラスまで。既定は最大段階。
   */
  vaivora: Record<number, number>;
}
