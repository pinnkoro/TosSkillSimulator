"""
バイボラ(ビジョン)一覧をクライアントから抽出して src/data/vaivora.json を生成する。

データ源:
  eliteequipdrop.ies … バイボラ一覧の正。ClassName(=アイテム) / Name(韓国語) / JobName(クラス英名)
                       ゲーム内の装備保管庫の表記「バイボラ秘伝 - <効果>(固有) - <クラス>」は
                       item_cabinet.lua の GET_ENABLE_EQUIP_JOB がこの JobName を引いて作る。
  item_equip*.ies    … 効果キー(AdditionalOption_1) と武器種(ClassType2)
  etc.tsv 等         … 日本語名と効果説明。item からの参照キーが無いので、
                       「説明文中に効果名が見出しとして出る」ことを手掛かりに拾い、
                       候補が複数あるときは当該クラスのスキル名との一致数で選び、
                       それでも並ぶときは TSV キーの日付が新しい方を採る。
                       (TSV には旧パッチの文面も残っているため。例「デュアルソード」は
                        スキル改名前の "カーターストローク" 版が3つ併存している)

バイボラは Lv1〜4 まであり、item_equip 側に `<ClassName>_Lv2..4` として入っている。
差分は装備Lvとステータスのみで、AdditionalOption_1(＝スキルレベル上昇を含む効果キー)は
4段階とも同一。よって levelUps は Lv非依存で、レベル別には stats だけを持つ。
Lv4 だけ DefaultEqpSlot にサブ武器スロットが増え、AdditionalOption_2 が付く
（この追加オプションの効果はクライアント内の .ies に定義が無く、内容は取得不能）。

説明が拾えない/誤っている分は tools/vaivora_desc.json で上書きできる。
形式: {"<アイテムClassName>": {"ja": "...", "ko": "..."}}

使い方:
  python tools/build_vaivora.py     # -> src/data/vaivora.json
  ※ゲーム終了中に実行すること(IPFが排他ロックされるため)。
抽出データは © IMCGAMES CO., LTD.
"""
import os
import re
import sys
import glob
import json
import collections

sys.path.insert(0, os.path.dirname(__file__))
import tos_extract as T  # noqa: E402
from build_game_data import clean, clean_name  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
GAME_DATA = os.path.join(ROOT, "src", "data", "game-data.json")
OVERRIDE = os.path.join(os.path.dirname(__file__), "vaivora_desc.json")
OUT = os.path.join(ROOT, "src", "data", "vaivora.json")

# 「바이보라 비전 - <効果名>」/「바이보라 <武器> - <効果名>」(Lv表記は無視)
VISION_RE = re.compile(r"^바이보라\s*비전\s*-\s*(.+)$")
NAME_RE = re.compile(r"^(?:\[Lv\d\]\s*)?바이보라\s+(.+?)\s*-\s*(.+)$")
JA_LV_RE = re.compile(r"^\s*\[Lv\d\]\s*")
TSV_FILES = ("etc.tsv", "item.tsv", "ui.tsv", "skill.tsv")

# 複数系統から選べる共通クラスは、系統ごとに別 jobId で「ボーンマンサー[W]」のように
# 登録されている。[A]=Archer / [C]=Cleric / [T]=Scout / [S]=Swordman / [W]=Wizard。
SUFFIX_RE = re.compile(r"\[[ACTSW]\]$")

# TSV の行キー（例 "ETC_20221011_069761"）。日付が新しいほど新しい文面。
TSV_KEY_RE = re.compile(r"_(\d{8})_(\d+)$")

# バイボラのレベル別アイテム（"<base>_Lv2"）。接尾辞が無ければ Lv1。
ITEM_LV_RE = re.compile(r"^(.*)_Lv(\d)$")

