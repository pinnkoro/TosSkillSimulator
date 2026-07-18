"""
game-data.json が参照するスキル/クラスのアイコンを jTOS クライアントから抽出し、
64px に縮小して public/icons/ へ書き出す。

  スキルアイコン: ui.ipf 内の個別PNG  icon/skill/<系統>/icon_<名前>.png
                 (名前解決は baseskinset/skillicon.xml を正とし、直接検索を補助に使う)
  クラスアイコン: アトラス  icon/class_<系統>.tga を classicon.xml の imgrect で切り出し

出力: public/icons/skill/<icon>.png, public/icons/class/<icon>.png
アイコンは © IMCGAMES CO., LTD.（データ本体と同じ扱いで同梱）。

要: Pillow。ゲーム終了中に実行（IPFが排他ロックされるため）。
"""
import os
import sys
import io
import re
import glob
import json

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import tos_extract as T  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "src", "data", "game-data.json")
OUT_SKILL = os.path.join(ROOT, "public", "icons", "skill")
OUT_CLASS = os.path.join(ROOT, "public", "icons", "class")
OUT_ATTR = os.path.join(ROOT, "public", "icons", "attr")
SIZE = 64        # スキル/クラスアイコンの一辺(px)
ATTR_SIZE = 40   # 特性アイコンの一辺(px、UIで小さく使うので控えめ)


def build_index(png_prefixes, want_basenames, want_xml):
    """ipf を1パス走査。newest-wins で
    - icon/<prefix>/**.png の {basename小文字: entry}
    - want_basenames(小文字) の {basename: entry}   (アトラスtga用)
    - want_xml(相対パス小文字) の {path: bytes}
    を返す。"""
    ipfs = glob.glob(os.path.join(T.CLIENT_ROOT, "data", "*.ipf")) + \
        glob.glob(os.path.join(T.CLIENT_ROOT, "patch", "*.ipf"))
    ipfs.sort(key=lambda p: (T._patch_rank(p), p))
    png_idx = {}
    atlas_idx = {}
    xml_out = {}
    for path in ipfs:
        try:
            with open(path, "rb") as f:
                foot = T._find_footer(f)
                if not foot:
                    continue
                fc, to, nv = foot
                for rel, do, comp, uncomp in T._entries(f, fc, to):
                    low = rel.lower()
                    ent = (path, (rel, do, comp, uncomp), nv)
                    if low.endswith(".png") and any(low.startswith(p) for p in png_prefixes):
                        png_idx[os.path.basename(low)] = ent
                    base = os.path.basename(low)
                    if base in want_basenames:
                        atlas_idx[base] = ent
                    if low in want_xml:
                        xml_out[low] = ent
        except Exception as e:
            print(f"! {os.path.basename(path)}: {e}", file=sys.stderr)
    return png_idx, atlas_idx, xml_out


def extract_bytes(ent):
    path, (rel, do, comp, uncomp), nv = ent
    with open(path, "rb") as f:
        return T._extract(f, do, comp, uncomp, rel, nv)


def save_icon(img, out_path, size=SIZE):
    if img.mode not in ("RGBA", "RGB"):
        img = img.convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, "PNG", optimize=True)


def crop_from_atlases(items, out_dir, atlas_cache, atlas_idx, size):
    """items: [(out_name, (tga_lower, (x,y,w,h)))] を切り出して保存。(ok, missing)。"""
    ok = 0
    missing = []
    for name, (tga, (x, y, w, h)) in items:
        if tga not in atlas_cache:
            ent = atlas_idx.get(tga)
            if not ent:
                missing.append(f"{name}(atlas {tga})")
                continue
            atlas_cache[tga] = Image.open(io.BytesIO(extract_bytes(ent))).convert("RGBA")
        crop = atlas_cache[tga].crop((x, y, x + w, y + h))
        save_icon(crop, os.path.join(out_dir, f"{name}.png"), size)
        ok += 1
    return ok, missing


def parse_classicon(blob):
    """{iconName小文字: (tga_basename_lower, (x,y,w,h))}
    (job.ies の Icon と classicon.xml の name は大小が食い違うため小文字キーで持つ)"""
    txt = blob.decode("utf-8", "replace")
    out = {}
    for m in re.finditer(r'<image\s+name="([^"]+)"\s+file="([^"]+)"\s+imgrect="([^"]+)"', txt):
        name, fpath, rect = m.groups()
        tga = os.path.basename(fpath.replace("\\", "/")).lower()
        x, y, w, h = (int(v) for v in rect.split())
        out[name.lower()] = (tga, (x, y, w, h))
    return out


