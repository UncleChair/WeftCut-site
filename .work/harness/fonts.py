#!/usr/bin/env python
"""Build the site's self-hosted Maple Mono CN web fonts.

Maple Mono ships no CN woff2 and no CN variable font — the CN builds are
17 MB static TTFs. So we subset them ourselves, and split each weight into two
faces by unicode-range: a latin face every visitor pays for, and a CJK face only
the Chinese page ever downloads.

The CJK charset is exact — built from the Chinese copy actually on the page. A
full common-hanzi subset costs ~900 KB per weight; the exact set costs ~240 KB.
That means the fonts MUST be rebuilt whenever the Chinese copy changes; the
script fails loudly rather than shipping a font with holes in it.

    python .work/harness/fonts.py           # build
    python .work/harness/fonts.py --check   # verify committed fonts are current

Requires fontTools + brotli:  python -m pip install fonttools brotli
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import urllib.request
import zipfile

VERSION = "v7.9"
ARCHIVE = "MapleMono-CN-unhinted.zip"
RELEASE = "https://github.com/subframe7536/maple-font/releases/download/%s/%s" % (VERSION, ARCHIVE)

SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(SITE, ".work", "fonts", VERSION)
OUT = os.path.join(SITE, "assets", "fonts")

# (output suffix, source face). h1/h2 are weight 400 with italic <em>; h3 is 600;
# the mono labels run 500/600; one rule uses 700.
FACES = [
    ("400", "Regular"),
    ("400i", "Italic"),
    ("500", "Medium"),
    ("600", "SemiBold"),
    ("700", "Bold"),
]

# Only these weights get a CJK face — at ~240 KB each, five would be absurd.
# CSS weight matching folds 500 into 400 and 600/650 into 700 for CJK runs.
CJK_FACES = ["400", "700"]

# Anything that can put a latin glyph on screen: the markup, the script's string
# literals, and the transcript the log panel fetches at runtime.
LATIN_SOURCES = ["index.html", "index.js", "assets/agent-session.json"]
# Anything carrying Chinese copy. Missing files are skipped — the zh page is
# generated, so a clean checkout may not have it yet.
CJK_SOURCES = ["zh/index.html", "i18n/zh.json"]

CJK_RANGE = (
    "U+2E80-2EFF,U+3000-303F,U+3200-33FF,U+3400-4DBF,U+4E00-9FFF,"
    "U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF"
)


def log(msg):
    print(msg, flush=True)


def ensure_sources():
    """Download + extract the CN TTFs we need. ~88 MB, cached, never committed."""
    needed = [os.path.join(SRC, "MapleMono-CN-%s.ttf" % face) for _, face in FACES]
    if all(os.path.exists(p) for p in needed):
        return
    os.makedirs(SRC, exist_ok=True)
    log("fetching %s (~140 MB, one time)…" % ARCHIVE)
    with urllib.request.urlopen(RELEASE) as resp:
        blob = resp.read()
    z = zipfile.ZipFile(io.BytesIO(blob))
    for _, face in FACES:
        member = "MapleMono-CN-%s.ttf" % face
        with z.open(member) as src, open(os.path.join(SRC, member), "wb") as fh:
            fh.write(src.read())
        log("  extracted %s" % member)
    with z.open("LICENSE.txt") as src:
        license_text = src.read()
    os.makedirs(OUT, exist_ok=True)
    # OFL-1.1 requires the licence travel with the font files.
    with open(os.path.join(OUT, "LICENSE-MapleMono.txt"), "wb") as fh:
        fh.write(license_text)


def read_sources(rels):
    text = ""
    seen = []
    for rel in rels:
        path = os.path.join(SITE, rel.replace("/", os.sep))
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            text += fh.read()
        seen.append(rel)
    return text, seen


def latin_charset():
    text, seen = read_sources(LATIN_SOURCES)
    chars = set(text)
    # Keep the printable ASCII + Latin-1 baseline whatever the copy says, so an
    # ordinary copy edit can never punch a hole in the shipped subset.
    chars |= {chr(c) for c in range(0x20, 0x7F)}
    chars |= {chr(c) for c in range(0xA0, 0x100)}
    chars -= set("\r\n\t")
    chars = {c for c in chars if not is_cjk(c)}
    return "".join(sorted(chars)), seen


def is_cjk(ch):
    c = ord(ch)
    return (
        0x2E80 <= c <= 0x2EFF or 0x3000 <= c <= 0x303F or 0x3200 <= c <= 0x33FF
        or 0x3400 <= c <= 0x4DBF or 0x4E00 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF
        or 0xFE30 <= c <= 0xFE4F or 0xFF00 <= c <= 0xFFEF
    )


def cjk_charset():
    text, seen = read_sources(CJK_SOURCES)
    # Strip tags and entities so markup can't drag glyphs into the subset.
    text = re.sub(r"<[^>]*>", " ", text)
    chars = {c for c in text if is_cjk(c)}
    return "".join(sorted(chars)), seen


def subset(src, dest, text):
    cmd = [
        sys.executable, "-m", "fontTools.subset", src,
        "--output-file=" + dest,
        "--flavor=woff2",
        # No ligatures: Maple's calt/liga lookups cost +24 KB per face, and code
        # ligatures in marketing prose are a liability. ccmp/mark keep diacritics
        # composing correctly.
        "--layout-features=ccmp,mark,mkmk",
        "--desubroutinize",
        "--no-hinting",
        "--drop-tables+=DSIG",
        "--name-IDs=1,2,3,4,6",
        "--text=" + text,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return os.path.getsize(dest)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed fonts don't match current copy")
    args = ap.parse_args()

    ensure_sources()
    os.makedirs(OUT, exist_ok=True)

    latin, latin_seen = latin_charset()
    cjk, cjk_seen = cjk_charset()
    log("latin charset: %d glyphs  from %s" % (len(latin), ", ".join(latin_seen)))
    if cjk:
        log("cjk charset  : %d glyphs  from %s" % (len(cjk), ", ".join(cjk_seen)))
    else:
        log("cjk charset  : 0 glyphs - no Chinese copy found, skipping CJK faces")

    manifest = {"version": VERSION, "latin": len(latin), "cjk": len(cjk), "files": {}}
    total = 0
    for suffix, face in FACES:
        src = os.path.join(SRC, "MapleMono-CN-%s.ttf" % face)

        name = "maple-latin-%s.woff2" % suffix
        size = subset(src, os.path.join(OUT, name), latin)
        manifest["files"][name] = size
        total += size
        log("  %-24s %7.1f KB" % (name, size / 1024))

        if cjk and suffix in CJK_FACES:
            name = "maple-cjk-%s.woff2" % suffix
            size = subset(src, os.path.join(OUT, name), cjk)
            manifest["files"][name] = size
            total += size
            log("  %-24s %7.1f KB" % (name, size / 1024))

    log("total %.1f KB  (latin-only pages download %.1f KB)"
        % (total / 1024, sum(v for k, v in manifest["files"].items() if "latin" in k) / 1024))

    path = os.path.join(OUT, "manifest.json")
    if args.check:
        with open(path, encoding="utf-8") as fh:
            if json.load(fh) != manifest:
                log("FAIL: committed fonts are stale — run `python .work/harness/fonts.py`")
                return 1
        log("OK: committed fonts match current copy")
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