# レベル別に出力するステータス。ゲーム内表記が確実なものだけ並べ、
# ここに無いフィールドは IES のキー名のまま UI に出す（誤訳を出すよりマシ）。
STAT_FIELDS = [
    "STR", "CON", "INT", "MNA", "DEX", "ALLSTAT",
    "ADD_HR", "ADD_DR", "CRTHR", "CRTDR", "CRTATK", "CRTMATK",
    "BLK", "BLK_BREAK",
]
# ステータスではない（レベル差分に出てきても無視する）フィールド。
NON_STAT_FIELDS = {
    "$ID", "ClassID", "ClassName", "Name", "Desc", "NumberArg1", "UseLv",
    "AdditionalOption_1", "AdditionalOption_2", "DefaultEqpSlot",
    "ExtractProperty", "EvolvedItemLv", "ExchangeGroup", "DesigncutColor",
    "DungeonEnterType", "CustomOptDescFunc", "EquipActionType", "EquipXpGroup",
    "BlowSoundType", "FileName", "AttachType", "DBLHand", "EqpType",
    "LHandSkill", "WeaponTrailEffect", "BriquetingAble", "ItemType",
    "MergeClass2", "MergeClass3", "MergeTable3", "Script", "Usable",
    "PreCheckScp", "ClientScp", "JobGrade", "JobOnly", "StringArg2",
    "EnchantItemRank", "EnchantItemRankCount", "LifeTime_Limitcheck",
}


def row_order(key):
    """TSV 行キー → 新しいほど大きい並び順キー。"""
    m = TSV_KEY_RE.search(key or "")
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def strip_variant(name):
    """「Bonemancer[W]」→「Bonemancer」。派生でなければそのまま。"""
    return SUFFIX_RE.sub("", (name or "").strip())


def load_tsv_rows():
    """全 TSV を newest-wins で読み、[(行キー, ja, ko)] を返す。"""
    ipfs = glob.glob(os.path.join(T.CLIENT_ROOT, "data", "*.ipf")) + \
        glob.glob(os.path.join(T.CLIENT_ROOT, "patch", "*.ipf"))
    ipfs.sort(key=lambda p: (T._patch_rank(p), p))
    latest = {}
    for path in ipfs:
        try:
            with open(path, "rb") as f:
                foot = T._find_footer(f)
                if not foot:
                    continue
                fc, to, nv = foot
                for rel, do, comp, uncomp in T._entries(f, fc, to):
                    b = os.path.basename(rel.lower())
                    if b in TSV_FILES:
                        latest[b] = (path, (rel, do, comp, uncomp), nv)
        except Exception:
            continue
    rows = []
    for b in TSV_FILES:
        hit = latest.get(b)
        if not hit:
            continue
        path, (rel, do, comp, uncomp), nv = hit
        with open(path, "rb") as f:
            blob = T._extract(f, do, comp, uncomp, rel, nv)
        for line in blob.decode("utf-8", "replace").split("\n"):
            c = line.rstrip("\r").split("\t")
            if len(c) > 2 and c[2]:
                rows.append((c[0], c[1], c[2]))
    return rows


def item_meta():
    """効果名(ko) -> {opt, weapon}。item_equip 系のバイボラ・ビジョン行から。"""
    meta = {}
    for tbl in ("item_equip.ies", "item_equip_ep12.ies"):
        got = T.read_table(tbl)
        if not got:
            continue
        for r in got[0]:
            m = VISION_RE.match(str(r.get("Name", "")).strip())
            if m:
                meta.setdefault(m.group(1).strip(), {
                    "opt": str(r.get("AdditionalOption_1", "")),
                    "weapon": str(r.get("ClassType2", "")),
                })
    return meta


def index_ja_names(rows):
    """効果名(ko) -> 日本語のバイボラ名(「バイボラ<武器> - <効果>」)。同名は新しい行を採る。"""
    out = {}
    for key, ja, ko in rows:
        m = NAME_RE.match(ko.strip())
        if not m:
            continue
        eff = m.group(2).strip()
        order = row_order(key)
        if eff not in out or order > out[eff][0]:
            # ja 側にも「[Lv4]バイボラ秘伝 - …」の段階表記が付くので落とす
            # （レベルは name ではなく levels[] で持つ）。
            out[eff] = (order, JA_LV_RE.sub("", clean_name(ja)).strip())
    return {k: v[1] for k, v in out.items()}


def clean_desc(text):
    """説明文の整形。上昇矢印の画像タグはゲーム内表記に合わせて ▲ にする
    （strip_codes は {img ...} を落とすだけなので、その前に置き換える）。"""
    return clean((text or "").replace("{img green_up_arrow 16 16}", "▲"))


