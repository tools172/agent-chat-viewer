"""Edit the original AI icon (new_icon.png) in place, keeping its look.

The ring, handle, lens and their shadows are left untouched (original pixels).
Only the chat bubble is rebuilt, because it is the part that has to change:
  * bigger, so its corners almost touch the lens rim
  * vivid blue instead of deep navy
  * 3 text bars instead of the original 4
The bubble is redrawn at 4x with colours sampled from the original bubble
(fill gradient, bevel, gloss), so the style stays consistent but the edges are
clean instead of the upscaled pixel grid.

Usage: python src-tauri/icons/drafts/edit_icon.py [scale] [variant]
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4  # supersample factor for the edits

BUBBLE_SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.09
VARIANT = sys.argv[2] if len(sys.argv) > 2 else 'azure'   # azure | royal
OUT_BASE = f'v-{VARIANT}-s{int(round(BUBBLE_SCALE * 100))}'
OUT_DIR = 'src-tauri/icons/drafts'

# luma -> colour ramps (t = normalised luminance of the original bubble pixel)
RAMPS = {
    'azure': [
        (0.00, (8, 34, 96)),
        (0.30, (14, 72, 180)),
        (0.62, (28, 116, 236)),
        (0.85, (58, 146, 248)),
        (1.00, (96, 176, 252)),
    ],
    'royal': [
        (0.00, (7, 26, 80)),
        (0.30, (13, 60, 165)),
        (0.62, (25, 98, 222)),
        (0.85, (52, 128, 238)),
        (1.00, (88, 158, 245)),
    ],
    # brighter overall: the floor stays a saturated blue instead of navy,
    # so the bubble reads as "vivid blue" even at 16 px
    'vivid': [
        (0.00, (18, 70, 178)),
        (0.30, (30, 110, 236)),
        (0.62, (50, 146, 252)),
        (0.85, (84, 176, 254)),
        (1.00, (124, 204, 255)),
    ],
}
RAMP = RAMPS[VARIANT]
RAMP_T = np.array([s[0] for s in RAMP])
RAMP_C = np.array([s[1] for s in RAMP], dtype=float)


def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def ramp(t):
    t = np.clip(t, 0, 1)
    return np.stack([np.interp(t, RAMP_T, RAMP_C[:, c]) for c in range(3)], axis=-1)


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
print(f'ring centre=({cx:.2f},{cy:.2f}) inner R={R_in:.2f}')

# ------------------------------------------------------------- bubble mask --
dist = np.hypot(np.arange(W)[None, :] - cx, np.arange(H)[:, None] - cy)
navy = (lum < 150) & (b > r + 12) & (dist < R_in - 1.2)
ys, xs = np.where(navy)
col_c = navy.sum(axis=0)
row_c = navy.sum(axis=1)
rect_cols = np.where(col_c > 0.45 * col_c.max())[0]
rect_rows = np.where(row_c > 0.45 * row_c.max())[0]
bx0, bx1 = int(rect_cols.min()), int(rect_cols.max())
by0, by1 = int(rect_rows.min()), int(rect_rows.max())
print('bubble rect bbox', bx0, by0, bx1, by1, 'size', bx1 - bx0 + 1, by1 - by0 + 1)

# silhouette = the navy blob with the light text lines filled in
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

# ---------------------------------------- bubble fill colour (linear) --------
scale = BUBBLE_SCALE
bcx, bcy = (bx0 + bx1) / 2.0, (by0 + by1) / 2.0
# sample the fill only from the columns outside the text bars, then fit a
# vertical line per channel (the source bubble is a simple vertical gradient)
rec = ramp((lum - 32.0) / (150.0 - 32.0))
sx_cols = np.concatenate([np.arange(bx0 + 4, bx0 + 9), np.arange(bx1 - 8, bx1 - 3)])
sy_rows = np.arange(by0 + 5, by1 - 4)
Yv = np.repeat(sy_rows, len(sx_cols)).astype(float)
Xv = np.tile(sx_cols, len(sy_rows))
Cv = rec[Yv.astype(int), Xv]
coefs = [np.polyfit(Yv, Cv[:, c], 1) for c in range(3)]


def fill_at(y_native):
    return np.clip([np.polyval(coefs[c], y_native) for c in range(3)], 0, 255)


fill_rows = np.zeros((H * K, 3))
for y4 in range(H * K):
    src_y = bcy + (y4 / K - bcy) / BUBBLE_SCALE
    fill_rows[y4] = fill_at(src_y)
fill_img = Image.fromarray(fill_rows.astype(np.uint8)[:, None, :].repeat(W * K, 1))

# ----------------------------------------------- draw the bubble at 4x ------


def sx(x):
    return (bcx + (x - bcx) * scale) * K


def sy(y):
    return (bcy + (y - bcy) * scale) * K


def keep_in_lens(x_native, y_native, margin=1.5):
    """Pull a scaled point back inside the lens if it would hit the ring."""
    dx, dy = x_native - cx, y_native - cy
    d = float(np.hypot(dx, dy))
    lim = R_in - margin
    if d > lim > 0:
        f = lim / d
        return cx + dx * f, cy + dy * f
    return x_native, y_native


def tail_pt(x, y, margin=1.5):
    xn = bcx + (x - bcx) * scale
    yn = bcy + (y - bcy) * scale
    xn, yn = keep_in_lens(xn, yn, margin)
    return xn * K, yn * K


bg4 = Image.fromarray(bg.astype(np.uint8)).resize((W * K, H * K), Image.LANCZOS)
W4, H4 = bg4.size

def tail_shape():
    """Tail polygon with a rounded tip, like the source's blunt flap."""
    A = np.array(tail_pt(74, 142))
    B = np.array(tail_pt(95, 142))
    C = np.array(tail_pt(76, 159))
    u = (A - C) / np.linalg.norm(A - C)
    v = (B - C) / np.linalg.norm(B - C)
    theta = float(np.arccos(np.clip(np.dot(u, v), -1, 1)))
    rr = 2.0 * scale * K          # fillet radius, 4x pixels
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
md.rounded_rectangle([sx(bx0), sy(by0), sx(bx1), sy(by1)], radius=12 * scale * K, fill=255)
md.polygon(tail_shape(), fill=255)
mask4 = mask_bin.filter(ImageFilter.GaussianBlur(0.8))

