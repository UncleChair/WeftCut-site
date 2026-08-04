#!/usr/bin/env python
"""Build the one web font the site ships: the Chinese heading face.

The Latin display face is Georgia, a system font. It carries no Han glyphs, so
without this the Chinese page's headings resolve to whatever the OS supplies —
Songti SC on macOS, SimSun on Windows, a coin toss on Linux. Self-hosting one
subset makes the headline look the same everywhere.

The face is 霞鹜文楷 GB Medium (LXGW WenKai GB, OFL-1.1). GB, not the original:
the original derives from FONTWORKS' Klee One and carries Japanese glyph forms
for most shared characters — 46 of the 71 in this page's h1/h2 differ. Medium
because Georgia is a sturdy low-contrast serif, and the Regular cut reads thin
beside it on a dark background.

The subset is CJK-only, so Latin inside a heading still falls through to
Georgia. It is also exact — built from the Chinese copy actually on the page —
so the font MUST be rebuilt when that copy changes. --check is the CI guard.

    python .work/harness/fonts.py           # build
    python .work/harness/fonts.py --check   # verify the committed font is current

Requires fontTools + brotli:  python -m pip install fonttools brotli

The reverted Maple Mono CN whole-page pipeline lives in git history, should it
ever come back: `git show f467d9c:.work/harness/fonts.py`.
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

VERSION = "v1.522"
TTF = "LXGWWenKaiGB-Medium.ttf"
RELEASE = "https://github.com/lxgw/LxgwWenkaiGB/releases/download/%s/%s" % (VERSION, TTF)
LICENSE_URL = "https://raw.githubusercontent.com/lxgw/LxgwWenkaiGB/main/OFL.txt"

SITE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(SITE, ".work", "fonts", "lxgw-" + VERSION)
OUT = os.path.join(SITE, "assets", "fonts")
FACE = "wenkai-gb-medium.woff2"

# Every element that resolves to var(--serif) is weight 400, so one face covers
# the lot: h1/h2, .finale-line, .oss-card h3 and .faq-list h3. Matching all
# h1/h2/h3 plus .finale-line is a deliberate superset — it costs a few KB and
# means moving a heading between --serif and --sans can't punch a hole in the
# subset.
SERIF_PATTERNS = [
    r"<h[123][^>]*>(.*?)</h[123]>",
    r'<p class="finale-line"[^>]*>(.*?)</p>',
]

CJK_RANGE = (
    "U+2E80-303F, U+3200-33FF, U+3400-4DBF, U+4E00-9FFF, "
    "U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF"
)

# Punctuation the copy could plausibly gain without anyone thinking to rebuild.
PUNCT = "，。、；：？！「」『』（）《》〈〉【】——…·　"


def log(msg):
    print(msg, flush=True)


def is_cjk(ch):
    c = ord(ch)
    return (
        0x2E80 <= c <= 0x2EFF or 0x3000 <= c <= 0x303F or 0x3200 <= c <= 0x33FF
        or 0x3400 <= c <= 0x4DBF or 0x4E00 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF
        or 0xFE30 <= c <= 0xFE4F or 0xFF00 <= c <= 0xFFEF
    )


def ensure_source():
    path = os.path.join(SRC, TTF)
    if os.path.exists(path):
        return path
    os.makedirs(SRC, exist_ok=True)
    log("fetching %s (~25 MB, one time)…" % TTF)
    with urllib.request.urlopen(RELEASE) as resp:
        blob = resp.read()
    # The release serves the bare TTF, but tolerate a zipped asset too.
    if blob[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(blob))
        blob = z.read(next(n for n in z.namelist() if n.endswith(TTF)))
    with open(path, "wb") as fh:
        fh.write(blob)
    return path


def ensure_license():
    # OFL-1.1 requires the licence travel with the font.
    dest = os.path.join(OUT, "LICENSE-LXGWWenKaiGB.txt")
    if os.path.exists(dest):
        return
    os.makedirs(OUT, exist_ok=True)
    with urllib.request.urlopen(LICENSE_URL) as resp:
        text = resp.read()
    with open(dest, "wb") as fh:
        fh.write(text)


def charset():
    path = os.path.join(SITE, "zh", "index.html")
    if not os.path.exists(path):
        log("zh/index.html is missing — run `npm run build` first")
        sys.exit(1)
    html = open(path, encoding="utf-8").read()
    text = ""
    for pattern in SERIF_PATTERNS:
        for match in re.findall(pattern, html, re.S):
            text += re.sub(r"<[^>]*>", " ", match) + " "
    chars = {c for c in text if is_cjk(c)} | set(PUNCT)
    return "".join(sorted(chars))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed font doesn't match current copy")
    args = ap.parse_args()

    src = ensure_source()
    ensure_license()
    os.makedirs(OUT, exist_ok=True)

    text = charset()
    log("heading charset: %d CJK glyphs" % len(text))

    dest = os.path.join(OUT, FACE)
    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", src,
            "--output-file=" + dest,
            "--flavor=woff2",
            "--layout-features=ccmp,mark,mkmk",
            "--desubroutinize",
            "--no-hinting",
            "--drop-tables+=DSIG",
            "--name-IDs=1,2,3,4,6",
            "--text=" + text,
        ],
        check=True,
        capture_output=True,
    )
    size = os.path.getsize(dest)
    log("  %-24s %6.1f KB" % (FACE, size / 1024))

    manifest = {"source": TTF, "version": VERSION, "glyphs": len(text), FACE: size}
    path = os.path.join(OUT, "manifest.json")
    if args.check:
        with open(path, encoding="utf-8") as fh:
            if json.load(fh) != manifest:
                log("FAIL: committed font is stale — run `python .work/harness/fonts.py`")
                return 1
        log("OK: committed font matches current copy")
        return 0
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
