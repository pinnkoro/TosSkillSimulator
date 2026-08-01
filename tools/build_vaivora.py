"""
バイボラ(ビジョン)一覧をクライアントから抽出して src/data/vaivora.json を生成する。

データ源:
  eliteequipdrop.ies … バイボラ一覧の正。ClassName(=アイテム) / Name(韓国語) / JobName(クラス英名)
                       ゲーム内の装備保管庫の表記「バイボラ秘伝 - <効果>(固有) - <クラス>」は
                       item_cabinet.lua の GET_ENABLE_EQUIP_JOB がこの JobName を引いて作る。
  item_equip*.ies    … 効果キー(AdditionalOption_1) と武器種(ClassType2)
  etc.tsv 等         … 日本語名と効果説明。item からの参照キーが無いので、
                       「説明文中に効果名が見出しとして出る」ことを手掛かりに拾い、
                       候補が複数あるときは当該クラスのスキル名との一致数で選ぶ。

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
TSV_FILES = ("etc.tsv", "item.tsv", "ui.tsv", "skill.tsv")


def load_tsv_rows():
    """全 TSV を newest-wins で読み、[(ja, ko)] を返す。"""
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
                rows.append((c[1], c[2]))
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
    """効果名(ko) -> 日本語のバイボラ名(「バイボラ<武器> - <効果>」)。"""
    out = {}
    for ja, ko in rows:
        m = NAME_RE.match(ko.strip())
        if m:
            out.setdefault(m.group(2).strip(), clean_name(ja))
    return out


def desc_index(rows):
    """効果説明らしき行を [(ja, ko)] で。箇条書き or スキルLv上昇矢印を含むもの。"""
    out = []
    seen = set()
    for ja, ko in rows:
        if "green_up_arrow" not in ko and not ko.strip().startswith("-"):
            continue
        k = clean(ko)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append((clean(ja), k, ko))
    return out


def pick_desc(descs, eff, job, skills):
    """効果名を見出しに含む説明のうち、そのクラスのスキル名と最も合うものを選ぶ。"""
    cands = [d for d in descs
             if ("{nl}" + eff) in d[2] or (eff + "{nl}") in d[2] or d[2].strip().startswith(eff)]
    if not cands:
        return None, 0
    if len(cands) == 1:
        return cands[0], 1
    names = [skills[str(s)]["name"]["ko"] for s in job["skillIds"]
             if str(s) in skills and skills[str(s)]["name"]["ko"]]
    names.append(job["name"]["ko"])

    def score(d):
        return sum(1 for n in names if n and n in d[1])
    best = max(cands, key=score)
    return (best, len(cands)) if score(best) > 0 else (None, len(cands))


def main():
    gd = json.load(open(GAME_DATA, encoding="utf-8"))
    by_eng = {j["engName"]: j for j in gd["jobs"]}
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
    override = {}
    if os.path.exists(OVERRIDE):
        override = json.load(open(OVERRIDE, encoding="utf-8"))

    out = []
    no_job, no_desc, ambiguous = [], [], 0
    for r in drops:
        m = VISION_RE.match(str(r.get("Name", "")).strip())
        if not m:
            continue
        eff = m.group(1).strip()
        eng = str(r.get("JobName", "")).strip()
        job = by_eng.get(eng)
        if not job:
            # JobName が "All" や未知のクラス名(＝汎用バイボラ)はクラス紐付けなし
            no_job.append((eff, eng))
            continue
        mm = meta.get(eff, {})
        d, n = pick_desc(descs, eff, job, skills)
        if n > 1:
            ambiguous += 1
        ov = override.get(r["ClassName"]) or {}
        desc_ja = ov.get("ja") or (d[0] if d else "")
        desc_ko = ov.get("ko") or (d[1] if d else "")
        if not desc_ja:
            no_desc.append(eff)
        out.append({
            "item": r["ClassName"],
            "jobId": job["id"],
            "key": mm.get("opt", ""),
            "name": {"ja": ja_names.get(eff, eff), "ko": f"바이보라 비전 - {eff}"},
            "weapon": mm.get("weapon", ""),
            "desc": {"ja": desc_ja, "ko": desc_ko},
        })

    out.sort(key=lambda e: (e["jobId"], e["item"]))
    json.dump({"entries": out}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    classes = len({e["jobId"] for e in out})
    print(f"wrote {OUT}: {len(out)} entries / {classes} classes")
    print(f"  no class link: {len(no_job)} {no_job[:5]}")
    print(f"  no description: {len(no_desc)} {no_desc[:8]}")
    print(f"  (description picked among multiple candidates: {ambiguous})")


if __name__ == "__main__":
    main()
