"""Line-art checks on a rows file: interior lines lying against the black
silhouette outline (they double it), fills touching the background without
an outline, skin touching belly, mouth or shell with no line between, and glare not
enclosed by lens black. Exits nonzero on any finding.
Usage: python3 -I lint.py <rows.txt>"""
import sys
rows = [r for r in open(sys.argv[1]).read().split("\n") if r]
H, W = len(rows), len(rows[0])
at = lambda r, c: rows[r][c] if 0 <= r < H and 0 <= c < W else "."
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
sil = {(r, c) for r in range(H) for c in range(W) if rows[r][c] == "K" and any(at(r + a, c + b) == "." for a, b in N4)}
hug = [(r, c, rows[r][c]) for r in range(H) for c in range(W) if rows[r][c] in "Llk"
       and sum((r + a, c + b) in sil for a, b in N4) >= 2]
open_edge = [(r, c, rows[r][c]) for r in range(H) for c in range(W) if rows[r][c] not in ".KG"
             and any(at(r + a, c + b) == "." for a, b in N4)]
SKIN, OTHER = set("SsH"), set("BbYMmORo")  # belly, mouth, shell, shell rim
no_line = [(r, c) for r in range(H) for c in range(W) if rows[r][c] in SKIN
           and any(at(r + a, c + b) in OTHER for a, b in N4)]
loose_glare = [(r, c) for r in range(H) for c in range(W) if rows[r][c] == "g"
               and any(at(r + a, c + b) not in "Gg" for a, b in N4)]
findings = {"lines against the outline on 2+ sides": hug, "fills touching the background": open_edge,
            "skin touching belly/mouth/shell with no line": no_line, "glare not enclosed by lens black": loose_glare}
for name, cells in findings.items():
    print(f"{name}: {cells}")
sys.exit(1 if any(findings.values()) else 0)
