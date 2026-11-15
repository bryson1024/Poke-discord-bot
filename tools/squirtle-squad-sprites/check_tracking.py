"""Check that the shades move with the head in every frame of a generated GIF.

Usage: python3 check_tracking.py <src.gif> <out.gif> <r,g,b>
<r,g,b> is a color only the shades use (leader: glare 184,192,216; member: navy
32,40,104), so the check can't be fooled by the sprite's own outline. Those
pixels split into a far-lens and a near-lens cluster at the widest gap in x.
For each frame, the source sprite gives how the far side (columns 0-10) and near
side (columns 12-24) of the head moved relative to frame 0; each cluster's
bounding box must have moved by exactly the same amount.
"""
import sys
from PIL import Image, ImageSequence

FAR_COLS, NEAR_COLS = range(0, 11), range(12, 25)


def px(f, x, y):
    if 0 <= x < f.width and 0 <= y < f.height:
        p = f.getpixel((x, y))
        return p[:3] if p[3] else None
    return None


def head_move(f0, f, cols):
    region = [(x, y) for y in range(0, 17) for x in cols]

    def err(dx, dy):
        bad = n = 0
        for x, y in region:
            a, b = px(f0, x, y), px(f, x + dx, y + dy)
            if a is None and b is None:
                continue
            n += 1
            bad += a != b
        return bad / n

    return min(((err(dx, dy), dx, dy) for dx in range(-3, 4) for dy in range(-6, 4)))[1:]


def lens_boxes(f, color):
    pts = [(x, y) for y in range(f.height) for x in range(f.width) if px(f, x, y) == color]
    xs = sorted({x for x, _ in pts})
    gap, split = max((b - a, b) for a, b in zip(xs, xs[1:]))
    if gap < 2:
        raise SystemExit(f"could not split lenses (largest x-gap {gap})")
    box = lambda ps: (min(p[0] for p in ps), min(p[1] for p in ps))
    return box([p for p in pts if p[0] < split]), box([p for p in pts if p[0] >= split])


def expand(out_path, src_durations):
    """Pillow merges identical consecutive frames; re-expand to the source's frames."""
    o = [(f.info.get("duration") or 0, f.convert("RGBA")) for f in ImageSequence.Iterator(Image.open(out_path))]
    expanded, j, left = [], 0, o[0][0]
    for d in src_durations:
        expanded.append(o[j][1])
        left -= d
        if left <= 0 and j + 1 < len(o):
            j += 1
            left = o[j][0]
    return expanded


def main(src, out, color):
    color = tuple(int(v) for v in color.split(","))
    s = [(f.info.get("duration") or 0, f.convert("RGBA")) for f in ImageSequence.Iterator(Image.open(src))]
    o = expand(out, [d for d, _ in s])
    far0, near0 = lens_boxes(o[0], color)
    failures = 0
    for i, ((_, f), g) in enumerate(zip(s, o)):
        fm, nm = head_move(s[0][1], f, FAR_COLS), head_move(s[0][1], f, NEAR_COLS)
        far, near = lens_boxes(g, color)
        got_far = (far[0] - far0[0], far[1] - far0[1])
        got_near = (near[0] - near0[0], near[1] - near0[1])
        if (got_far, got_near) != (fm, nm):
            failures += 1
            print(f"frame {i:2d}: head far {fm} near {nm} | far lens {got_far} near lens {got_near}")
    print("FAIL" if failures else "PASS", f"({failures} of {len(s)} frames off)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main(*sys.argv[1:])
