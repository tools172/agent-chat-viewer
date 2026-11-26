"""Round 2: lighten the magnifier, rebuild the lens bezel in 3D, deepen the bubble.

Changes vs edit_icon_sq.py:
  * cyan ring / handle are lifted (bright + slightly less saturated), contrast kept
  * the lens bezel (the silver annulus between ring and glass) is redrawn at 4x
    with a real bevel: bright inner chamfer, dark groove against the ring,
    top-left specular, and a shadow cast into the glass
  * the bubble is deeper and more saturated; its border gets a crisp 2px keyline
    plus an asymmetric inner bevel (light top rim, dark bottom rim)
  * geometry: rounded square 104 x 97, radius 32, two bars (long + short)

Usage: python src-tauri/icons/drafts/edit_icon_sq2.py [variant]
Variants: j | k | l | m
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import colorsys
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4
OUT_DIR = 'src-tauri/icons/drafts'

COLORS = {
    'j': dict(hue=217, s=(0.97, 0.76), v=(0.70, 0.96), lift=0.38, cn='深湛蓝 · 高对比'),
    'k': dict(hue=221, s=(0.97, 0.80), v=(0.70, 0.97), lift=0.46, cn='宝蓝 · 更深'),
    'l': dict(hue=213, s=(0.95, 0.72), v=(0.75, 0.98), lift=0.40, cn='亮蓝 · 饱和'),
    'm': dict(hue=208, s=(0.96, 0.74), v=(0.68, 0.95), lift=0.48, cn='深湖蓝 · 最接近青'),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'j'
CFG = COLORS[VARIANT]
HUE, CN_NAME, LIFT = CFG['hue'], CFG['cn'], CFG['lift']
OUT_BASE = f'x-{VARIANT}'


def hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
    return (r * 255.0, g * 255.0, b * 255.0)


SB, ST = CFG['s']
VB, VT = CFG['v']
RAMP = [
    (0.00, hsv(HUE, SB, VB)),
    (0.30, hsv(HUE, SB - 0.05, VB + 0.08)),
    (0.62, hsv(HUE, SB - 0.16, 0.93)),
    (0.86, hsv(HUE, ST + 0.02, 0.98)),
    (1.00, hsv(HUE, ST, VT)),
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

# -------------------------------------------------- lighten the magnifier --
hsv_img = np.asarray(Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('HSV')).astype(np.float64)
hh, ss, vv = hsv_img[..., 0], hsv_img[..., 1], hsv_img[..., 2]
hue_deg = hh / 255.0 * 360.0
mag = (hue_deg > 140) & (hue_deg < 215) & (ss > 52)
vv2 = 204.0 + (vv - 204.0) * 1.30          # bring back the tube's own shading
vv2 = vv2 + (255.0 - vv2) * LIFT           # lift towards a lighter cyan
ss2 = ss * 0.88
hsv_img[..., 1] = np.clip(ss2, 0, 255)
hsv_img[..., 2] = np.clip(vv2, 0, 255)
bg = np.asarray(Image.fromarray(hsv_img.astype(np.uint8), 'HSV').convert('RGB')).astype(np.float64)

bg4 = Image.fromarray(bg.astype(np.uint8)).resize((W * K, H * K), Image.LANCZOS)
W4, H4 = bg4.size
bgA = np.asarray(bg4).astype(np.float64)

YY = np.arange(H4)[:, None] / K
XX = np.arange(W4)[None, :] / K
R4 = np.hypot(XX - cx, YY - cy)
ANG = np.arctan2(YY - cy, XX - cx)
F = 0.5 + 0.5 * np.cos(ANG + 2.356)        # 1 at top-left, 0 at bottom-right

# --------------------------------------------- rebuild the lens bezel (3D) --
BEZ_IN, BEZ_OUT = 60.2, 70.3
bu = np.clip((R4 - BEZ_IN) / (BEZ_OUT - BEZ_IN), 0, 1)
PROF_U = np.array([0.00, 0.04, 0.12, 0.28, 0.46, 0.64, 0.80, 0.90, 0.97, 1.00])
PROF_C = np.array([
    [196, 214, 224],
    [254, 255, 255],
    [247, 252, 255],
    [243, 250, 254],
    [232, 243, 249],
    [206, 224, 234],
    [178, 201, 215],
    [138, 172, 190],
    [104, 146, 168],
    [88, 132, 156],
], dtype=float)
prof = np.stack([np.interp(bu, PROF_U, PROF_C[:, c]) for c in range(3)], axis=-1)
prof = prof * (0.89 + 0.11 * F)[..., None]
spec = 0.20 * np.clip((F - 0.55) / 0.45, 0, 1) * np.exp(-((bu - 0.30) / 0.055) ** 2)
spec += 0.07 * np.clip((F - 0.55) / 0.45, 0, 1) * np.exp(-((bu - 0.64) / 0.05) ** 2)
prof = prof * (1 - spec[..., None]) + 255.0 * spec[..., None]
bez_alpha = (np.clip((R4 - BEZ_IN) / 0.6, 0, 1) * np.clip((BEZ_OUT - R4) / 0.6, 0, 1))[..., None]
bgA = bgA * (1 - bez_alpha) + prof * bez_alpha

# shadow the bezel casts into the glass, so the lens reads as recessed
gm = np.clip((BEZ_IN - R4) / 7.5, 0, 1)
gsh = (gm ** 2) * (0.15 + 0.08 * F)
bgA = bgA * (1 - gsh[..., None]) + np.array([124, 152, 172]) * gsh[..., None]

# faint specular sheen on the glass, top-left
sheen = 0.07 * np.exp(-(((XX - (cx - 26)) ** 2 + (YY - (cy - 30)) ** 2)) / (2 * 24.0 ** 2))
bgA = bgA * (1 - sheen[..., None]) + 255.0 * sheen[..., None]
bg4 = Image.fromarray(np.clip(bgA, 0, 255).astype(np.uint8))

# ------------------------------------------------------------- geometry ----
BCX, BCY = 108.3, 106.3
BW, BH = 104.0, 97.0             # close to a square
BR = 32.0                        # ~1/3 of the height
BODY_L, BODY_T = BCX - BW / 2.0, BCY - BH / 2.0
BODY_R, BODY_B = BCX + BW / 2.0, BCY + BH / 2.0

TAIL_BASE_L, TAIL_BASE_R = 83.0, 100.0
TAIL_TIP = (86.0, BODY_B + 8.8)

# fill: vertical gradient, deeper at the bottom
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

# softer, stronger drop shadow on the lens/bezel
sh = np.asarray(mask4.filter(ImageFilter.GaussianBlur(3.0 * K))).astype(np.float64) / 255.0
dy, dx = int(round(2.8 * K)), int(round(1.0 * K))
sh = np.roll(np.roll(sh, dy, axis=0), dx, axis=1)
sh = np.clip(sh, 0, 1)
edge = np.clip((BEZ_OUT - 1.0 - R4) / 2.5, 0, 1)
sh = sh * edge * 0.34
bg_shadow = np.asarray(bg4).astype(np.float64) * (1 - sh[..., None]) + np.array([16, 34, 58]) * sh[..., None]

# crisp dark keyline, slightly lighter at the top
key_px = int(round(1.7 * K))
outer = mask_bin.filter(ImageFilter.MaxFilter(2 * key_px + 1))
key = Image.fromarray(
    (np.asarray(outer).astype(np.int16) - np.asarray(mask_bin).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)
).filter(ImageFilter.GaussianBlur(0.25 * K))
key_rows = np.zeros((H4, 3))
ky = np.clip((np.arange(H4) / K - BODY_T) / BH, 0, 1)
for i in range(H4):
    key_rows[i] = np.array([5, 12, 34]) * ky[i] + np.array([30, 68, 126]) * (1 - ky[i])
key_img = Image.fromarray(key_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))
bubble_bg = Image.composite(key_img, Image.fromarray(np.clip(bg_shadow, 0, 255).astype(np.uint8)), key)
comp = Image.composite(fill_img, bubble_bg, mask4)

# asymmetric inner bevel: bright rim on top, shaded rim at the bottom
bevel_px = int(round(2.6 * K))
inner = mask4.filter(ImageFilter.MinFilter(2 * bevel_px + 1))
t = np.clip((np.arange(H4) / K - BODY_T) / BH, 0, 1)[:, None]
w_light = np.clip((0.72 - t) / 0.72, 0, 1) ** 1.2 * 0.92
w_dark = np.clip((t - 0.32) / 0.68, 0, 1) ** 1.1 * 0.62
bevel_rows = (fill_rows * (1 - w_light - w_dark)
              + np.array([206, 240, 255]) * w_light
              + np.array([4, 18, 56]) * w_dark)
bevel_rows = np.clip(bevel_rows, 0, 255)
bevel = Image.fromarray(bevel_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))
bevel_mask = Image.fromarray(
    (np.asarray(mask4).astype(np.int16) - np.asarray(inner).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
comp = Image.composite(bevel, comp, bevel_mask)

# broad diagonal gloss + strong specular
u = np.clip((XX - BODY_L) / BW, 0, 1)
v = np.clip((YY - BODY_T) / BH, 0, 1)
dg = np.clip(1.0 - 1.05 * (0.62 * u + 0.40 * v), 0, 1) ** 1.5
gl = Image.fromarray((dg * 0.14 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2 * K))
gl_arr = np.asarray(gl).astype(np.int16)
specb = Image.new('L', (W4, H4), 0)
ImageDraw.Draw(specb).ellipse([P(BODY_L + 4, BODY_T + 3), P(BODY_L + 40, BODY_T + 16)], fill=46)
specb = specb.filter(ImageFilter.GaussianBlur(1.6 * K))
gl_arr = np.maximum(gl_arr, np.asarray(specb).astype(np.int16))
gl_mask = Image.fromarray(
    np.clip(gl_arr * (np.asarray(mask4) > 200), 0, 255).astype(np.uint8))
comp = Image.composite(Image.new('RGB', (W4, H4), (232, 248, 255)), comp, gl_mask)

# two bars: one long, one short
LONG, SHORT = 0.55 * BW, 0.31 * BW
THICK, PITCH = 6.2 * K, 22.5 * K
LEFT = (BCX - LONG / 2.0) * K
TOP = (BCY - (PITCH / K + THICK / K) / 2.0) * K
g0 = np.array([252, 253, 254], dtype=float)
g1 = np.array([216, 230, 242], dtype=float)
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
