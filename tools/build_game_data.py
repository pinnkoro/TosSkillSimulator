"""
現行 jTOS クライアントから src/data/game-data.json を生成する。

データ連結:
  job.ies       … クラス定義 (ClassName=Char{tree}_{n}, JobName, Icon, Rank, Enable)
  skilltree.ies … ジョブ↔スキルの対応と MaxLevel / UnlockClassLevel
  skill.ies     … スキルの数値 (SklFactor, BasicSP, BasicCoolDown ...)
  skill.tsv     … スキル名/説明の日本語 (韓国語→日本語)
  etc.tsv       … クラス名などの日本語

名前は IES が持つ韓国語原文を TSV(韓国語列→日本語列)でジョインして日本語化する。
抽出データは © IMCGAMES CO., LTD.
"""
import sys
import os
import re
import glob
import json

sys.path.insert(0, os.path.dirname(__file__))
import tos_extract as T  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "game-data.json")

TREES = {
    1: ("warrior", "ソードマン"),
    2: ("wizard", "ウィザード"),
    3: ("archer", "アーチャー"),
    4: ("cleric", "クレリック"),
    5: ("scout", "スカウト"),
}


def read_raw(basename):
    found = T.find_latest([basename])
    hit = found.get(basename.lower())
    if not hit:
        return None
    path, (rel, do, c, u), nv = hit
    with open(path, "rb") as f:
        return T._extract(f, do, c, u, rel, nv)


def load_dict(basename):
    """TSV: col0=key, col1=日本語, col2=韓国語 → {韓国語: 日本語}"""
    raw = read_raw(basename)
    out = {}
    if not raw:
        return out
    for ln in raw.decode("utf-8", "replace").splitlines():
        c = ln.split("\t")
        if len(c) >= 3 and c[2]:
            out.setdefault(c[2], c[1])
    return out


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# TOS テキスト制御コード（フォントサイズ {s18}/{/s}、リセット {/}、色 {#RRGGBB}、画像 {img ...}）。
# {nl}(改行) と #{...}#(数値プレースホルダ) は対象外。
_CODE = re.compile(r"\{(?:s\d+|ds\d+|/s|/|#[0-9A-Fa-f]{3,8}|img\s[^}]*)\}")


def strip_codes(text):
    return _CODE.sub("", text or "")


def clean_name(text):
    return strip_codes(text or "").strip()


def clean(text):
    return strip_codes((text or "").replace("{nl}", "\n")).strip()


def load_ability_maxlevels():
    """全 ability_<class>.ies を1パスで走査し (maxlv, purchasable) を返す。
      maxlv       : {特性ClassName: MaxLevel}
      purchasable : ability_<class>.ies に載る全 ClassName の集合
                    (=各クラスで実際に取得可能な現行特性。ここに無い ability.ies 行は
                     旧/未使用特性なので表示しない判定に使う)
    特性の名前/説明は ability.ies にあるが、現行かどうか・MaxLevel は各クラス別テーブルが持つ。
    (read_table を表ごとに呼ぶと ipf 全再スキャンで極端に遅いので newest-wins を自前で行う)"""
    ipfs = glob.glob(os.path.join(T.CLIENT_ROOT, "data", "*.ipf")) + \
        glob.glob(os.path.join(T.CLIENT_ROOT, "patch", "*.ipf"))
    ipfs.sort(key=lambda p: (T._patch_rank(p), p))
    pat = re.compile(r"^ability_[a-z0-9]+\.ies$")
    latest = {}  # basename -> (path, entry, new_version)
    for path in ipfs:
        try:
            with open(path, "rb") as f:
                foot = T._find_footer(f)
                if not foot:
                    continue
                fc, to, nv = foot
                for rel, do, comp, uncomp in T._entries(f, fc, to):
                    b = os.path.basename(rel).lower()
                    if pat.match(b):
                        latest[b] = (path, (rel, do, comp, uncomp), nv)
        except Exception:
            continue
    out = {}
    purchasable = set()
    for _b, (path, (rel, do, comp, uncomp), nv) in latest.items():
        try:
            with open(path, "rb") as f:
                blob = T._extract(f, do, comp, uncomp, rel, nv)
            for r in T.parse_ies(blob):
                purchasable.add(r["ClassName"])
                ml = int(num(r.get("MaxLevel")))
                if ml:
                    out[r["ClassName"]] = ml
        except Exception:
            continue
    return out, purchasable