def desc_index(rows):
    """効果説明らしき行を [{order, ja, ko, raw}] で。箇条書き or スキルLv上昇矢印を含むもの。

    同文(ko)が複数行あるときは新しい行に寄せる。日本語だけ差し替えられた行が
    あるので、古い方を採ると ja が旧文面のまま残る。"""
    best = {}
    for key, ja, ko in rows:
        if "green_up_arrow" not in ko and not ko.strip().startswith("-"):
            continue
        k = clean_desc(ko)
        if not k:
            continue
        order = row_order(key)
        cur = best.get(k)
        if cur is None or order > cur["order"]:
            best[k] = {"order": order, "ja": clean_desc(ja), "ko": k, "raw": ko}
    return list(best.values())


def pick_desc(descs, eff, job, skills):
    """効果名を見出しに含む説明のうち、そのクラスのスキル名と最も合うものを選ぶ。

    TSV には旧パッチの文面も残っているので、同点の候補は新しい行を採る。"""
    cands = [d for d in descs
             if ("{nl}" + eff) in d["raw"] or (eff + "{nl}") in d["raw"]
             or d["raw"].strip().startswith(eff)]
    if not cands:
        # 共通クラス(複数系統)のバイボラは説明の見出しに効果名が出ず、
        # 「- 본맨서 모든 스킬 레벨 ▲1」のようにクラス名で始まる。効果名で
        # 引けないときだけ、クラス名を手掛かりにしたゆるい照合に落とす。
        head = re.compile(strip_variant(job["name"]["ko"]).replace(" ", r"\s*")
                          + r"\s*(?:의)?\s*모든\s*스킬\s*레벨")
        cands = [d for d in descs if head.search(d["ko"])]
    if not cands:
        return None, 0
    if len(cands) == 1:
        return cands[0], 1
    names = [skills[str(s)]["name"]["ko"] for s in job["skillIds"]
             if str(s) in skills and skills[str(s)]["name"]["ko"]]
    names.append(job["name"]["ko"])

    def score(d):
        # スキル名の一致数が第一。旧文面は改名前のスキル名を使っていることが多く
        # ここで落ちるが、文面だけ変わった改訂は同点になるので日付で決める。
        return (sum(1 for n in names if n and n in d["ko"]), d["order"])
    best = max(cands, key=score)
    return (best, len(cands)) if score(best)[0] > 0 else (None, len(cands))


# --- 効果説明からスキルレベル上昇を読む ---
# 例: 「- ロデレロの全てのスキルレベル▲1」「- クロスカットスキルレベル▲3」
#     「- 忍法 分身の術を除外した全てのシノビスキルレベル▲1」
#     「- オラクルの全スキルレベル ▲1 (最大レベルが1のスキルは除く)」
LEVELUP_RE = re.compile(r"^(?P<pre>.*?)スキル(?:の)?レベル\s*▲\s*(?P<n>\d+)\s*(?P<post>.*)$")
ALL_RE = re.compile(r"^(?P<name>.+?)(?:の)?(?:全ての|すべての|全部の|全)$")
EXCEPT_RE = re.compile(
    r"^(?P<ex>.+?)を(?:除外した|除いた|除く)(?:全ての|すべての|全)?(?P<name>.*?)(?:の)?$")
# 箇条書きの先頭記号。全角ハイフンやダッシュで書かれた行もある。
BULLET = "-－−–—"


def norm(s):
    """表記ゆれ（空白・記号・かっこ）を落とした照合用キー。"""
    return re.sub(r"[\s・･\[\]「」【】（）().．]", "", s or "")


