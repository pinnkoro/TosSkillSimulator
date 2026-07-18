// 同梱データ(game-data.json)の読み込みと索引。
import type { GameData, Job, Skill, Tree, TreeId } from '../types';
import raw from './game-data.json';

export const gameData = raw as unknown as GameData;

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

/** 系統に属する非baseジョブ（枠1-3の選択肢）。名前順。 */
export function advancedJobsOf(tree: TreeId): Job[] {
  return gameData.jobs
    .filter((j) => j.tree === tree && !j.isBase)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ja'));
}

/** レベル L における値。L<=0 は 0。 */
export function valueAt(scaled: { base: number; perLevel: number }, level: number): number {
  if (level <= 0) return 0;
  return scaled.base + scaled.perLevel * (level - 1);
}