# fill = original vertical gradient, mapped onto the new bubble height
fill4 = fill_img

# soft drop shadow on the lens (the source bubble has one too)
sh = np.asarray(mask4.filter(ImageFilter.GaussianBlur(2.0 * K))).astype(np.float64) / 255.0
dy, dx = int(round(1.8 * K)), int(round(0.6 * K))
sh = np.roll(np.roll(sh, dy, axis=0), dx, axis=1)
sh = np.clip(sh, 0, 1)
# the shadow falls on the lens, it must not darken the ring bevel
dist4 = np.hypot(np.arange(W4)[None, :] / K - cx,
                 np.arange(H4)[:, None] / K - cy)
edge = np.clip((R_in - 0.8 - dist4) / 2.5, 0, 1)
sh = sh * edge
sh = sh[..., None] * 0.22
bg_shadow = np.asarray(bg4).astype(np.float64) * (1 - sh) + np.array([28, 44, 62]) * sh

# dark keyline outside the light bevel, like the source bubble
key_px = int(round(1.1 * K))
outer = mask_bin.filter(ImageFilter.MaxFilter(2 * key_px + 1))
key = Image.fromarray(
    (np.asarray(outer).astype(np.int16) - np.asarray(mask_bin).astype(np.int16)
     ).clip(0, 255).astype(np.uint8)
).filter(ImageFilter.GaussianBlur(0.7))
bg_shadow_img = Image.fromarray(np.clip(bg_shadow, 0, 255).astype(np.uint8))
bubble_bg = Image.composite(Image.new('RGB', (W4, H4), (16, 40, 70)), bg_shadow_img, key)
comp = Image.composite(fill4, bubble_bg, mask4)

