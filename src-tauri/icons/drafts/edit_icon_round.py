"""Rebuild the chat bubble as a larger rounded square with a bright cyan-blue fill.

The ring, lens and handle stay original pixels. The bubble is drawn at 4x:
  * body close to a rounded square (108 x 95.5, radius 28)
  * two text bars, one long and one short
  * bright blue leaning towards the ring's turquoise, no dark-navy bottom
  * dark keyline + light inner bevel + diagonal gloss, like the source

Usage: python src-tauri/icons/drafts/edit_icon_round.py [variant]
Variants: sky | glacier | lake | cyan
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import colorsys
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4
OUT_DIR = 'src-tauri/icons/drafts'

COLORS = {
    'sky':     (208, '晴空蓝'),
    'glacier': (202, '冰川蓝'),
    'lake':    (197, '湖水蓝'),
    'cyan':    (192, '青碧蓝'),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'glacier'
HUE, CN_NAME = COLORS[VARIANT]
OUT_BASE = f'r-{VARIANT}'


def hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
    return (r * 255.0, g * 255.0, b * 255.0)


# t = 0 at the bubble bottom, 1 at the top
RAMP = [
    (0.00, hsv(HUE, 0.90, 0.92)),
    (0.28, hsv(HUE, 0.78, 0.96)),
    (0.60, hsv(HUE, 0.58, 0.99)),
    (0.85, hsv(HUE, 0.42, 1.00)),
    (1.00, hsv(HUE, 0.36, 1.00)),
]
RAMP_T = np.array([s[0] for s in RAMP])
RAMP_C = np.array([s[1] for s in RAMP], dtype=float)


def ramp(t):
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, RAMP_T, RAMP_C[:, c]) for c in range(3)], axis=-1)


def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


src = Image.open(SRC).convert('RGB')
arr = np.asarray(src).astype(np.float64)
H, W, _ = arr.shape
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
lum = luma(arr)

# ---------------------------------------------------------------- ring fit --
cyan = (b > 120) & (g > 150) & (b > r + 40) & (g > r + 5)
cx, cy = 108.0, 108.4
for _ in range(3):
    ys, xs = np.where(cyan)
    rad = np.hypot(xs - cx, ys - cy)
    m = rad < 95
    xs_, ys_ = xs[m], ys[m]
    ang = np.arctan2(ys_ - cy, xs_ - cx)
    bins = np.linspace(-np.pi, np.pi, 361)
    pts = []
    for i in range(360):
        sel = (ang >= bins[i]) & (ang < bins[i + 1])
        if sel.sum() > 3:
            rr = rad[m][sel]
            pts.append((xs_[sel][np.argmin(rr)], ys_[sel][np.argmin(rr)]))
    pts = np.array(pts, dtype=float)
    A = np.c_[2 * pts[:, 0], 2 * pts[:, 1], np.ones(len(pts))]
    sol, *_ = np.linalg.lstsq(A, (pts ** 2).sum(axis=1), rcond=None)
    cx, cy = sol[0], sol[1]
    R_in = np.sqrt(sol[2] + cx ** 2 + cy ** 2)
print(f'{VARIANT}: ring centre=({cx:.2f},{cy:.2f}) inner R={R_in:.2f}')

# ------------------------------------------------------------- bubble mask --
dist = np.hypot(np.arange(W)[None, :] - cx, np.arange(H)[:, None] - cy)
navy = (lum < 150) & (b > r + 12) & (dist < R_in - 1.2)
sil = np.asarray(Image.fromarray((navy * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0


def outside_mask(mask):
    out = np.zeros_like(mask)
    out[0, :] = ~mask[0, :]
    out[-1, :] = ~mask[-1, :]
    out[:, 0] = ~mask[:, 0]
    out[:, -1] = ~mask[:, -1]
    out &= ~mask
    while True:
        nb = (np.roll(out, 1, 0) | np.roll(out, -1, 0) |
              np.roll(out, 1, 1) | np.roll(out, -1, 1)) & ~mask
        new = out | nb
        if new.sum() == out.sum():
            return out
        out = new


sil = sil | ~outside_mask(sil)

# ----------------------------------------------------------------- inpaint --
grow = np.asarray(Image.fromarray((sil * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
unknown = grow
known = ~unknown
bg = arr.copy()
ys, xs = np.where(unknown)
y0, y1 = ys.min(), ys.max()
for y in range(y0, y1 + 1):
    xk = np.where(known[y])[0]
    if len(xk) < 2:
        continue
    for ch in range(3):
        bg[y, unknown[y], ch] = np.interp(np.where(unknown[y])[0], xk, bg[y, xk, ch])
u = bg.copy()
for _ in range(400):
    nb = (np.roll(u, 1, 0) + np.roll(u, -1, 0) + np.roll(u, 1, 1) + np.roll(u, -1, 1)) / 4.0
    u[unknown] = nb[unknown]
bg = u

# ------------------------------------------------------------- geometry ----
BCX, BCY = 108.3, 107.2          # bubble body centre (slightly above lens centre)
BW, BH = 108.0, 95.5             # rounded-square body
BR = 28.0                        # big, soft corner radius
BODY_L, BODY_T = BCX - BW / 2.0, BCY - BH / 2.0
BODY_R, BODY_B = BCX + BW / 2.0, BCY + BH / 2.0

TAIL_BASE_L, TAIL_BASE_R = 82.5, 100.5
TAIL_TIP = (85.5, BODY_B + 10.6)

bg4 = Image.fromarray(bg.astype(np.uint8)).resize((W * K, H * K), Image.LANCZOS)
W4, H4 = bg4.size

# fill: vertical gradient from bottom (saturated) to top (light)
fill_rows = np.zeros((H * K, 3))
for y4 in range(H * K):
    fill_rows[y4] = ramp((BODY_B - y4 / K) / BH)
fill_img = Image.fromarray(fill_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))


def P(x, y):
    return x * K, y * K


def clamp_pt(xn, yn, margin=2.0):
    dx, dy = xn - cx, yn - cy
    d = float(np.hypot(dx, dy))
    lim = R_in - margin
    if d > lim > 0:
        f = lim / d
        return cx + dx * f, cy + dy * f
    return xn, yn


def tail_shape():
    """Tail with a rounded tip, attached to the flat bottom of the body."""
    A = np.array(P(TAIL_BASE_L, BODY_B))
    B = np.array(P(TAIL_BASE_R, BODY_B))
    C = np.array(P(*clamp_pt(*TAIL_TIP)))
    u = (A - C) / np.linalg.norm(A - C)
    v = (B - C) / np.linalg.norm(B - C)
    theta = float(np.arccos(np.clip(np.dot(u, v), -1, 1)))
    rr = 2.0 * K
    d = rr / np.tan(theta / 2)
    t1, t2 = C + u * d, C + v * d
    bis = u + v
    bis /= np.linalg.norm(bis)
    O = C + bis * (rr / np.sin(theta / 2))
    a1 = float(np.arctan2(t1[1] - O[1], t1[0] - O[0]))
    a2 = float(np.arctan2(t2[1] - O[1], t2[0] - O[0]))
    da = (a1 - a2 + np.pi) % (2 * np.pi) - np.pi
    arc = [tuple(O + rr * np.array([np.cos(a2 + da * k / 12.0),
                                     np.sin(a2 + da * k / 12.0)]))
           for k in range(13)]
    return [tuple(A), tuple(B)] + arc + [tuple(A)]


mask_bin = Image.new('L', (W4, H4), 0)
md = ImageDraw.Draw(mask_bin)
md.rounded_rectangle([P(BODY_L, BODY_T), P(BODY_R, BODY_B)],
                     radius=BR * K, fill=255)
md.polygon(tail_shape(), fill=255)
mask4 = mask_bin.filter(ImageFilter.GaussianBlur(0.8))

# soft drop shadow on the lens
sh = np.asarray(mask4.filter(ImageFilter.GaussianBlur(2.0 * K))).astype(np.float64) / 255.0
dy, dx = int(round(1.8 * K)), int(round(0.6 * K))
sh = np.roll(np.roll(sh, dy, axis=0), dx, axis=1)
sh = np.clip(sh, 0, 1)
dist4 = np.hypot(np.arange(W4)[None, :] / K - cx,
                 np.arange(H4)[:, None] / K - cy)
edge = np.clip((R_in - 0.8 - dist4) / 2.5, 0, 1)
sh = sh * edge
sh = sh[..., None] * 0.22
bg_shadow = np.asarray(bg4).astype(np.float64) * (1 - sh) + np.array([28, 44, 62]) * sh

# dark keyline outside the light bevel
key_px = int(round(1.0 * K))
outer = mask_bin.filter(ImageFilter.MaxFilter(2 * key_px + 1))
key = Image.fromarray(
    (np.asarray(outer).astype(np.int16) - np.asarray(mask_bin).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)
).filter(ImageFilter.GaussianBlur(0.7))
bg_shadow_img = Image.fromarray(np.clip(bg_shadow, 0, 255).astype(np.uint8))
bubble_bg = Image.composite(Image.new('RGB', (W4, H4), (14, 38, 66)), bg_shadow_img, key)
comp = Image.composite(fill_img, bubble_bg, mask4)

# light inner bevel, stronger at the top
bevel_px = int(round(1.5 * K))
inner = mask4.filter(ImageFilter.MinFilter(2 * bevel_px + 1))
yy_native = np.arange(H * K, dtype=float) / K
t = np.clip((yy_native - BODY_T) / BH, 0, 1)[:, None]
s = 0.52 - 0.34 * t
bevel_rows = np.clip(fill_rows * (1 - s) + np.array([236, 248, 255]) * s, 0, 255)
bevel = Image.fromarray(bevel_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))
bevel_mask = Image.fromarray(
    (np.asarray(mask4).astype(np.int16) - np.asarray(inner).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
comp = Image.composite(bevel, comp, bevel_mask)

# broad diagonal gloss + soft specular
Xg = np.arange(W4)[None, :] / K
Yg = np.arange(H4)[:, None] / K
u = np.clip((Xg - BODY_L) / BW, 0, 1)
v = np.clip((Yg - BODY_T) / BH, 0, 1)
dg = np.clip(1.0 - 1.05 * (0.62 * u + 0.40 * v), 0, 1) ** 1.5
gl = Image.fromarray((dg * 0.16 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2 * K))
gl_arr = np.asarray(gl).astype(np.int16)
spec = Image.new('L', (W4, H4), 0)
ImageDraw.Draw(spec).ellipse([P(BODY_L + 4, BODY_T + 3), P(BODY_L + 36, BODY_T + 18)], fill=42)
spec = spec.filter(ImageFilter.GaussianBlur(1.8 * K))
gl_arr = np.maximum(gl_arr, np.asarray(spec).astype(np.int16))
gl_mask = Image.fromarray(
    np.clip(gl_arr * (np.asarray(mask4) > 200), 0, 255).astype(np.uint8))
comp = Image.composite(Image.new('RGB', (W4, H4), (238, 249, 255)), comp, gl_mask)

# two bars: one long, one short, each lit the same way
LONG, SHORT = 0.58 * BW, 0.34 * BW
THICK, PITCH = 5.8 * K, 25.0 * K
LEFT = (BCX - BW / 2.0 + 0.16 * BW) * K
TOP = (BCY - (PITCH + THICK) / (2.0 * K)) * K
g0 = np.array([250, 252, 253], dtype=float)
g1 = np.array([214, 228, 240], dtype=float)
for i, w_native in enumerate((LONG, SHORT)):
    w = int(round(w_native * K))
    yy = int(round(TOP + i * PITCH))
    bh = int(round(THICK)) + 2
    bar_mask = Image.new('L', (w + 2, bh), 0)
    ImageDraw.Draw(bar_mask).rounded_rectangle(
        [0, 0, w, bh - 2], radius=THICK / 2.0, fill=255)
    bar_mask = bar_mask.filter(ImageFilter.GaussianBlur(0.7))
    grad = np.zeros((bh, 3), dtype=float)
    for ry in range(bh):
        f = ry / max(1, bh - 1)
        grad[ry] = g0 * (1 - f) + g1 * f
    bar_img = Image.fromarray(grad.astype(np.uint8)[:, None, :].repeat(w + 2, 1))
    bar_img.putalpha(bar_mask)
    comp.paste(bar_img, (int(LEFT), yy), bar_img)

# --------------------------------------------------------------- output ----
ys, xs = np.where((b > 120) & (g > 150) & (b > r + 40) & (g > r + 5) &
                  (np.arange(W)[None, :] < 220))
art = (int(xs.min()) - 4, int(ys.min()) - 4, int(xs.max()) + 5, int(ys.max()) + 5)

icon = comp.crop(tuple(v * K for v in art))
side = int(round(max(icon.size) * 1.12))
canvas = Image.new('RGB', (side, side), (255, 255, 255))
canvas.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
big = canvas.resize((1024, 1024), Image.LANCZOS)
big = big.filter(ImageFilter.UnsharpMask(radius=2.0, percent=45, threshold=2))
big.save(f'{OUT_DIR}/{OUT_BASE}.png')
big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-512.png')
icon.resize((420, 420), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-preview.png')
print('wrote', OUT_BASE, CN_NAME)
