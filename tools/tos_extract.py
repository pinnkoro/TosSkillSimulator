"""
Tree of Savior IPF/IES extractor.

Reads the game's IPF archives, locates the latest version of the requested
.ies data tables (merging patches so the newest revision wins), and parses
them into row dictionaries.

File-format details (IPF footer/file-table/Pkware, IES header/columns/rows)
are public specifications of IMC's container formats; this is an independent
implementation. The extracted *data* is © IMCGAMES CO., LTD.

Usage:
    python tos_extract.py dump            # inspect columns of skill.ies/job.ies
    python tos_extract.py <name.ies> ...  # print JSON rows for given tables
"""
import struct
import zlib
import os
import sys
import glob
import json
import re

CLIENT_ROOT = r"C:\Program Files (x86)\Steam\steamapps\common\Tree of Savior (Japanese Ver.)"

# ------------------------- IPF -------------------------
_SIG = b"\x50\x4B\x05\x06"
_PKWARE_PW = b"ofO1a0ueXA? [\xffs h %?"
_NO_COMPRESS = {".jpg", ".jpeg", ".mp3", ".fsb", ".ogg", ".wav"}

_CRC = []
for _i in range(256):
    _c = _i
    for _ in range(8):
        _c = (_c >> 1) ^ 0xEDB88320 if _c & 1 else _c >> 1
    _CRC.append(_c & 0xFFFFFFFF)


def _pkware_decrypt(data: bytes) -> bytes:
    keys = [0x12345678, 0x23456789, 0x34567890]

    def upd(v):
        keys[0] = _CRC[(keys[0] ^ v) & 0xFF] ^ (keys[0] >> 8)
        keys[0] &= 0xFFFFFFFF
        keys[1] = (keys[1] + (keys[0] & 0xFF)) & 0xFFFFFFFF
        keys[1] = (keys[1] * 0x08088405 + 1) & 0xFFFFFFFF
        keys[2] = _CRC[(keys[2] ^ ((keys[1] >> 24) & 0xFF)) & 0xFF] ^ (keys[2] >> 8)
        keys[2] &= 0xFFFFFFFF

    for b in _PKWARE_PW:
        upd(b)
    out = bytearray(len(data))
    for i in range(len(data)):
        if i % 2:
            out[i] = data[i]
        else:
            k = (keys[2] & 0xFFFF) | 2
            db = ((k * (k ^ 1)) >> 8) & 0xFF
            v = data[i] ^ db
            upd(v)
            out[i] = v
    return bytes(out)


def _find_footer(f):
    f.seek(0, 2)
    size = f.tell()
    search = min(0x10000, size)
    f.seek(size - search)
    buf = f.read(search)
    start = size - search
    for idx in range(len(buf) - 4, -1, -1):
        if buf[idx:idx + 4] == _SIG:
            fs = start + idx - 12
            if fs < 0:
                continue
            f.seek(fs)
            d = f.read(24)
            if len(d) < 24:
                continue
            file_count = struct.unpack_from("<H", d, 0)[0]
            table_off = struct.unpack_from("<I", d, 2)[0]
            new_version = struct.unpack_from("<I", d, 20)[0]
            if table_off <= size:
                return file_count, table_off, new_version
    return None


def _entries(f, file_count, table_off):
    f.seek(table_off)
    tbl = f.read()
    off = 0
    out = []
    for _ in range(file_count):
        if off + 2 > len(tbl):
            break
        path_len = struct.unpack_from("<H", tbl, off)[0]; off += 2
        off += 4  # checksum
        comp = struct.unpack_from("<I", tbl, off)[0]; off += 4
        uncomp = struct.unpack_from("<I", tbl, off)[0]; off += 4
        data_off = struct.unpack_from("<I", tbl, off)[0]; off += 4
        pack_len = struct.unpack_from("<H", tbl, off)[0]; off += 2
        off += pack_len  # pack file name
        rel = tbl[off:off + path_len].decode("ascii", "replace").replace("\\", "/")
        off += path_len
        out.append((rel, data_off, comp, uncomp))
    return out


def _extract(f, data_off, comp, uncomp, rel, new_version):
    f.seek(data_off)
    raw = f.read(comp)
    if comp == uncomp:
        return raw
    if os.path.splitext(rel)[1].lower() in _NO_COMPRESS:
        return raw
    if new_version > 11000 or new_version == 0:
        raw = _pkware_decrypt(raw)
    try:
        return zlib.decompress(raw, -zlib.MAX_WBITS)
    except zlib.error:
        return raw


