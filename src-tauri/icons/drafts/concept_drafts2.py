"""Concept drafts, series 2: icons without the magnifier at all.

  a  a stack of message cards          "a log you are flipping through"
  b  a conversation spine with nodes    "a thread of messages"
  c  one bubble split into two tones    "you and the agent"
  d  bubble over a timeline scrubber    "step through the conversation"

Same palette / bevel kit as round 6 so only the idea differs.

Usage: python src-tauri/icons/drafts/concept_drafts2.py [a|b|c|d|all]
"""
from PIL import Image, ImageFilter
import numpy as np
import math
import sys

import concept_drafts as kit

K = kit.K
XX, YY = kit.XX, kit.YY
over = kit.over
blur = kit.blur
rrect = kit.rrect_sdf

DEEP = np.array([22, 74, 168], dtype=float)
DEEPD = np.array([14, 52, 128], dtype=float)
CYAN = np.array([26, 186, 206], dtype=float)
STEEL = np.array([150, 180, 212], dtype=float)
WHITE = np.array([252, 254, 255], dtype=float)


def pill(bg, cx, cy, w, h, rad, col, sh=1.0, grad=1.0):
    d = rrect(XX, YY, cx, cy, w, h, rad)
    a = np.clip(0.5 - d * K, 0, 1)
    bg = over(bg, (16, 30, 58), blur(a, 2.0, 2.2, 2.0) * 0.30 * sh)
    bg = over(bg, (54, 74, 104), blur(a, 4.0, 4.2, 3.4) * 0.16 * sh)
    t = np.clip((cy + h * 0.5 - YY) / h, 0, 1)          # 1 at the top
    rgb = col * (1.0 - grad + grad * (0.80 + 0.42 * t))[..., None]
    spec = np.exp(-((t - 0.30) / 0.11) ** 2) * 0.42
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]
    cont = np.clip(1.0 - (-d) / 0.9, 0, 1)
    rgb = np.clip(rgb * (1 - 0.30 * cont[..., None]), 0, 255)
    return over(bg, rgb, a)


def knob(bg, cx, cy, r, col, sh=1.0):
    dd = np.hypot(XX - cx, YY - cy)
    a = np.clip((r - dd) * K, 0, 1)
    bg = over(bg, (16, 30, 58), blur(a, 1.8, 1.6, 1.8) * 0.32 * sh)
    t = np.clip((cy + r - YY) / (2 * r), 0, 1)
    rgb = col * (0.82 + 0.40 * t)[..., None]
    spec = np.exp(-(((XX - (cx - r * 0.34)) ** 2 + (YY - (cy - r * 0.36)) ** 2))
                  / (2 * (r * 0.34) ** 2)) * 0.55
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]
    cont = np.clip(1.0 - (r - dd) / 0.8, 0, 1)
    rgb = np.clip(rgb * (1 - 0.26 * cont[..., None]), 0, 255)
    return over(bg, rgb, a)


def sheet(bg, cx, cy, w, h, rad, col, sh=1.0):
    d = rrect(XX, YY, cx, cy, w, h, rad)
    a = np.clip(0.5 - d * K, 0, 1)
    bg = over(bg, (18, 32, 60), blur(a, 1.2, 2.8, 2.2) * 0.26 * sh)
    bg = over(bg, (54, 74, 104), blur(a, 4.4, 5.4, 4.2) * 0.20 * sh)
    edge = np.clip(1.0 - (-d) / 0.9, 0, 1)
    rgb = np.array(col, float) * (1 - 0.16 * edge[..., None])
    rgb = rgb + 255.0 * (np.clip(1.0 - (-d) / 2.4, 0, 1) ** 2 * 0.10)[..., None]
    return over(bg, np.clip(rgb, 0, 255), a)


def tri(bg, pts, col, a_scale=1.0):
    d = kit.poly_sdf(XX, YY, pts)
    a = np.clip(0.5 - d * K, 0, 1) * a_scale
    return over(bg, col, a)


# ---------------------------------------------------------------------------
def concept_a():
    bg = kit.page()
    bg = sheet(bg, 88, 82, 92, 64, 16, (222, 234, 246))
    bg = sheet(bg, 95, 88, 98, 70, 17, (204, 222, 240))
    bg = sheet(bg, 101, 95, 102, 74, 18, (186, 210, 234))
    rows = [(110, 92, 66, 7, 3.5), (100, 110, 46, 7, 3.5)]
    bg = kit.card(bg, 110, 104, 108, 80, 20, (78, 100, 145, (74, 159)), rows)
    return bg


def concept_b():
    bg = kit.page()
    # tails first, so the pills cover their junction
    for pts in (((113, 62), (113, 78), (105, 70)),
                ((95, 96), (95, 112), (103, 104)),
                ((113, 130), (113, 146), (105, 138))):
        bg = tri(bg, list(pts), DEEPD)
    bg = pill(bg, 104, 104, 11, 100, 5.5, STEEL, grad=0.55)
    bg = pill(bg, 140, 70, 54, 24, 12, DEEP)
    bg = pill(bg, 68, 104, 54, 24, 12, DEEP)
    bg = pill(bg, 136, 138, 46, 24, 12, DEEP)
    for y in (70, 104, 138):
        bg = knob(bg, 104, y, 5.5, CYAN)
    return bg


def concept_c():
    bg = kit.page()
    cx, cy, w, h = 110, 100, 120, 88
    rows = [(104, 86, 56, 7, 3.5), (128, 114, 40, 7, 3.5)]
    bg = kit.card(bg, cx, cy, w, h, 22, (74, 96, 144, (70, 158)), rows)
    d_face = rrect(XX, YY, cx, cy, w, h, 22)
    d = kit.smin(d_face, kit.poly_sdf(XX, YY, kit.tail_poly(74, 96, 144, (70, 158))), 2.4)
    a_face = np.clip(0.5 - d * K, 0, 1)
    split = (XX - cx) * 0.62 + (YY - cy) * 0.78
    m = np.clip(0.5 - split * K, 0, 1) * a_face
    bg = over(bg, (96, 214, 228), m * 0.72)
    seam = np.exp(-(split / 0.55) ** 2) * a_face
    bg = over(bg, (26, 92, 150), seam * 0.30)
    return bg


def concept_d():
    bg = kit.page()
    rows = [(110, 82, 62, 7, 3.5), (98, 100, 40, 7, 3.5)]
    bg = kit.card(bg, 110, 92, 112, 72, 20, (78, 98, 128, (74, 142)), rows)
    bg = pill(bg, 110, 162, 108, 11, 5.5, (198, 216, 234), grad=0.5)
    bg = pill(bg, 86, 162, 58, 11, 5.5, CYAN, grad=0.5)
    bg = knob(bg, 115, 162, 11.5, WHITE)
    bg = tri(bg, [(112.5, 156.5), (112.5, 167.5), (120.5, 162.0)], CYAN)
    return bg


CONCEPTS = {'a': concept_a, 'b': concept_b, 'c': concept_c, 'd': concept_d}


def save(name, bg):
    comp = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    side = max(comp.size)
    sq = Image.new('RGB', (side, side), (255, 255, 255))
    sq.paste(comp, ((side - comp.width) // 2, (side - comp.height) // 2))
    big = sq.resize((1024, 1024), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.6, percent=32, threshold=2))
    big.save(f'{kit.OUT_DIR}/{name}.png')
    big.resize((512, 512), Image.LANCZOS).save(f'{kit.OUT_DIR}/{name}-512.png')
    print('wrote', name)


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for key, fn in CONCEPTS.items():
        if which in ('all', key):
            save(f'd-{key}', fn())