def parse_skillicon(blob):
    """{iconName(小文字, icon_接頭辞なし): file_basename小文字}"""
    txt = blob.decode("utf-8", "replace")
    out = {}
    for m in re.finditer(r'<image\s+name="([^"]+)"\s+file="([^"]+)"', txt):
        name, fpath = m.groups()
        key = name.lower()
        if key.startswith("icon_"):
            key = key[5:]
        out[key] = os.path.basename(fpath.replace("\\", "/")).lower()
    return out


def main():
    gd = json.load(open(DATA, encoding="utf-8"))
    skill_icons = sorted({s["icon"] for s in gd["skills"].values() if s.get("icon")})
    class_icons = sorted({j["icon"] for j in gd["jobs"] if j.get("icon")})
    attr_icons = sorted(
        {a["icon"] for s in gd["skills"].values()
         for a in s.get("attributes", []) if a.get("icon")}
        | {a["icon"] for j in gd["jobs"]
           for a in j.get("attributes", []) if a.get("icon")}
    )
    print(f"needed: {len(skill_icons)} skill, {len(class_icons)} class, "
          f"{len(attr_icons)} attribute icons")

    want_xml = {"baseskinset/skillicon.xml", "baseskinset/classicon.xml"}
    png_idx, _atlas, xml_ent = build_index(
        png_prefixes=("icon/skill/",),
        want_basenames=set(),
        want_xml=want_xml,
    )
    skillicon_blob = extract_bytes(xml_ent["baseskinset/skillicon.xml"])
    skillicon = parse_skillicon(skillicon_blob)
    # 特性アイコンは skillicon.xml の ability_* エントリがアトラス(tga)+imgrect を持つ。
    skillrects = parse_classicon(skillicon_blob)   # {name小文字: (tga, rect)}
    classmap = parse_classicon(extract_bytes(xml_ent["baseskinset/classicon.xml"]))

    # ---- スキルアイコン ----
    ok = miss = 0
    missing = []
    for name in skill_icons:
        cand = [f"icon_{name}.png".lower(), f"{name}.png".lower()]
        xmlfile = skillicon.get(name.lower())
        if xmlfile:
            cand.insert(0, xmlfile)
        ent = next((png_idx[c] for c in cand if c in png_idx), None)
        if not ent:
            miss += 1
            missing.append(name)
            continue
        try:
            img = Image.open(io.BytesIO(extract_bytes(ent)))
            save_icon(img, os.path.join(OUT_SKILL, f"{name}.png"))
            ok += 1
        except Exception as e:
            miss += 1
            missing.append(f"{name}({e})")
    print(f"skill icons: {ok} written, {miss} missing")
    if missing:
        print("  missing:", missing[:20])

    # ---- クラス + 特性アイコン (アトラス切り出し、アトラス走査は1回に集約) ----
    class_items = [(n, classmap[n.lower()]) for n in class_icons if n.lower() in classmap]
    attr_items = [(n, skillrects[n.lower()]) for n in attr_icons if n.lower() in skillrects]
    class_no_map = [n for n in class_icons if n.lower() not in classmap]
    attr_no_map = [n for n in attr_icons if n.lower() not in skillrects]

    atlas_needed = {tga for _n, (tga, _r) in class_items + attr_items}
    _p, atlas_idx, _x = build_index(
        png_prefixes=(),
        want_basenames=atlas_needed,
        want_xml=set(),
    )
    atlas_cache = {}
    cok, cmiss = crop_from_atlases(class_items, OUT_CLASS, atlas_cache, atlas_idx, SIZE)
    aok, amiss = crop_from_atlases(attr_items, OUT_ATTR, atlas_cache, atlas_idx, ATTR_SIZE)
    print(f"class icons: {cok} written, {len(cmiss) + len(class_no_map)} missing")
    if cmiss or class_no_map:
        print("  missing:", (cmiss + class_no_map)[:20])
    print(f"attribute icons: {aok} written, {len(amiss) + len(attr_no_map)} missing")
    if amiss or attr_no_map:
        print("  missing:", (amiss + attr_no_map)[:20])


if __name__ == "__main__":
    main()
