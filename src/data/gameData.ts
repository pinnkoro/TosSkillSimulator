// 同梱データ(game-data.json)の読み込みと索引。
import type { GameData, Job, Skill, Tree, TreeId, Vaivora } from '../types';
import raw from './game-data.json';
import rawVaivora from './vaivora.json';

export const gameData = raw as unknown as GameData;

// バイボラ(クラスごとに1つ)。クラス紐付けが無い汎用バイボラは vaivora.json に載らない。
const vaivoraByJob = new Map<number, Vaivora[]>();
for (const v of (rawVaivora as unknown as { entries: Vaivora[] }).entries) {
  const list = vaivoraByJob.get(v.jobId);
  if (list) list.push(v);
  else vaivoraByJob.set(v.jobId, [v]);
}

/** そのクラスのバイボラ一覧（無ければ空配列）。 */
export function vaivoraOf(jobId: number): Vaivora[] {
  return vaivoraByJob.get(jobId) ?? [];
}

export const trees: Tree[] = gameData.trees;

const jobById = new Map<number, Job>(gameData.jobs.map((j) => [j.id, j]));
const skillById = new Map<number, Skill>(
  Object.values(gameData.skills).map((s) => [s.id, s]),
);

export function getJob(id: number | null | undefined): Job | undefined {
  return id == null ? undefined : jobById.get(id);
}

export function getSkill(id: number): Skill | undefined {
  return skillById.get(id);
}

export function getTree(id: TreeId | null | undefined): Tree | undefined {
  return trees.find((t) => t.id === id);
}

/** 系統の base(スターター)ジョブ。 */
export function baseJobOf(tree: TreeId): Job | undefined {
  return jobById.get(getTree(tree)!.baseJobId);
}

/**
 * クラス一覧の並び順。
 * - tos: ゲーム内と同じ（クラスID順 = 実装順）
 * - eng: 英語名順（表示言語を切り替えても順番が変わらない）
 */
export type ClassOrder = 'tos' | 'eng';

/** 系統に属する非baseジョブ（枠1-3の選択肢）。 */
export function advancedJobsOf(tree: TreeId, order: ClassOrder): Job[] {
  return gameData.jobs
    .filter((j) => j.tree === tree && !j.isBase)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (order === 'eng' ? a.engName.localeCompare(b.engName, 'en') : a.id - b.id),
    );
}

/** レベル L における値。L<=0 は 0。 */
export function valueAt(scaled: { base: number; perLevel: number }, level: number): number {
  if (level <= 0) return 0;
  return scaled.base + scaled.perLevel * (level - 1);
}
