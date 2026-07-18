// ビルド状態の生成・URL(hash)へのエンコード/デコード・集計。
import type { BuildState, Job, TreeId } from '../types';
import { advancedJobsOf, baseJobOf, getJob, getSkill, getTree, trees } from '../data/gameData';

export function emptyBuild(): BuildState {
  return { tree: null, jobs: [null, null, null, null], levels: {} };
}

/** 系統を選び直す。base(枠0)を固定し、枠1-3はクリア。 */
export function selectTree(tree: TreeId): BuildState {
  const base = baseJobOf(tree);
  return { tree, jobs: [base ? base.id : null, null, null, null], levels: {} };
}

/** 現在ビルドで選択中のジョブ(枠順、未選択は除く)。 */
export function selectedJobs(build: BuildState): Job[] {
  return build.jobs
    .map((id) => getJob(id))
    .filter((j): j is Job => j != null);
}

/** ある枠で選べる候補（同系統・非base・他枠と重複しない）。 */
export function jobChoicesFor(build: BuildState, slot: number): Job[] {
  if (!build.tree) return [];
  const taken = new Set(
    build.jobs.filter((id, i) => id != null && i !== slot) as number[],
  );
  return advancedJobsOf(build.tree).filter((j) => !taken.has(j.id));
}

/** 全選択ジョブのスキルIDに絞り、そこに属さないレベルは捨てる。 */
function pruneLevels(build: BuildState): Record<number, number> {
  const valid = new Set<number>();
  for (const job of selectedJobs(build)) for (const sid of job.skillIds) valid.add(sid);
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(build.levels)) {
    const id = Number(k);
    if (valid.has(id) && v > 0) out[id] = v;
  }
  return out;
}

export function setJob(build: BuildState, slot: number, jobId: number | null): BuildState {
  const jobs = build.jobs.slice();
  jobs[slot] = jobId;
  const next = { ...build, jobs };
  return { ...next, levels: pruneLevels(next) };
}

export function setLevel(build: BuildState, skillId: number, level: number): BuildState {
  const skill = getSkill(skillId);
  const max = skill ? skill.maxLevel : 0;
  const lv = Math.max(0, Math.min(max, level));
  const levels = { ...build.levels };
  if (lv <= 0) delete levels[skillId];
  else levels[skillId] = lv;
  return { ...build, levels };
}

/** ジョブに投じたスキルポイント合計（1レベル=1ポイント）。 */
export function pointsUsed(build: BuildState, job: Job): number {
  return job.skillIds.reduce((sum, sid) => sum + (build.levels[sid] ?? 0), 0);
}

// ---- URL (location.hash) シリアライズ ----

export function encodeBuild(build: BuildState): string {
  if (!build.tree) return '';
  const params = new URLSearchParams();
  params.set('t', build.tree);
  // 枠1-3のみ格納（枠0=base は系統から復元）。
  const slots = [build.jobs[1], build.jobs[2], build.jobs[3]].map((id) => id ?? 0);
  params.set('j', slots.join('.'));
  const lv = Object.entries(build.levels)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}-${v}`)
    .join('.');
  if (lv) params.set('s', lv);
  return params.toString();
}

export function decodeBuild(hash: string): BuildState {
  const clean = hash.replace(/^#/, '');
  if (!clean) return emptyBuild();
  const params = new URLSearchParams(clean);
  const treeId = params.get('t') as TreeId | null;
  if (!treeId || !getTree(treeId)) return emptyBuild();

  let build = selectTree(treeId);
  const jStr = params.get('j');
  if (jStr) {
    jStr.split('.').forEach((tok, i) => {
      const id = Number(tok);
      if (id > 0) build = setJob(build, i + 1, id);
    });
  }
  const sStr = params.get('s');
  if (sStr) {
    for (const pair of sStr.split('.')) {
      const [k, v] = pair.split('-');
      const id = Number(k);
      const lv = Number(v);
      if (id > 0 && lv > 0) build = setLevel(build, id, lv);
    }
  }
  return build;
}

export const treeList = trees;
