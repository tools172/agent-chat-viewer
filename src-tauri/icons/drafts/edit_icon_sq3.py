"""Round 3: real 3D tube for the ring, deeper shading for the bubble.

  * cyan ring is redrawn at 4x as a proper torus: dark inner/outer contours,
    broad bright band, top-left specular; slightly thicker and more saturated
  * lens bezel + glass shadow kept (stronger specular), glass gets a soft sheen
  * bubble: smaller to keep a clear frame, thicker keyline, wider inner bevel,
    strong top-lit gradient so the 3D survives at 32/16 px
  * handle recoloured to match the new ring

Usage: python src-tauri/icons/drafts/edit_icon_sq3.py [variant]
Variants: n | o | p | q
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import colorsys
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4
OUT_DIR = 'src-tauri/icons/drafts'

COLORS = {
    # stops: (t, hue, sat, val); t = 0 bottom, 1 top. Hue shifts cyan->violet
    'n': dict(stops=[(0.00, 222, 0.98, 0.60), (0.22, 219, 0.96, 0.72),
                     (0.50, 214, 0.90, 0.84), (0.75, 208, 0.80, 0.90),
                     (1.00, 204, 0.68, 0.92)], cn='霓虹蓝 · 青到紫'),
    'o': dict(stops=[(0.00, 218, 0.98, 0.56), (0.22, 215, 0.96, 0.69),
                     (0.50, 211, 0.91, 0.83), (0.75, 206, 0.81, 0.90),
                     (1.00, 201, 0.68, 0.93)], cn='钴蓝 · 偏青'),
    'p': dict(stops=[(0.00, 226, 0.97, 0.62), (0.22, 223, 0.95, 0.74),
                     (0.50, 218, 0.89, 0.85), (0.75, 213, 0.78, 0.91),
                     (1.00, 209, 0.65, 0.93)], cn='星蓝 · 偏紫'),
    'q': dict(stops=[(0.00, 220, 0.94, 0.66), (0.22, 217, 0.91, 0.76),
                     (0.50, 212, 0.84, 0.87), (0.75, 207, 0.74, 0.92),
                     (1.00, 203, 0.62, 0.94)], cn='水晶蓝 · 更亮'),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'n'
CFG = COLORS[VARIANT]
CN_NAME = CFG['cn']
OUT_BASE = f'y-{VARIANT}'


def hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
    return (r * 255.0, g * 255.0, b * 255.0)


STOPS = CFG['stops']
STOP_T = np.array([s[0] for s in STOPS])
STOP_H = np.array([s[1] for s in STOPS], dtype=float)
STOP_S = np.array([s[2] for s in STOPS], dtype=float)
STOP_V = np.array([s[3] for s in STOPS], dtype=float)


def hsv_array(h, s, v):
    """Vectorised HSV (h in degrees, s/v in 0..1) -> RGB 0..255."""
    h = (np.asarray(h, dtype=float) % 360.0) / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1) * 255.0


def ramp(t):
    t = np.clip(t, 0, 1)
    h = np.interp(t, STOP_T, STOP_H)
    s = np.interp(t, STOP_T, STOP_S)
    v = np.interp(t, STOP_T, STOP_V)
    return hsv_array(h, s, v)


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

# ------------------------------------------------ recolour the cyan parts --
hsv_img = np.asarray(Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).convert('HSV')).astype(np.float64)
hh, ss, vv = hsv_img[..., 0], hsv_img[..., 1], hsv_img[..., 2]
hue_deg = hh / 255.0 * 360.0
mag = (hue_deg > 140) & (hue_deg < 215) & (ss > 52)
hsv_img[..., 0] = np.where(mag, 186 * 255.0 / 360.0, hh)
hsv_img[..., 1] = np.where(mag, np.clip(ss * 1.15, 0, 235), ss)
hsv_img[..., 2] = np.where(mag, np.clip(vv + (255 - vv) * 0.22, 0, 255), vv)
bg = np.asarray(Image.fromarray(hsv_img.astype(np.uint8), 'HSV').convert('RGB')).astype(np.float64)

bg4 = Image.fromarray(bg.astype(np.uint8)).resize((W * K, H * K), Image.LANCZOS)
W4, H4 = bg4.size
bgA = np.asarray(bg4).astype(np.float64)

YY = np.arange(H4)[:, None] / K
XX = np.arange(W4)[None, :] / K
R4 = np.hypot(XX - cx, YY - cy)
ANG = np.arctan2(YY - cy, XX - cx)
F = 0.5 + 0.5 * np.cos(ANG + 2.356)        # 1 at top-left, 0 at bottom-right

# ------------------------------------------------- redraw the ring as a tube --
RING_IN, RING_OUT = 68.8, 86.4
ru = np.clip((R4 - RING_IN) / (RING_OUT - RING_IN), 0, 1)
RING_U = np.array([0.00, 0.06, 0.16, 0.30, 0.44, 0.60, 0.75, 0.88, 1.00])
RING_C = np.array([
    [24, 120, 146],
    [50, 184, 208],
    [88, 228, 246],
    [140, 250, 255],
    [112, 236, 250],
    [84, 218, 238],
    [62, 194, 218],
    [42, 168, 194],
    [22, 128, 154],
], dtype=float)
ring = np.stack([np.interp(ru, RING_U, RING_C[:, c]) for c in range(3)], axis=-1)
ring = ring * (0.90 + 0.12 * F)[..., None]
rspec = 0.12 * np.clip((F - 0.40) / 0.60, 0, 1) * np.exp(-((ru - 0.28) / 0.08) ** 2)
ring = ring * (1 - rspec[..., None]) + 255.0 * rspec[..., None]
ring_alpha = (np.clip((R4 - RING_IN) / 0.7, 0, 1) * np.clip((RING_OUT - R4) / 0.9, 0, 1))[..., None]
bgA = bgA * (1 - ring_alpha) + ring * ring_alpha

# --------------------------------------------- rebuild the lens bezel (3D) --
BEZ_IN, BEZ_OUT = 58.4, 68.8
bu = np.clip((R4 - BEZ_IN) / (BEZ_OUT - BEZ_IN), 0, 1)
PROF_U = np.array([0.00, 0.04, 0.12, 0.28, 0.46, 0.64, 0.80, 0.90, 0.97, 1.00])
PROF_C = np.array([
    [196, 214, 224],
    [254, 255, 255],
    [247, 252, 255],
    [243, 250, 254],
    [232, 243, 249],
    [204, 222, 232],
    [172, 196, 212],
    [134, 168, 187],
    [100, 143, 165],
    [86, 130, 154],
], dtype=float)
prof = np.stack([np.interp(bu, PROF_U, PROF_C[:, c]) for c in range(3)], axis=-1)
prof = prof * (0.89 + 0.11 * F)[..., None]
spec = 0.24 * np.clip((F - 0.50) / 0.50, 0, 1) * np.exp(-((bu - 0.30) / 0.055) ** 2)
spec += 0.07 * np.clip((F - 0.50) / 0.50, 0, 1) * np.exp(-((bu - 0.64) / 0.05) ** 2)
prof = prof * (1 - spec[..., None]) + 255.0 * spec[..., None]
bez_alpha = (np.clip((R4 - BEZ_IN) / 0.6, 0, 1) * np.clip((BEZ_OUT - R4) / 0.6, 0, 1))[..., None]
bgA = bgA * (1 - bez_alpha) + prof * bez_alpha

# glass: gentle vignette, shadow cast by the bezel, top-left sheen
gv = np.clip(R4 / BEZ_IN, 0, 1) ** 2
bgA = bgA * (1 - (gv * 0.05)[..., None]) + np.array([198, 216, 228]) * (gv * 0.05)[..., None]
gm = np.clip((BEZ_IN - R4) / 7.5, 0, 1)
gsh = (gm ** 2) * (0.16 + 0.08 * F)
bgA = bgA * (1 - gsh[..., None]) + np.array([120, 150, 170]) * gsh[..., None]
sheen = 0.12 * np.exp(-(((XX - (cx - 24)) ** 2 + (YY - (cy - 28)) ** 2)) / (2 * 26.0 ** 2))
bgA = bgA * (1 - sheen[..., None]) + 255.0 * sheen[..., None]
bg4 = Image.fromarray(np.clip(bgA, 0, 255).astype(np.uint8))

# ------------------------------------------------------------- geometry ----
BCX, BCY = 108.3, 104.6
BW, BH = 94.0, 88.0              # close to a square
BR = 29.0                        # ~1/3 of the height
BODY_L, BODY_T = BCX - BW / 2.0, BCY - BH / 2.0
BODY_R, BODY_B = BCX + BW / 2.0, BCY + BH / 2.0

TAIL_BASE_L, TAIL_BASE_R = 84.0, 99.0
TAIL_TIP = (86.5, BODY_B + 6.4)

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

# drop shadow on the lens/bezel
sh = np.asarray(mask4.filter(ImageFilter.GaussianBlur(3.4 * K))).astype(np.float64) / 255.0
dy, dx = int(round(3.0 * K)), int(round(1.0 * K))
sh = np.roll(np.roll(sh, dy, axis=0), dx, axis=1)
sh = np.clip(sh, 0, 1)
edge = np.clip((BEZ_OUT - 1.0 - R4) / 2.5, 0, 1)
sh = sh * edge * 0.38
bg_shadow = np.asarray(bg4).astype(np.float64) * (1 - sh[..., None]) + np.array([12, 30, 56]) * sh[..., None]

# thick, crisp keyline
key_px = int(round(3.2 * K))
outer = mask_bin.filter(ImageFilter.MaxFilter(2 * key_px + 1))
key = Image.fromarray(
    (np.asarray(outer).astype(np.int16) - np.asarray(mask_bin).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)
).filter(ImageFilter.GaussianBlur(0.3 * K))
key_rows = np.zeros((H4, 3))
ky = np.clip((np.arange(H4) / K - BODY_T) / BH, 0, 1)
for i in range(H4):
    key_rows[i] = np.array([4, 10, 28]) * ky[i] + np.array([34, 78, 150]) * (1 - ky[i])
key_img = Image.fromarray(key_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))
bubble_bg = Image.composite(key_img, Image.fromarray(np.clip(bg_shadow, 0, 255).astype(np.uint8)), key)
comp = Image.composite(fill_img, bubble_bg, mask4)

# wide asymmetric inner bevel: bright top rim, deep bottom rim
bevel_px = int(round(4.6 * K))
inner = mask4.filter(ImageFilter.MinFilter(2 * bevel_px + 1))
t = np.clip((np.arange(H4) / K - BODY_T) / BH, 0, 1)[:, None]
w_light = np.clip((0.74 - t) / 0.74, 0, 1) ** 1.15 * 0.68
w_dark = np.clip((t - 0.30) / 0.70, 0, 1) ** 1.05 * 0.72
bevel_rows = (fill_rows * np.clip(1 - w_light - w_dark, 0, 1)
              + np.array([178, 224, 252]) * w_light
              + np.array([2, 8, 32]) * w_dark)
bevel_rows = np.clip(bevel_rows, 0, 255)
bevel = Image.fromarray(bevel_rows.astype(np.uint8)[:, None, :].repeat(W4, 1))
bevel_mask = Image.fromarray(
    (np.asarray(mask4).astype(np.int16) - np.asarray(inner).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
comp = Image.composite(bevel, comp, bevel_mask)

# broad gloss + specular
u = np.clip((XX - BODY_L) / BW, 0, 1)
v = np.clip((YY - BODY_T) / BH, 0, 1)
dg = np.clip(1.0 - 1.05 * (0.60 * u + 0.42 * v), 0, 1) ** 1.4
gl = Image.fromarray((dg * 0.11 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.3 * K))
gl_arr = np.asarray(gl).astype(np.int16)
specb = Image.new('L', (W4, H4), 0)
ImageDraw.Draw(specb).ellipse([P(BODY_L + 4, BODY_T + 3), P(BODY_L + 38, BODY_T + 15)], fill=40)
specb = specb.filter(ImageFilter.GaussianBlur(1.6 * K))
gl_arr = np.maximum(gl_arr, np.asarray(specb).astype(np.int16))
gl_mask = Image.fromarray(
    np.clip(gl_arr * (np.asarray(mask4) > 200), 0, 255).astype(np.uint8))
comp = Image.composite(Image.new('RGB', (W4, H4), (214, 240, 255)), comp, gl_mask)

# two bars: one long, one short
LONG, SHORT = 0.54 * BW, 0.30 * BW
THICK, PITCH = 6.0 * K, 21.5 * K
LEFT = (BCX - LONG / 2.0) * K
TOP = (BCY - (PITCH / K + THICK / K) / 2.0) * K
g0 = np.array([253, 254, 255], dtype=float)
g1 = np.array([214, 230, 244], dtype=float)
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
