"""The 34px-tall version (head top level with Ash's waist), drawn by hand on a
32x34 grid. resample.py's 34-row output set the layout; at this size every
line had to be placed by hand. Shading is drawn in (shade.py isn't used).
Usage: python3 -I draw34.py <rows.txt>"""
import sys

def row(*spans):
    """spans: (first col, chars) pairs; everything else is background."""
    cells = ["."] * 32
    for c, s in spans:
        for i, ch in enumerate(s):
            cells[c + i] = ch
    return "".join(cells)

ROWS = [
    row((17, "KKKKKK")),                                                    # 0  head top
    row((15, "KKHHHSSSK")),                                                 # 1
    row((13, "G.KHHSSSSSsK")),                                              # 2  lens tip
    row((13, "GGGSSSSSSSSsK")),                                             # 3
    row((12, "KGGGGGSSSSSSSsK")),                                           # 4  far lens slopes down to the bridge
    row((12, "KsGGggGGGGGGGGGG")),                                          # 5  bridge and near lens top
    row((12, "KsGggGGGGGGggGG")),                                           # 6  glare bands
    row((11, "KsSSGGGGSSGggGGK")),                                          # 7  skin shows under the bridge
    row((11, "KsSSSSSSSSSGGGsK")),                                          # 8
    row((11, "KsLLLLLSSSSSSsK")),                                           # 9  upper lip
    row((10, "KKLLMMMMLLLLSSsK")),                                          # 10 open mouth
    row((8, "KKHHSkmMMMMMMMLLsK")),                                         # 11
    row((6, "KKHHSSSkkkkMMMMMMMK")),                                        # 12
    row((5, "KHHSSSSSkbbbkkkkkkkKKK")),                                     # 13 jaw line
    row((5, "KSSSSSSSkbbbbbbbbbbkHSK")),                                    # 14
    row((4, "KSSSSSSSSkYYYBBBlYYBBkSSK")),                                  # 15
    row((4, "KsSSSssskBYYBBBBlBBBBBkSSK")),                                 # 16
    row((5, "KKKLLLkBlYYBBBBlBBBBBksSSK")),                                 # 17
    row((7, "KOORlBBlBBBBBlBBBBbKKSSK")),                                   # 18 shell, rim
    row((7, "KOORlBBBllllllBBBBbK.KSK")),                                   # 19
    row((7, "KOORlBBBlBBBBBlllllK..K")),                                    # 20
    row((1, "KKKKKKKOORlBBlBBBBBBlBBBbK")),                                 # 21 tail top
    row((1, "KHHHSSLOLRlBlBBBBBBBlBBBbK")),                                 # 22
    row((0, "KHSSSSSSLSkkkkkBBBBBBlBBBbK")),                                # 23 leg top
    row((0, "KSSLLLSSLSHHHSkBBBBlllBBBbK")),                                # 24 tail curl
    row((0, "KSLHHSLSLSSSSSSkBBlBBBlBBkSK")),                               # 25
    row((0, "KSLsLsLsLSSSSSSkBlBBBBlBkHHSK")),                              # 26
    row((0, "KssLLLssLSSSSSskbbbbbbbksSSSK")),                              # 27
    row((1, "KssssssLSSSSSskbbbbKKksSSSSK")),                               # 28
    row((2, "KKKKKKSSSSSSskbKKK.KsSSSSSK")),                                # 29
    row((6, "KKSSSSSsKKK.....KsSSSSK")),                                    # 30
    row((8, "KSSSsK.........KsSSSK")),                                      # 31
    row((7, "KSSSSsK..........KSSSSK")),                                    # 32
    row((7, "KKKKKKK..........KKKKKK")),                                    # 33 feet
]
assert len(ROWS) == 34 and all(len(r) == 32 for r in ROWS)
open(sys.argv[1], "w").write("\n".join(ROWS) + "\n")
