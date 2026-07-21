// ビルド状態の生成・URL(hash)へのエンコード/デコード・集計。
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { BuildState, Job, TreeId } from '../types';
import { advancedJobsOf, baseJobOf, getJob, getSkill, getTree, trees } from '../data/gameData';

export function emptyBuild(): BuildState {
  return { tree: null, jobs: [null, null, null, null], levels: {}, attrs: [] };
}

/** 系統を選び直す。base(枠0)を固定し、枠1-3はクリア。 */
export function selectTree(tree: TreeId): BuildState {
  const base = baseJobOf(tree);
  return { tree, jobs: [base ? base.id : null, null, null, null], levels: {}, attrs: [] };
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

/** 選択中ジョブが持つスキルIDの集合。 */
function validSkillIds(build: BuildState): Set<number> {
  const valid = new Set<number>();
  for (const job of selectedJobs(build)) for (const sid of job.skillIds) valid.add(sid);
  return valid;
}

/** 選択中ジョブのスキル特性＋クラス特性のIDの集合。 */
function validAttrIds(build: BuildState): Set<number> {
  const valid = new Set<number>();
  for (const job of selectedJobs(build)) {
    for (const a of job.attributes) valid.add(a.id);
    for (const sid of job.skillIds) {
      const sk = getSkill(sid);
      if (sk) for (const a of sk.attributes) valid.add(a.id);
    }
  }
  return valid;
}

/** 選択ジョブに属さないレベル/特性を捨てる。 */
function prune(build: BuildState): BuildState {
  const okSkills = validSkillIds(build);
  const levels: Record<number, number> = {};
  for (const [k, v] of Object.entries(build.levels)) {
    const id = Number(k);
    if (okSkills.has(id) && v > 0) levels[id] = v;
  }
  const okAttrs = validAttrIds(build);
  const attrs = build.attrs.filter((id) => okAttrs.has(id));
  return { ...build, levels, attrs };
}

export function setJob(build: BuildState, slot: number, jobId: number | null): BuildState {
  const jobs = build.jobs.slice();
  jobs[slot] = jobId;
  return prune({ ...build, jobs });
}

/** 特性のON/OFFを切り替える。 */
export function toggleAttr(build: BuildState, attrId: number): BuildState {
  const on = build.attrs.includes(attrId);
  const attrs = on
    ? build.attrs.filter((id) => id !== attrId)
    : [...build.attrs, attrId];
  return { ...build, attrs };
}

// ---- スキルポイント上限ルール ----
// base職=15pt / それ以降=45pt を各職の基本枠とし、
// さらに全職合計で BONUS_POOL(=21pt) まで基本枠を超えて追加できる。
export const BASE_BUDGET = 15;
export const ADV_BUDGET = 45;
export const BONUS_POOL = 21;

export function jobBudget(job: Job): number {
  return job.isBase ? BASE_BUDGET : ADV_BUDGET;
}

/** ジョブに投じたスキルポイント合計（1レベル=1ポイント）。 */
export function pointsUsed(build: BuildState, job: Job): number {
  return job.skillIds.reduce((sum, sid) => sum + (build.levels[sid] ?? 0), 0);
}

/** 全職が基本枠を超えて使っている合計（共有プールの消費量）。 */
export function bonusUsed(build: BuildState): number {
  return selectedJobs(build).reduce(
    (sum, j) => sum + Math.max(0, pointsUsed(build, j) - jobBudget(j)),
    0,
  );
}

/** そのスキルを持つ選択中ジョブ。 */
function ownerJob(build: BuildState, skillId: number): Job | undefined {
  return selectedJobs(build).find((j) => j.skillIds.includes(skillId));
}

export function setLevel(build: BuildState, skillId: number, level: number): BuildState {
  const skill = getSkill(skillId);
  const max = skill ? skill.maxLevel : 0;
  let lv = Math.max(0, Math.min(max, level));

  // 上限ルール: レベルを上げる場合、共有プール(20pt)を超えないよう頭打ちにする。
  const current = build.levels[skillId] ?? 0;
  const job = ownerJob(build, skillId);
  if (lv > current && job) {
    const jobBud = jobBudget(job);
    const curUsed = pointsUsed(build, job);
    const otherBonus = bonusUsed(build) - Math.max(0, curUsed - jobBud);
    const maxUsed = jobBud + (BONUS_POOL - otherBonus);
    const newUsed = curUsed - current + lv;
    if (newUsed > maxUsed) lv = lv - (newUsed - maxUsed);
    lv = Math.max(current, lv);
  }

  const levels = { ...build.levels };
  if (lv <= 0) delete levels[skillId];
  else levels[skillId] = lv;
  return { ...build, levels };
}

// ---- URL (location.hash) シリアライズ ----
// 内部形式は URLSearchParams の平文クエリ文字列。これを lz-string で圧縮して
// hash に載せることで、スキル/特性が増えても URL が伸びにくいようにする。
// 旧形式（平文クエリ = '=' を含む）もそのまま読めるよう後方互換を保つ。

/** build → 平文クエリ文字列（圧縮前の内部表現）。 */
function encodeQuery(build: BuildState): string {
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
  if (build.attrs.length) params.set('a', build.attrs.join('.'));
  return params.toString();
}

export function encodeBuild(build: BuildState): string {
  const query = encodeQuery(build);
  if (!query) return '';
  return compressToEncodedURIComponent(query);
}

export function decodeBuild(hash: string): BuildState {
  const raw = hash.replace(/^#/, '');
  if (!raw) return emptyBuild();
  // '=' を含めば旧形式の平文クエリ。含まなければ lz-string 圧縮トークン。
  // （compressToEncodedURIComponent の出力に '=' は現れない）
  let clean = raw;
  if (!raw.includes('=')) {
    const decompressed = decompressFromEncodedURIComponent(raw);
    if (!decompressed) return emptyBuild();
    clean = decompressed;
  }
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
  const aStr = params.get('a');
  if (aStr) {
    const okAttrs = validAttrIds(build);
    const attrs = aStr
      .split('.')
      .map(Number)
      .filter((id) => id > 0 && okAttrs.has(id));
    build = { ...build, attrs };
  }
  return build;
}

export const treeList = trees;