def parse_levelups(desc_ja, job, gd):
    """説明文 → {skillId: +Lv}。読めなかった行は (未解決リスト) として返す。"""
    skills = {}
    for sid in job["skillIds"]:
        sk = gd["skills"].get(str(sid))
        if sk:
            skills[norm(sk["name"]["ja"])] = sk
    jobs_by_name = {norm(j["name"]["ja"]): j for j in gd["jobs"]}
    # 説明文では派生クラスも接尾辞なし（「ボーンマンサーの全てのスキルレベル▲1」）で
    # 書かれるので、生成対象クラス自身の接尾辞なし表記でも引けるようにする。
    jobs_by_name.setdefault(norm(strip_variant(job["name"]["ja"])), job)

    out = {}
    unresolved = []
    for line in desc_ja.split("\n"):
        line = line.strip().lstrip(BULLET).strip().replace("{", "").replace("}", "")
        if "▲" not in line or "レベル" not in line:
            continue
        m = LEVELUP_RE.match(line)
        if not m:
            continue
        plus = int(m.group("n"))
        pre, post = m.group("pre").strip(), m.group("post")
        drop_max1 = "最大レベルが1" in post

        targets = None
        mex = EXCEPT_RE.match(pre)
        mall = ALL_RE.match(pre)
        if mex and mex.group("name"):
            cls = jobs_by_name.get(norm(mex.group("name")))
            if cls:
                ex = {norm(x) for x in re.split(r"[、,]", mex.group("ex"))}
                targets = [sk for k, sk in skills.items() if k not in ex] \
                    if cls["id"] == job["id"] else None
        elif mall:
            cls = jobs_by_name.get(norm(mall.group("name")))
            if cls and cls["id"] == job["id"]:
                targets = list(skills.values())
            elif cls:
                targets = [gd["skills"][str(s)] for s in cls["skillIds"]
                           if str(s) in gd["skills"]]
        if targets is None:
            sk = skills.get(norm(pre.rstrip("の")))
            if sk:
                targets = [sk]
        if targets is None:
            # 「ケラウノスのスキルレベル▲1」のように「全て」が付かないクラス指定もある。
            # スキル名と紛れないよう、スキルとして引けなかったときだけクラスとして見る。
            cls = jobs_by_name.get(norm(pre.rstrip("の")))
            if cls:
                targets = [gd["skills"][str(s)] for s in cls["skillIds"]
                           if str(s) in gd["skills"]]
        if targets is None:
            unresolved.append(line)
            continue
        for sk in targets:
            if drop_max1 and sk["maxLevel"] <= 1:
                continue
            out[str(sk["id"])] = out.get(str(sk["id"]), 0) + plus
    return out, unresolved