# bevel: light inner edge, stronger at the top, hue-preserving (no cyan shift)
bevel_px = int(round(1.5 * K))
inner = mask4.filter(ImageFilter.MinFilter(2 * bevel_px + 1))
yy_native = np.arange(H * K, dtype=float) / K
t = np.clip((yy_native - (bcy - 35.5 * scale)) / (71.0 * scale), 0, 1)[:, None]
s = 0.55 - 0.35 * t
bevel_rows = np.clip(fill_rows * (1 - s) + np.array([238, 248, 255]) * s, 0, 255)
bevel = Image.fromarray(bevel_rows.astype(np.uint8)[:, None, :].repeat(W * K, 1))

bevel_mask = Image.fromarray((np.asarray(mask4).astype(np.int16) - np.asarray(inner).astype(np.int16)).clip(0, 255).astype(np.uint8))
bevel_mask = bevel_mask.filter(ImageFilter.GaussianBlur(0.8))
comp = Image.composite(bevel, comp, bevel_mask)

# gloss: broad diagonal sheen (top-left -> bottom-right) + a soft specular
x0s, x1s = sx(bx0) / K, sx(bx1) / K
y0s, y1s = sy(by0) / K, sy(by1) / K
Xg = np.arange(W4)[None, :] / K
Yg = np.arange(H4)[:, None] / K
u = np.clip((Xg - x0s) / max(1e-6, x1s - x0s), 0, 1)
v = np.clip((Yg - y0s) / max(1e-6, y1s - y0s), 0, 1)
dg = np.clip(1.0 - 1.05 * (0.62 * u + 0.40 * v), 0, 1) ** 1.5
gl = Image.fromarray((dg * 0.20 * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2 * K))
gl_arr = np.asarray(gl).astype(np.int16)
spec = Image.new('L', (W4, H4), 0)
ImageDraw.Draw(spec).ellipse(
    [sx(bx0 + 2), sy(by0 + 2), sx(bx0 + 34), sy(by0 + 16)], fill=46)
spec = spec.filter(ImageFilter.GaussianBlur(1.8 * K))
gl_arr = np.maximum(gl_arr, np.asarray(spec).astype(np.int16))
gl_mask = Image.fromarray(
    np.clip(gl_arr * (np.asarray(mask4) > 200), 0, 255).astype(np.uint8))
comp = Image.composite(Image.new('RGB', (W4, H4), (236, 247, 255)), comp, gl_mask)

# text bars: 3 rounded bars, each lit the same way (no block-wide fade)
bars = 3
thick = 5.2 * scale * K
pitch = 16.4 * scale * K
mx = 10.0 * scale * K
total = (bars - 1) * pitch + thick
top = bcy * K - total / 2.0
left = sx(bx0) + mx
right = sx(bx1) - mx
g0 = np.array([250, 252, 254], dtype=float)
g1 = np.array([212, 226, 237], dtype=float)
for i in range(bars):
    w = (right - left) if i < bars - 1 else (right - left) * 0.62
    yy = top + i * pitch
    bw_i = int(round(w)) + 2
    bh_i = int(round(thick)) + 2
    bar_mask = Image.new('L', (bw_i, bh_i), 0)
    bd = ImageDraw.Draw(bar_mask)
    bd.rounded_rectangle([0, 0, int(round(w)), int(round(thick))],
                         radius=thick / 2.0, fill=255)
    bar_mask = bar_mask.filter(ImageFilter.GaussianBlur(0.7))
    grad = np.zeros((bh_i, 3), dtype=float)
    for ry in range(bh_i):
        f = ry / max(1, bh_i - 1)
        grad[ry] = g0 * (1 - f) + g1 * f
    bar_img = Image.fromarray(grad.astype(np.uint8)[:, None, :].repeat(bw_i, 1))
    bar_img.putalpha(bar_mask)
    comp.paste(bar_img, (int(left), int(yy)), bar_img)

# --------------------------------------------------------------- output ----
ys, xs = np.where((b > 120) & (g > 150) & (b > r + 40) & (g > r + 5) & (np.arange(W)[None, :] < 220))
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
print('wrote', OUT_BASE)
