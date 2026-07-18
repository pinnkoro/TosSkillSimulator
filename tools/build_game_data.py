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


def clean(text):
    return (text or "").replace("{nl}", "\n").strip()


def main():
    print("extracting tables ...")
    skills_rows = T.read_table("skill.ies")[0]
    jobs_rows = T.read_table("job.ies")[0]
    tree_rows = T.read_table("skilltree.ies")[0]
    ja_skill = load_dict("skill.tsv")
    ja_etc = load_dict("etc.tsv")

    def ja(ko):
        return ja_skill.get(ko) or ja_etc.get(ko) or ko

    skill_by_cn = {s["ClassName"]: s for s in skills_rows}

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
                "name": ja(sk.get("Name", "")),
                "icon": sk.get("Icon", ""),
                "maxLevel": max_lv,
                "unlockClassLevel": int(num(t.get("UnlockClassLevel"))),
                "type": skill_type(sk),
                "element": sk.get("Attribute", "") or "",
                "cooldown": int(num(sk.get("BasicCoolDown"))),
                "overheat": int(num(sk.get("SklUseOverHeat"))),
                "sp": {"base": round(num(sk.get("BasicSP")), 2),
                       "perLevel": round(num(sk.get("LvUpSpendSp")), 2)},
                "factor": {"base": round(num(sk.get("SklFactor")), 2),
                           "perLevel": round(num(sk.get("SklFactorByLevel")), 2)},
                "atkAdd": {"base": round(num(sk.get("SklAtkAdd")), 2),
                           "perLevel": round(num(sk.get("SklAtkAddByLevel")), 2)},
                "description": clean(ja(sk.get("Caption", ""))),
            }
        # base(スターター) 判定: そのツリーで末尾 _1 のクラス (Char{n}_1)
        is_base = cn == f"Char{tree_digit}_1"
        jobs_out.append({
            "id": j["$ID"],
            "className": cn,
            "name": ja(j.get("Name", "")),
            "engName": j.get("JobName", ""),
            "tree": tree_id,
            "isBase": is_base,
            "rank": int(num(j.get("Rank"))),
            "icon": j.get("Icon", ""),
            "skillIds": skill_ids,
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
