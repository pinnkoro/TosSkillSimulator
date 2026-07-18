// tos.guru の jTOS CSV (data-src/) を、アプリが読むスリムな JSON へ変換する。
//
// 入力: data-src/jobs.csv, data-src/skills.csv  (© IMCGAMES CO., LTD.)
// 出力: src/data/game-data.json
//
// CoolDown / SP 列にはゲーム内計算式(JSコード文字列)が入っているため使わず、
// Prop_* の数値プロパティからレベル別の値を算出する。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data-src');
const OUT = join(ROOT, 'src', 'data');

// --- RFC4180 CSV パーサ (フィールド内の改行・エスケープされた引用符に対応) ---
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ヘッダ行を使って各行をオブジェクト化するアクセサを返す
function loadTable(file) {
  const rows = parseCsv(readFileSync(join(SRC, file), 'utf8'));
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const records = rows.slice(1).filter((r) => r.length > 1);
  return { idx, records };
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v) => v === 'True' || v === 'true';
// "[10001, 10002]" のような文字列を数値配列へ
const intArray = (v) => {
  if (!v) return [];
  const m = v.match(/-?\d+/g);
  return m ? m.map(Number) : [];
};
// 説明文の制御トークンを整形: {nl}→改行, その他 {...} は除去
const cleanText = (v) =>
  (v || '')
    .replace(/\{nl\}/g, '\n')
    .replace(/\{[^}]*\}/g, '')
    .trim();

// スキルツリー(スターター系統)を $ID 先頭桁から判定
const TREE_BY_DIGIT = {
  1: { id: 'warrior', name: 'ソードマン' },
  2: { id: 'wizard', name: 'ウィザード' },
  3: { id: 'archer', name: 'アーチャー' },
  4: { id: 'cleric', name: 'クレリック' },
  5: { id: 'scout', name: 'スカウト' },
};
const treeOf = (id) => TREE_BY_DIGIT[String(id)[0]] ?? null;

// TypeAttack "[0, 1]" 等 → 攻撃系か判定 (含 1 = 攻撃)
const attackTypeOf = (v) => {
  const arr = intArray(v);
  if (arr.includes(1)) return 'attack';
  return 'buff';
};

// ---- skills ----
const skillsTbl = loadTable('skills.csv');
const S = skillsTbl.idx;
const skills = {};
for (const r of skillsTbl.records) {
  const id = num(r[S['$ID']]);
  if (!id) continue;
  const maxLevel = Math.max(1, num(r[S['Prop_MaxLevel']]));
  skills[id] = {
    id,
    name: r[S['Name']] || '',
    icon: r[S['Icon']] || '',
    maxLevel,
    type: attackTypeOf(r[S['TypeAttack']]),
    element: num(r[S['Element']]),
    overheat: num(r[S['OverHeat']]),
    cooldown: num(r[S['Prop_BasicCoolDown']]), // ms
    unlockClassLevel: num(r[S['Prop_UnlockClassLevel']]),
    // レベル別に算出するための係数
    sp: { base: num(r[S['Prop_BasicSP']]), perLevel: num(r[S['Prop_LvUpSpendSp']]) },
    factor: { base: num(r[S['Prop_SklFactor']]), perLevel: num(r[S['Prop_SklFactorByLevel']]) },
    atkAdd: { base: num(r[S['Prop_SklAtkAdd']]), perLevel: num(r[S['Prop_SklAtkAddByLevel']]) },
    description: cleanText(r[S['Description']]),
  };
}

// ---- jobs ----
const jobsTbl = loadTable('jobs.csv');
const J = jobsTbl.idx;
const jobs = [];
for (const r of jobsTbl.records) {
  const id = num(r[J['$ID']]);
  if (!id) continue;
  const tree = treeOf(id);
  if (!tree) continue; // 系統外(共通ジョブ等)は除外
  const skillIds = intArray(r[J['Link_Skills']]).filter((sid) => skills[sid]);
  jobs.push({
    id,
    idName: r[J['$ID_NAME']] || '',
    name: r[J['Name']] || '',
    tree: tree.id,
    treeName: tree.name,
    rank: num(r[J['Rank']]),
    circleMax: Math.max(1, num(r[J['CircleMax']])),
    isStarter: bool(r[J['IsStarter']]),
    isHidden: bool(r[J['IsHidden']]),
    isSecret: bool(r[J['IsSecret']]),
    icon: r[J['Icon']] || '',
    description: cleanText(r[J['Description']]),
    skillIds,
  });
}

// 参照されているスキルだけを残す (未使用スキルを落としてサイズ削減)
const usedSkillIds = new Set(jobs.flatMap((j) => j.skillIds));
const slimSkills = {};
for (const sid of usedSkillIds) slimSkills[sid] = skills[sid];

const out = {
  meta: {
    source: 'tos.guru (rjgtav/tos-database) jTOS',
    note: 'Skill/job data © IMCGAMES CO., LTD. All Rights Reserved.',
    jobCount: jobs.length,
    skillCount: Object.keys(slimSkills).length,
  },
  jobs: jobs.sort((a, b) => a.tree.localeCompare(b.tree) || a.rank - b.rank || a.id - b.id),
  skills: slimSkills,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'game-data.json'), JSON.stringify(out));
console.log(
  `game-data.json written: ${out.jobs.length} jobs, ${out.meta.skillCount} skills`,
);
