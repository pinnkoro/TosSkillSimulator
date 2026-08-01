// ビルド状態の生成・URL(hash)へのエンコード/デコード・集計。
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { BuildState, Job, Skill, TreeId } from '../types';
import { advancedJobsOf, baseJobOf, getJob, getSkill, getTree, trees } from '../data/gameData';

export function emptyBuild(): BuildState {
  return { tree: null, jobs: [null, null, null, null], levels: {}, attrs: [], gems: [], earrings: {} };
}

/** 系統を選び直す。base(枠0)を固定し、枠1-3はクリア。 */
export function selectTree(tree: TreeId): BuildState {
  const base = baseJobOf(tree);
  return {
    tree,
    jobs: [base ? base.id : null, null, null, null],
    levels: {},
    attrs: [],
    gems: [],
    earrings: {},
  };
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

/** 選択ジョブに属さないレベル/特性/装備補正を捨てる。 */
function prune(build: BuildState): BuildState {
  const okSkills = validSkillIds(build);
  const levels: Record<number, number> = {};
  for (const [k, v] of Object.entries(build.levels)) {
    const id = Number(k);
    if (okSkills.has(id) && v > 0) levels[id] = v;
  }
  const okAttrs = validAttrIds(build);
  const attrs = build.attrs.filter((id) => okAttrs.has(id));
  // ジェムは「Lv1以上振ってあるスキル」にだけ乗る。イヤリングは選択中クラスの枠だけ残す。
  const gems = build.gems.filter((id) => (levels[id] ?? 0) > 0);
  const okJobs = new Set(build.jobs.filter((id): id is number => id != null));
  const earrings: Record<string, number> = {};
  for (const [k, v] of Object.entries(build.earrings)) {
    if (v > 0 && okJobs.has(Number(k.split('_')[0]))) earrings[k] = v;
  }
  return { ...build, levels, attrs, gems, earrings };
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

// ---- 装備によるスキルレベル補正（ポイント消費とは別枠） ----
// スキルジェム: 1スキルにつき +1Lv。全クラス合計 GEM_MAX 個まで。
// イヤリング  : クラスの解放Lv段階(1〜/16〜/31〜)単位で +1〜+EARRING_MAX Lv。
//               その段階のスキル全部に効き、枠は全体で EARRING_SLOTS 個まで。
// どちらも「Lv1以上振ってあるスキル」にのみ乗り、スキルの maxLevel は超えられる。
export const GEM_MAX = 8;
export const EARRING_SLOTS = 3;
export const EARRING_MAX = 5;
/** イヤリングの段階（＝スキルの解放クラスLvの区切り）。 */
export const EARRING_TIERS = [1, 16, 31] as const;

/** 解放クラスLv → イヤリングの段階。 */
export function tierOf(unlockClassLevel: number): number {
  if (unlockClassLevel >= 31) return 31;
  if (unlockClassLevel >= 16) return 16;
  return 1;
}

/** イヤリング枠のキー。 */
export function earringKey(jobId: number, tier: number): string {
  return `${jobId}_${tier}`;
}

/** ジョブのスキルを解放Lv段階ごとに分ける（空の段階は返さない）。 */
export function skillTiers(job: Job): { tier: number; skills: Skill[] }[] {
  return EARRING_TIERS.map((tier) => ({
    tier: tier as number,
    skills: job.skillIds
      .map((sid) => getSkill(sid))
      .filter((sk): sk is Skill => sk != null && tierOf(sk.unlockClassLevel) === tier),
  })).filter((g) => g.skills.length > 0);
}

/** 使用中のジェム個数。 */
export function gemsUsed(build: BuildState): number {
  return build.gems.length;
}

/** 使用中のイヤリング枠数。 */
export function earringsUsed(build: BuildState): number {
  return Object.keys(build.earrings).length;
}

/** ジェムのON/OFF。OFF→ON は Lv1以上かつ空きがあるときのみ。 */
export function toggleGem(build: BuildState, skillId: number): BuildState {
  if (build.gems.includes(skillId)) {
    return { ...build, gems: build.gems.filter((id) => id !== skillId) };
  }
  if ((build.levels[skillId] ?? 0) <= 0) return build;
  if (gemsUsed(build) >= GEM_MAX) return build;
  return { ...build, gems: [...build.gems, skillId] };
}

/** イヤリングの+Lvを設定（0で外す）。新規装着は空き枠があるときのみ。 */
export function setEarring(
  build: BuildState,
  jobId: number,
  tier: number,
  level: number,
): BuildState {
  const key = earringKey(jobId, tier);
  const next = Math.max(0, Math.min(EARRING_MAX, level));
  const cur = build.earrings[key] ?? 0;
  if (next === cur) return build;
  const earrings = { ...build.earrings };
  if (next <= 0) {
    delete earrings[key];
    return { ...build, earrings };
  }
  if (cur === 0 && earringsUsed(build) >= EARRING_SLOTS) return build;
  earrings[key] = next;
  return { ...build, earrings };
}

/** そのスキルの装備によるレベル補正（ジェム＋所属クラス段階のイヤリング）。 */
export function bonusLevel(build: BuildState, skillId: number): number {
  if ((build.levels[skillId] ?? 0) <= 0) return 0;
  const gem = build.gems.includes(skillId) ? 1 : 0;
  const skill = getSkill(skillId);
  const job = ownerJob(build, skillId);
  if (!skill || !job) return gem;
  return gem + (build.earrings[earringKey(job.id, tierOf(skill.unlockClassLevel))] ?? 0);
}

/** 装備補正込みの実効レベル。 */
export function effectiveLevel(build: BuildState, skillId: number): number {
  const lv = build.levels[skillId] ?? 0;
  return lv > 0 ? lv + bonusLevel(build, skillId) : 0;
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
  // Lv0 に戻したスキルからはジェムも外す（枠を解放する）。
  if (lv <= 0 && build.gems.includes(skillId)) {
    return { ...build, levels, gems: build.gems.filter((id) => id !== skillId) };
  }
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
  if (build.gems.length) params.set('g', build.gems.join('.'));
  // イヤリングは `jobId_tier-lv` を '.' 区切りで。
  const ear = Object.entries(build.earrings)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}-${v}`)
    .join('.');
  if (ear) params.set('e', ear);
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
  // ジェム/イヤリングは setter 経由で入れて、個数上限・Lv0スキルを弾く。
  const gStr = params.get('g');
  if (gStr) {
    for (const tok of gStr.split('.')) {
      const id = Number(tok);
      if (id > 0) build = toggleGem(build, id);
    }
  }
  const eStr = params.get('e');
  if (eStr) {
    for (const pair of eStr.split('.')) {
      const [k, v] = pair.split('-');
      const [jobStr, tierStr] = (k ?? '').split('_');
      const jobId = Number(jobStr);
      const tier = Number(tierStr);
      const lv = Number(v);
      if (jobId > 0 && EARRING_TIERS.includes(tier as 1 | 16 | 31) && lv > 0) {
        build = setEarring(build, jobId, tier, lv);
      }
    }
    build = prune(build);
  }
  return build;
}

export const treeList = trees;