def num(v):
    """IES のセル → 数値（空・非数値は 0）。"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0
    return int(f) if f == int(f) else f


def level_rows():
    """バイボラの基本 ClassName -> {レベル: item_equip の行}。

    PVP 版(PVP_ 接頭辞)は別枠なので除く。"""
    out = {}
    for tbl in ("item_equip.ies", "item_equip_ep12.ies"):
        got = T.read_table(tbl)
        if not got:
            continue
        for r in got[0]:
            cn = str(r.get("ClassName", ""))
            if "바이보라" not in str(r.get("Name", "")) or cn.startswith("PVP_"):
                continue
            m = ITEM_LV_RE.match(cn)
            base, lv = (m.group(1), int(m.group(2))) if m else (cn, 1)
            out.setdefault(base, {})[lv] = r
    return out


def build_levels(rows_by_lv, unknown):
    """{レベル: 行} → 出力用のレベル一覧。stats はレベル間で差がある項目だけ。

    全レベル同値のステータスは「Lvによる違い」ではないので落とす。
    STAT_FIELDS に無いキーは unknown に積んで、握り潰さず build 時に報告する。"""
    lvs = sorted(rows_by_lv)
    if not lvs:
        return []
    changed = []
    for f in STAT_FIELDS + sorted(set(rows_by_lv[lvs[0]]) - set(STAT_FIELDS)):
        if f in NON_STAT_FIELDS or f not in rows_by_lv[lvs[0]]:
            continue
        vals = {num(rows_by_lv[lv].get(f)) for lv in lvs}
        if len(vals) > 1 and vals != {0}:
            changed.append(f)
            if f not in STAT_FIELDS:
                unknown.add(f)
    out = []
    for lv in lvs:
        r = rows_by_lv[lv]
        slots = str(r.get("DefaultEqpSlot", "")).split()
        out.append({
            "level": lv,
            "useLv": num(r.get("UseLv")),
            # Lv4 はサブ武器スロットにも入る（＝2本目として装備できる）。
            "subSlot": "LH" in slots and "RH" in slots,
            # Lv4 だけ付く追加オプション。効果内容はクライアントに定義が無い。
            "bonusOption": str(r.get("AdditionalOption_2", "") or ""),
            "stats": {f: num(r.get(f)) for f in changed},
        })
    return out


def main():
    gd = json.load(open(GAME_DATA, encoding="utf-8"))
    by_eng = {j["engName"]: j for j in gd["jobs"]}
    # 共通クラスのバイボラは eliteequipdrop 側が接尾辞なしの JobName（"Bonemancer"）で
    # 1行だけ持つ。その場合は同名の派生クラス全部に同じバイボラを割り当てる。
    variants = {}
    for j in gd["jobs"]:
        base = strip_variant(j["engName"])
        if base != j["engName"]:
            variants.setdefault(base, []).append(j)
    skills = gd["skills"]

    got = T.read_table("eliteequipdrop.ies")
    if not got:
        print("! eliteequipdrop.ies not found", file=sys.stderr)
        return
    drops, src = got
    print(f"eliteequipdrop.ies: {len(drops)} rows ({src})")

    rows = load_tsv_rows()
    ja_names = index_ja_names(rows)
    descs = desc_index(rows)
    meta = item_meta()
    by_lv = level_rows()
    unknown_stats = set()
    no_levels = []
    override = {}
    if os.path.exists(OVERRIDE):
        override = json.load(open(OVERRIDE, encoding="utf-8"))

    out = []
    no_job, no_desc, unresolved, ambiguous = [], [], [], 0
    for r in drops:
        m = VISION_RE.match(str(r.get("Name", "")).strip())
        if not m:
            continue
        eff = m.group(1).strip()
        eng = str(r.get("JobName", "")).strip()
        jobs = [by_eng[eng]] if eng in by_eng else variants.get(eng, [])
        if not jobs:
            # JobName が "All" や未知のクラス名(＝汎用バイボラ)はクラス紐付けなし
            no_job.append((eff, eng))
            continue
        mm = meta.get(eff, {})
        ov = override.get(r["ClassName"]) or {}
        levels = build_levels(by_lv.get(r["ClassName"], {}), unknown_stats)
        if not levels:
            no_levels.append(r["ClassName"])
        for job in jobs:
            # 説明の候補選びとスキルレベル上昇の解決はクラス依存なので派生ごとにやる。
            d, n = pick_desc(descs, eff, job, skills)
            if n > 1:
                ambiguous += 1
            # override は ja/ko を1組として扱う。ja だけ直したときに自動取得の
            # (誤っている可能性がある) ko が残ると、KO 表示だけ古いままになる。
            if ov:
                desc_ja, desc_ko = ov.get("ja", ""), ov.get("ko", "")
            else:
                desc_ja, desc_ko = (d["ja"], d["ko"]) if d else ("", "")
            if not desc_ja:
                no_desc.append(eff)
            level_ups, un = parse_levelups(desc_ja, job, gd)
            unresolved += [(r["ClassName"], u) for u in un]
            out.append({
                "item": r["ClassName"],
                "jobId": job["id"],
                "key": mm.get("opt", ""),
                "name": {"ja": ja_names.get(eff, eff), "ko": f"바이보라 비전 - {eff}"},
                "weapon": mm.get("weapon", ""),
                "desc": {"ja": desc_ja, "ko": desc_ko},
                "levelUps": level_ups,
                "levels": levels,
            })

    out.sort(key=lambda e: (e["jobId"], e["item"]))
    json.dump({"entries": out}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    classes = len({e["jobId"] for e in out})
    print(f"wrote {OUT}: {len(out)} entries / {classes} classes")
    print(f"  no class link: {len(no_job)} {no_job[:5]}")
    print(f"  no description: {len(no_desc)} {no_desc[:8]}")
    print(f"  (description picked among multiple candidates: {ambiguous})")
    lv_counts = collections.Counter(len(e["levels"]) for e in out)
    print(f"  levels per entry: {dict(sorted(lv_counts.items()))}")
    if no_levels:
        print(f"  ! no item_equip row: {len(no_levels)} {no_levels[:5]}")
    if unknown_stats:
        # STAT_FIELDS 外だがレベル間で差があるもの。UI では IES のキー名のまま出る。
        print(f"  stats shown by raw IES key: {sorted(unknown_stats)}")
    lifted = sum(1 for e in out if e["levelUps"])
    print(f"  skill level-ups parsed: {lifted} entries, "
          f"{len(unresolved)} lines unresolved")
    for u in unresolved[:15]:
        print("   ?", u[0], "|", u[1])


if __name__ == "__main__":
    main()
