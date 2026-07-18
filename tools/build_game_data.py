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


def load_skill_ratios():
    """script/calc_property_skill.lua を解析し {SCR関数名: (base, perLevel)} を返す。
    スキル説明の #{CaptionRatioN}# 等はこの Lua 関数が算出する。単純な線形式
    (skill.Level*B / A+(skill.Level-1)*B / 定数 / 別関数への委譲) のみ対応。
    キャラのステータス(INT/MNA 等)依存のものは静的計算不可なので None(除外)。"""
    raw = read_raw("calc_property_skill.lua")
    if not raw:
        return {}
    txt = raw.decode("utf-8", "replace")
    bodies = {}
    for ch in re.split(r"\nfunction ", txt):
        m = re.match(r"(SCR_[A-Za-z0-9_]+)\s*\(\s*skill\s*\)(.*)", ch, re.S)
        if m:
            bodies[m.group(1)] = m.group(2)

    stat = re.compile(r'TryGetProp\(\s*pc|GetAbility\(\s*pc|"(?:INT|MNA|STR|CON|DEX|SPR|LUK)"')
    lin1 = re.compile(r'=\s*(-?\d+(?:\.\d+)?)\s*\+\s*\(\s*skill\.Level\s*-\s*1\s*\)\s*\*\s*(-?\d+(?:\.\d+)?)')
    lin2 = re.compile(r'=\s*skill\.Level\s*\*\s*(-?\d+(?:\.\d+)?)')
    lin3 = re.compile(r'=\s*(-?\d+(?:\.\d+)?)\s*\*\s*skill\.Level')
    indir = re.compile(r'return\s+(SCR_[A-Za-z0-9_]+)\s*\(\s*skill\s*\)')
    const = re.compile(r'value\s*=\s*(-?\d+(?:\.\d+)?)\s')

    memo = {}

    def parse(name, depth=0):
        if name in memo:
            return memo[name]
        if depth > 4 or name not in bodies:
            return None
        memo[name] = None  # 再帰保護
        body = bodies[name]
        if stat.search(body):
            return None
        res = None
        m = lin1.search(body)
        if m:
            res = (float(m.group(1)), float(m.group(2)))
        elif lin2.search(body):
            res = (float(lin2.search(body).group(1)),) * 2
        elif lin3.search(body):
            res = (float(lin3.search(body).group(1)),) * 2
        else:
            mi = indir.search(body)
            if mi:
                res = parse(mi.group(1), depth + 1)
            elif "skill.Level" not in body:
                mc = const.search(body)
                if mc:
                    res = (float(mc.group(1)), 0.0)
        memo[name] = res
        return res

    return {n: parse(n) for n in bodies}


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

    # 多言語フィールド。IES 原文(韓国語)を ko に、TSV ジョイン結果を ja に格納する。
    # 韓国語はジョインのキーそのものなので追加のデータ源は不要。
    def loc_name(ko):
        return {"ja": clean_name(ja(ko)), "ko": clean_name(ko)}

    def loc_desc(ko):
        return {"ja": clean(ja(ko)), "ko": clean(ko)}

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
            "name": loc_name(name),
            "desc": loc_desc(a.get("Desc", "")),
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
            "name": loc_name(name),
            "desc": loc_desc(a.get("Desc", "")),
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

    skill_ratios = load_skill_ratios()
    _COEF = ("SkillFactor", "CaptionRatio", "CaptionRatio2", "CaptionRatio3")

    def factor_of(sk):
        """スキルの表示係数 (base, perLevel, is_attack, kind) を返す。
        kind:
          'exact'  … #{SkillFactor}#(=SklFactor線形) か、Lua を解決できた正確な係数
          'lua'    … Caption2 が #{CaptionRatioN}# を参照するが Lua を静的計算できない(未対応)
          'approx' … 係数トークン無しだが SklFactor>0(概算値。正確な係数ではない)
          'none'   … 係数なし
        攻撃スキルは #{SkillFactor}#、ヒール/バフ等は #{CaptionRatioN}# を
        Lua(calc_property_skill.lua)から解決する。"""
        cap2 = sk.get("Caption2", "") or ""
        tokens = re.findall(r"#\{(\w+)\}#", cap2)
        prim = next((t for t in tokens if t in _COEF), None)
        if prim == "SkillFactor":
            return num(sk.get("SklFactor")), num(sk.get("SklFactorByLevel")), True, "exact"
        if prim in ("CaptionRatio", "CaptionRatio2", "CaptionRatio3"):
            f = skill_ratios.get(sk.get(prim, ""))
            if f:
                return f[0], f[1], False, "exact"
            return 0.0, 0.0, False, "lua"  # 参照式を計算できない → 未対応
        base = num(sk.get("SklFactor"))
        if base > 0:
            # 係数トークン無しで SklFactor>0。ペインバリア等のバフに多く、値はプレースホルダ
            # の可能性が高いので攻撃扱いにせず概算(approx)として印付きで出す。
            return base, num(sk.get("SklFactorByLevel")), False, "approx"
        return 0.0, 0.0, False, "none"

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
            f_base, f_per, f_atk, f_kind = factor_of(sk)
            skills_out[sid] = {
                "id": sid,
                "className": sk["ClassName"],
                "name": loc_name(sk.get("Name", "")),
                "icon": sk.get("Icon", ""),
                "maxLevel": max_lv,
                "unlockClassLevel": int(num(t.get("UnlockClassLevel"))),
                "type": "attack" if f_atk else "buff",
                "element": sk.get("Attribute", "") or "",
                "cooldown": int(num(sk.get("BasicCoolDown"))),
                "overheat": int(num(sk.get("SklUseOverHeat"))),  # オーバーヒート回数
                # AoE攻撃比率 (SklSR)。負値/0 は「該当なし」のセンチネルなので UI 側で除外。
                "aoeRatio": int(num(sk.get("SklSR"))),
                "sp": {"base": round(num(sk.get("BasicSP")), 2),
                       "perLevel": round(num(sk.get("LvUpSpendSp")), 2)},
                "factor": {"base": round(f_base, 2), "perLevel": round(f_per, 2)},
                "factorKind": f_kind,
                "atkAdd": {"base": round(num(sk.get("SklAtkAdd")), 2),
                           "perLevel": round(num(sk.get("SklAtkAddByLevel")), 2)},
                "description": loc_desc(sk.get("Caption", "")),
                "attributes": attrs_by_skill.get(sk["ClassName"], []),
            }
        # base(スターター) 判定: そのツリーで末尾 _1 のクラス (Char{n}_1)
        is_base = cn == f"Char{tree_digit}_1"
        jobs_out.append({
            "id": j["$ID"],
            "className": cn,
            "name": loc_name(j.get("Name", "")),
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
        # 系統名 = base(スターター)ジョブの名前。韓国語も base 職から取れるので個別辞書は不要。
        name = base["name"] if base else {"ja": tname, "ko": tname}
        trees_out.append({"id": tid, "name": name,
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