def main():
    print("extracting tables ...")
    skills_rows = T.read_table("skill.ies")[0]
    jobs_rows = T.read_table("job.ies")[0]
    tree_rows = T.read_table("skilltree.ies")[0]
    ja_skill = load_dict("skill.tsv")
    ja_etc = load_dict("etc.tsv")
    # 一部の新クラス名(ラマ/ローグ等)は skill/etc に無く ui.tsv/item.tsv 側にある。
    # 優先順は skill→etc→ui→item で、既存の一致は不変・欠落のみ補完。
    ja_ui = load_dict("ui.tsv")
    ja_item = load_dict("item.tsv")
    ja_quest = load_dict("quest.tsv")

    def ja(ko):
        return (ja_skill.get(ko) or ja_etc.get(ko) or ja_ui.get(ko)
                or ja_item.get(ko) or ja_quest.get(ko) or ko)

    skill_by_cn = {s["ClassName"]: s for s in skills_rows}

    # --- スキル特性 (특성): ability.ies を SkillCategory==スキルClassName で紐付け ---
    print("extracting skill attributes ...")
    ability_rows = T.read_table("ability.ies")[0]
    attr_maxlv, purchasable = load_ability_maxlevels()
    attrs_by_skill = {}
    for a in ability_rows:
        cat = a.get("SkillCategory", "")
        if not cat:
            continue
        # 現行特性のみ: ability_<class>.ies に載るものだけ (Hidden はアーツ等で立つが現行なので不採用)。
        if a["ClassName"] not in purchasable:
            continue
        name = a.get("Name")
        if not name:
            continue
        # SkillCategory は ';' 区切りで複数スキルを指すことがある
        # (クロスツリー版クラスの _Archer/_Scout/_Swordman 等)。各 className に紐付ける。
        attr = {
            "id": a["$ID"],
            "name": clean_name(ja(name)),
            "desc": clean(ja(a.get("Desc", ""))),
            "icon": a.get("Icon", ""),
            "maxLevel": attr_maxlv.get(a["ClassName"], 1),
        }
        for cn in cat.split(";"):
            cn = cn.strip()
            if cn in skill_by_cn:
                attrs_by_skill.setdefault(cn, []).append(attr)

    # --- クラス特性 (スキル非依存): SkillCategory=="All" の行を Job(クラスClassName) で紐付け ---
    # スキル特性と同基準で、現行取得可能(ability_<class>.ies 掲載=purchasable)のもののみ。
    # これにより「最大バフ数アップ」「武器スワップ」等の汎用/旧特性は除外される。
    class_attrs_by_cn = {}
    for a in ability_rows:
        if a.get("SkillCategory", "") != "All":
            continue
        if a["ClassName"] not in purchasable:
            continue
        name = a.get("Name") or ""
        if not name:
            continue
        attr = {
            "id": a["$ID"],
            "name": clean_name(ja(name)),
            "desc": clean(ja(a.get("Desc", ""))),
            "icon": a.get("Icon", ""),
            "maxLevel": attr_maxlv.get(a["ClassName"], 1),
        }
        for cn in a.get("Job", "").split(";"):
            cn = cn.strip()
            if cn:
                class_attrs_by_cn.setdefault(cn, []).append(attr)

    # --- skilltree: ジョブ ClassName -> [ {skill row + maxLevel + unlock} ] ---
    tree_by_job = {}
    for t in tree_rows:
        if t.get("Type") != "Skill":
            continue
        job_cn = t["ClassName"].rsplit("_", 1)[0]  # Char1_1_1 -> Char1_1
        sk = skill_by_cn.get(t.get("SkillName"))
        if not sk:
            continue
        tree_by_job.setdefault(job_cn, []).append((t, sk))

    def skill_type(sk):
        at = str(sk.get("AttackType") or "")
        if num(sk.get("SklFactor")) > 0 or "Attack" in at:
            return "attack"
        return "buff"

    skills_out = {}
    jobs_out = []
    for j in jobs_rows:
        cn = j.get("ClassName", "")
        if not cn.startswith("Char"):
            continue
        try:
            tree_digit = int(cn[4])
        except (ValueError, IndexError):
            continue
        if tree_digit not in TREES:
            continue
        if str(j.get("EnableJob")) not in ("YES", "1", "1.0"):
            continue
        tree_id, _tree_name = TREES[tree_digit]
        entries = tree_by_job.get(cn, [])
        skill_ids = []
        for t, sk in entries:
            sid = sk["$ID"]
            skill_ids.append(sid)
            if sid in skills_out:
                continue
            max_lv = int(num(t.get("MaxLevel"))) or 1
            skills_out[sid] = {
                "id": sid,
                "className": sk["ClassName"],
                "name": clean_name(ja(sk.get("Name", ""))),
                "icon": sk.get("Icon", ""),
                "maxLevel": max_lv,
                "unlockClassLevel": int(num(t.get("UnlockClassLevel"))),
                "type": skill_type(sk),
                "element": sk.get("Attribute", "") or "",
                "cooldown": int(num(sk.get("BasicCoolDown"))),
                "overheat": int(num(sk.get("SklUseOverHeat"))),  # オーバーヒート回数
                # AoE攻撃比率 (SklSR)。負値/0 は「該当なし」のセンチネルなので UI 側で除外。
                "aoeRatio": int(num(sk.get("SklSR"))),
                "sp": {"base": round(num(sk.get("BasicSP")), 2),
                       "perLevel": round(num(sk.get("LvUpSpendSp")), 2)},
                "factor": {"base": round(num(sk.get("SklFactor")), 2),
                           "perLevel": round(num(sk.get("SklFactorByLevel")), 2)},
                "atkAdd": {"base": round(num(sk.get("SklAtkAdd")), 2),
                           "perLevel": round(num(sk.get("SklAtkAddByLevel")), 2)},
                "description": clean(ja(sk.get("Caption", ""))),
                "attributes": attrs_by_skill.get(sk["ClassName"], []),
            }
        # base(スターター) 判定: そのツリーで末尾 _1 のクラス (Char{n}_1)
        is_base = cn == f"Char{tree_digit}_1"
        jobs_out.append({
            "id": j["$ID"],
            "className": cn,
            "name": clean_name(ja(j.get("Name", ""))),
            "engName": j.get("JobName", ""),
            "tree": tree_id,
            "isBase": is_base,
            "rank": int(num(j.get("Rank"))),
            "icon": j.get("Icon", ""),
            "skillIds": skill_ids,
            "attributes": class_attrs_by_cn.get(cn, []),
        })

    # スキルを持たないジョブは planner に不要なので落とす
    jobs_out = [j for j in jobs_out if j["skillIds"]]
    jobs_out.sort(key=lambda j: (j["tree"], not j["isBase"], j["id"]))

    trees_out = []
    for digit, (tid, tname) in TREES.items():
        base = next((j for j in jobs_out if j["tree"] == tid and j["isBase"]), None)
        trees_out.append({"id": tid, "name": tname,
                          "baseJobId": base["id"] if base else None})

    patch = None
    r = T.find_latest(["skill.ies"]).get("skill.ies")
    if r:
        patch = os.path.basename(r[0])

    out = {
        "meta": {
            "source": f"jTOS client (extracted, {patch})",
            "note": "Skill/job data (c) IMCGAMES CO., LTD. All Rights Reserved.",
            "jobCount": len(jobs_out),
            "skillCount": len(skills_out),
        },
        "trees": trees_out,
        "jobs": jobs_out,
        "skills": skills_out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"game-data.json: {len(jobs_out)} jobs, {len(skills_out)} skills, patch={patch}")


if __name__ == "__main__":
    main()