def _patch_rank(path):
    m = re.match(r"(\d+)", os.path.basename(path))
    return int(m.group(1)) if m else -1


def find_latest(targets):
    """Return {basename_lower: (archive_path, entry, new_version)} newest-wins."""
    ipfs = glob.glob(os.path.join(CLIENT_ROOT, "data", "*.ipf")) + \
        glob.glob(os.path.join(CLIENT_ROOT, "patch", "*.ipf"))
    # process oldest -> newest so newer overrides
    ipfs.sort(key=lambda p: (_patch_rank(p), p))
    found = {}
    targets = {t.lower() for t in targets}
    for path in ipfs:
        try:
            with open(path, "rb") as f:
                foot = _find_footer(f)
                if not foot:
                    continue
                file_count, table_off, new_version = foot
                for rel, data_off, comp, uncomp in _entries(f, file_count, table_off):
                    base = os.path.basename(rel).lower()
                    if base in targets:
                        found[base] = (path, (rel, data_off, comp, uncomp), new_version)
        except Exception as e:
            print(f"! {os.path.basename(path)}: {e}", file=sys.stderr)
    return found


def read_table(basename):
    found = find_latest([basename])
    hit = found.get(basename.lower())
    if not hit:
        return None
    path, (rel, data_off, comp, uncomp), new_version = hit
    with open(path, "rb") as f:
        blob = _extract(f, data_off, comp, uncomp, rel, new_version)
    return parse_ies(blob), os.path.basename(path)


# ------------------------- IES -------------------------
def _xor(data: bytes) -> str:
    return bytes(b ^ 0x01 if b else 0 for b in data).split(b"\x00")[0].decode("utf-8", "replace")


def parse_ies(data: bytes):
    off = 128  # skip table name
    off += 4   # unk1
    data_offset = struct.unpack_from("<I", data, off)[0]; off += 4
    off += 4   # resource offset
    off += 4   # file size
    off += 2   # unk2
    num_rows = struct.unpack_from("<H", data, off)[0]; off += 2
    num_cols = struct.unpack_from("<H", data, off)[0]; off += 2
    off += 2   # int cols
    num_str_cols = struct.unpack_from("<H", data, off)[0]; off += 2
    off += 2   # unk3
    assert off == 156

    cols = []
    for _ in range(num_cols):
        name = _xor(data[off:off + 64]); off += 64
        off += 64  # name2
        col_type = struct.unpack_from("<H", data, off)[0]; off += 2
        off += 4   # unk1, unk2
        position = struct.unpack_from("<H", data, off)[0]; off += 2
        cols.append((name, col_type, position))
    float_cols = sorted([c for c in cols if c[1] == 0], key=lambda c: c[2])
    str_cols = sorted([c for c in cols if c[1] != 0], key=lambda c: c[2])

    ro = 156 + data_offset
    rows = []
    for _ in range(num_rows):
        if ro + 6 > len(data):
            break
        row = {}
        row["$ID"] = struct.unpack_from("<I", data, ro)[0]; ro += 4
        klen = struct.unpack_from("<H", data, ro)[0]; ro += 2
        row["ClassName"] = _xor(data[ro:ro + klen]) if klen else ""
        ro += klen
        for name, _t, _p in float_cols:
            v = struct.unpack_from("<f", data, ro)[0]; ro += 4
            row[name] = int(v) if v == int(v) else round(v, 4)
        for name, _t, _p in str_cols:
            slen = struct.unpack_from("<H", data, ro)[0]; ro += 2
            row[name] = _xor(data[ro:ro + slen]) if slen else ""
            ro += slen
        ro += num_str_cols  # padding
        rows.append(row)
    return rows


# ------------------------- CLI -------------------------
if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "dump":
        for tbl in ("skill.ies", "job.ies"):
            res = read_table(tbl)
            if not res:
                print(f"=== {tbl}: NOT FOUND ===")
                continue
            rows, src = res
            print(f"=== {tbl}  (from {src}, {len(rows)} rows) ===")
            print("columns:", list(rows[0].keys()) if rows else [])
            for r in rows[:2]:
                print(json.dumps({k: r[k] for k in list(r)[:14]}, ensure_ascii=False))
            print()
    else:
        for tbl in args:
            res = read_table(tbl)
            if res:
                rows, src = res
                print(json.dumps(rows, ensure_ascii=False))
