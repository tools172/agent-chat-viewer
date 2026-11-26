"""Round 5: keep the silhouette, put the volume in the thickness.

Round 4 read as a bracelet and a pill because the volume was *rounded*:
a full torus for the ring and a domed height field for the bubble.  Round 5
renders both as flat-faced solids instead -- the shape stays a magnifier rim
and a chat bubble, the depth comes from thickness, a chamfer, a side wall and
a two-layer cast shadow:

  * ring   = flat annulus (washer) with a ~2.4px chamfer on both contours, a
             0.4px crown, a thin dark contour and cast shadows on the lens
             (inside, upper-left) and on the page (outside, lower-right).
  * bubble = flat front face, narrow chamfer, 3.2px side wall on the side
             facing away from the light, contact + ambient cast shadow.
             No dome, no keyline: the face is flat, the edges are crisp.

Usage: python src-tauri/icons/drafts/edit_icon_sq5.py [variant]
Variants: a | b | c | d | e
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4
OUT_DIR = 'src-tauri/icons/drafts'

# same albedo ramps as round 4, so the shape is the only variable
VARIANTS = {
    'a': dict(cn='冰川蓝 · 湛蓝', hue_top=196.0, hue_bot=214.0, sat=0.92, val=0.93),
    'b': dict(cn='宝石蓝 · 偏靛', hue_top=206.0, hue_bot=226.0, sat=0.95, val=0.90),
    'c': dict(cn='湖水青 · 偏绿', hue_top=178.0, hue_bot=198.0, sat=0.86, val=0.92),
    'd': dict(cn='电光紫 · 偏紫', hue_top=236.0, hue_bot=252.0, sat=0.90, val=0.94),
    'e': dict(cn='深海蓝 · 最深', hue_top=212.0, hue_bot=224.0, sat=0.96, val=0.78),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'a'
MODE = sys.argv[2] if len(sys.argv) > 2 else 'mid'
CFG = VARIANTS[VARIANT]
CN_NAME = CFG['cn']
OUT_BASE = f'w-{VARIANT}' + ('' if MODE == 'mid' else f'-{MODE}')

# how thick the whole thing is: the one knob that changes the 3D read most
DEPTH = {
    'soft': dict(wall=2.2, bev=1.6, h_face=2.6, h_ring=3.4, sh=0.80),
    'mid':  dict(wall=3.2, bev=2.2, h_face=3.4, h_ring=4.6, sh=1.00),
    'deep': dict(wall=4.4, bev=3.0, h_face=4.4, h_ring=5.8, sh=1.20),
}[MODE]
SHK = DEPTH['sh']

L = np.array([-0.34, -0.46, 0.82])
L = L / np.linalg.norm(L)
Lx, Ly, Lz = L
Hh = L + np.array([0.0, 0.0, 1.0])
Hh = Hh / np.linalg.norm(Hh)
Hx, Hy, Hz = Hh


def hsv_array(h, s, v):
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


def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


# ------------------------------------------------------------------ load ----
src = Image.open(SRC).convert('RGB')
arr = np.asarray(src).astype(np.float64)
H, W, _ = arr.shape
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
lum = luma(arr)
PAGE = arr[3:10, 3:10].reshape(-1, 3).mean(axis=0)

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

ys, xs = np.where(cyan)
rad = np.hypot(xs - cx, ys - cy)
ang = np.arctan2(ys - cy, xs - cx)
rmin, rmax = [], []
for i in range(360):
    a0 = -np.pi + i * 2 * np.pi / 360
    sel = (ang >= a0) & (ang < a0 + 2 * np.pi / 360)
    if sel.sum() > 4:
        rmin.append(rad[sel].min())
        rmax.append(rad[sel].max())
R_IN_FIT = float(np.median(rmin))
R_OUT_FIT = float(np.median(rmax))

# ------------------------------------------------------------- bubble mask --
dist = np.hypot(np.arange(W)[None, :] - cx, np.arange(H)[:, None] - cy)
navy = (lum < 150) & (b > r + 12) & (dist < R_IN_FIT - 1.2)
sil = np.asarray(Image.fromarray((navy * 255).astype(np.uint8))
                 .filter(ImageFilter.MaxFilter(3))) > 0


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
grow = np.asarray(Image.fromarray((sil * 255).astype(np.uint8))
                  .filter(ImageFilter.MaxFilter(5))) > 0
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
    nb = (np.roll(u, 1, 0) + np.roll(u, -1, 0) +
          np.roll(u, 1, 1) + np.roll(u, -1, 1)) / 4.0
    u[unknown] = nb[unknown]
bg = u

# ------------------------------------------------ recolour the cyan parts --
hsv_img = np.asarray(Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
                     .convert('HSV')).astype(np.float64)
hh, ss, vv = hsv_img[..., 0], hsv_img[..., 1], hsv_img[..., 2]
hue_deg = hh / 255.0 * 360.0
mag = (hue_deg > 140) & (hue_deg < 215) & (ss > 52)
hsv_img[..., 0] = np.where(mag, 186 * 255.0 / 360.0, hh)
hsv_img[..., 1] = np.where(mag, np.clip(ss * 1.12, 0, 235), ss)
hsv_img[..., 2] = np.where(mag, np.clip(vv + (255 - vv) * 0.20, 0, 255), vv)
bg = np.asarray(Image.fromarray(hsv_img.astype(np.uint8), 'HSV')
                .convert('RGB')).astype(np.float64)

bg4 = Image.fromarray(bg.astype(np.uint8)).resize((W * K, H * K), Image.LANCZOS)
W4, H4 = bg4.size
bgA = np.asarray(bg4).astype(np.float64)

YY = np.arange(H4)[:, None] / K + 0.5 / K
XX = np.arange(W4)[None, :] / K + 0.5 / K
R4 = np.hypot(XX - cx, YY - cy)
ANG = np.arctan2(YY - cy, XX - cx)
F = 0.5 + 0.5 * np.cos(ANG + 2.356)

RING_IN = R_IN_FIT - 0.9
RING_OUT = R_OUT_FIT + 1.1
print(f'{VARIANT}: centre=({cx:.2f},{cy:.2f}) ring {RING_IN:.2f}..{RING_OUT:.2f} '
      f'w={RING_OUT - RING_IN:.2f}')

# ========================================================== whole drop shadow
disk = (R4 < RING_OUT + 1.0).astype(np.float64)
rad2 = np.hypot(np.arange(W)[None, :] - cx, np.arange(H)[:, None] - cy)
hnd = (cyan & (rad2 > R_OUT_FIT + 2)).astype(np.int16)
hnd_img = Image.fromarray((np.asarray(Image.fromarray((hnd * 255).astype(np.uint8))
                                      .filter(ImageFilter.MaxFilter(9))) > 0)
                          .astype(np.uint8) * 255).resize((W4, H4), Image.LANCZOS)
hnd4 = np.asarray(hnd_img.filter(ImageFilter.GaussianBlur(1.5 * K))).astype(np.float64) / 255.0
icon_sil = np.clip(disk + hnd4, 0, 1)
icon_sil = np.asarray(Image.fromarray((icon_sil * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(1.0 * K))).astype(np.float64) / 255.0
sh_whole = np.asarray(Image.fromarray((icon_sil * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(5.0 * K))).astype(np.float64) / 255.0
sh_whole = np.clip(np.roll(np.roll(sh_whole, int(round(4.4 * K)), axis=0),
                           int(round(2.6 * K)), axis=1), 0, 1) * 0.18 * SHK
bgA = bgA * (1 - sh_whole[..., None]) + np.array([104, 124, 156]) * sh_whole[..., None]

# ============================================================ ring shadows ==
band = ((R4 > RING_IN - 0.4) & (R4 < RING_OUT + 0.4)).astype(np.float64)
band_img = Image.fromarray((band * 255).astype(np.uint8))
b_tight = np.asarray(band_img.filter(ImageFilter.GaussianBlur(1.1 * K))).astype(np.float64) / 255.0
b_soft = np.asarray(band_img.filter(ImageFilter.GaussianBlur(4.2 * K))).astype(np.float64) / 255.0
b_tight = np.clip(np.roll(np.roll(b_tight, int(round(2.0 * K)), axis=0),
                          int(round(1.4 * K)), axis=1), 0, 1)
b_soft = np.clip(np.roll(np.roll(b_soft, int(round(3.6 * K)), axis=0),
                         int(round(2.6 * K)), axis=1), 0, 1)

sh_in = (0.62 * b_tight + 0.38 * b_soft) * np.clip((RING_IN - R4) / 1.2, 0, 1)
sh_in *= 0.62 * SHK
bgA = bgA * (1 - sh_in[..., None]) + np.array([26, 42, 68]) * sh_in[..., None]

sh_out = (0.55 * b_tight + 0.45 * b_soft) * np.clip((R4 - RING_OUT) / 1.2, 0, 1)
sh_out *= 0.50 * SHK
bgA = bgA * (1 - sh_out[..., None]) + np.array([88, 110, 144]) * sh_out[..., None]

# cyan light reflecting off the ring onto the glass just inside it
d_in_ = RING_IN - R4
sc = np.exp(-((d_in_ - 2.4) / 3.8) ** 2) * 0.10
bgA = bgA * (1 - sc[..., None]) + np.array([132, 232, 246]) * sc[..., None]

# cool silver tint on the lens so the greys sit with the palette
lt = np.clip((RING_IN - R4) / 3.0, 0, 1) * 0.10
bgA = bgA * (1 - lt[..., None]) + np.array([204, 224, 244]) * lt[..., None]

# ========================================================== bubble shading ==
BCX, BCY = 108.3, 104.5
BW, BH = 100.0, 78.0
BR = 20.0
BODY_L, BODY_T = BCX - BW / 2.0, BCY - BH / 2.0
BODY_R, BODY_B = BCX + BW / 2.0, BCY + BH / 2.0
TAIL_BASE_L, TAIL_BASE_R = 84.0, 102.0
TAIL_TIP = (82.0, BODY_B + 10.0)

H_FACE = DEPTH['h_face']     # height of the chamfer above the glass
H_DOME = 0.0                 # no crown: the face stays flat, the depth is the thickness
BEV = DEPTH['bev']           # chamfer width
WALL = DEPTH['wall']         # visible side wall


def clamp_pt(xn, yn, margin=2.0):
    dx, dy = xn - cx, yn - cy
    d = float(np.hypot(dx, dy))
    lim = R_IN_FIT - margin
    if d > lim > 0:
        f = lim / d
        return cx + dx * f, cy + dy * f
    return xn, yn


def tail_poly():
    A = np.array([TAIL_BASE_L, BODY_B])
    B = np.array([TAIL_BASE_R, BODY_B])
    C = np.array(clamp_pt(*TAIL_TIP))
    u = (A - C) / np.linalg.norm(A - C)
    v = (B - C) / np.linalg.norm(B - C)
    theta = float(np.arccos(np.clip(np.dot(u, v), -1, 1)))
    rr = 2.6
    d = rr / np.tan(theta / 2)
    t1, t2 = C + u * d, C + v * d
    bis = u + v
    bis /= np.linalg.norm(bis)
    O = C + bis * (rr / np.sin(theta / 2))
    a1 = float(np.arctan2(t1[1] - O[1], t1[0] - O[0]))
    a2 = float(np.arctan2(t2[1] - O[1], t2[0] - O[0]))
    da = (a1 - a2 + np.pi) % (2 * np.pi) - np.pi
    arc = [(O + rr * np.array([np.cos(a2 + da * k / 10.0),
                               np.sin(a2 + da * k / 10.0)])) for k in range(11)]
    return [A, B] + arc


TAIL = tail_poly()


def sdf_rrect(px, py, l, t, rr, bb, rad):
    c0x, c0y = 0.5 * (l + rr), 0.5 * (t + bb)
    hx = 0.5 * (rr - l) - rad
    hy = 0.5 * (bb - t) - rad
    qx = np.abs(px - c0x) - hx
    qy = np.abs(py - c0y) - hy
    return (np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
            + np.minimum(np.maximum(qx, qy), 0) - rad)


def sdf_poly(px, py, pts, negate=False):
    d = np.full(np.shape(px), -1e9)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        ln = math.hypot(ex, ey)
        if ln < 1e-9:
            continue
        nx, ny = ey / ln, -ex / ln
        d = np.maximum(d, (px - x1) * nx + (py - y1) * ny)
    return -d if negate else d


_cx0 = float(np.mean([p[0] for p in TAIL]))
_cy0 = float(np.mean([p[1] for p in TAIL]))
_dp = -1e9
for _i in range(len(TAIL)):
    _x1, _y1 = TAIL[_i]
    _x2, _y2 = TAIL[(_i + 1) % len(TAIL)]
    _ex, _ey = _x2 - _x1, _y2 - _y1
    _ln = math.hypot(_ex, _ey)
    if _ln < 1e-9:
        continue
    _dp = max(_dp, (_cx0 - _x1) * (_ey / _ln) + (_cy0 - _y1) * (-_ex / _ln))
NEG = _dp > 0


def smin(a, bb, k):
    h = np.clip(0.5 + 0.5 * (bb - a) / k, 0, 1)
    return bb * (1 - h) + a * h - k * h * (1 - h)


d_body = sdf_rrect(XX, YY, BODY_L, BODY_T, BODY_R, BODY_B, BR)
d_tail = sdf_poly(XX, YY, TAIL, NEG)
d = smin(d_body, d_tail, 1.3)          # just enough to fuse the tail, no pillow

front_a = np.clip(0.5 - d * K, 0, 1)

# ---- flat face + narrow chamfer ------------------------------------------
# The tail gets a much thinner chamfer than the body: a wide bevel on a narrow
# appendage lights up as a bright sliver and reads as a folded paper corner.
e_body = np.clip(-d_body / BEV, 0, 1)
e_tail = np.clip(-d_tail / 0.7, 0, 1)
q = np.clip(1.0 - ((XX - BCX) / (0.54 * BW)) ** 2
            - ((YY - BCY) / (0.58 * BH)) ** 2, 0, 1)
dome = np.sqrt(q * (2.0 - q))
h = (H_FACE * np.maximum(np.sqrt(e_body), e_tail)
     + H_DOME * dome * np.clip(e_body * 3.0, 0, 1))
e = np.maximum(e_body, e_tail)
gy, gx = np.gradient(h)
hx = np.clip(gx * K, -8.0, 8.0)
hy = np.clip(gy * K, -8.0, 8.0)
nn = np.sqrt(hx * hx + hy * hy + 1.0)
nx, ny, nz = -hx / nn, -hy / nn, 1.0 / nn

diff = np.clip(nx * Lx + ny * Ly + nz * Lz, 0, 1)
fill = np.clip(-(nx * 0.55 + ny * 0.62 + nz * 0.42), 0, 1)
shade = 0.56 + 0.52 * diff + 0.06 * fill          # flat face sits at ~1.0

# albedo: flat face, only a gentle hue drift so it stays one colour
t = np.clip((BODY_B - YY) / BH, 0, 1)
uu = np.clip((XX - BODY_L) / BW, 0, 1)
hue = CFG['hue_bot'] + (CFG['hue_top'] - CFG['hue_bot']) * t + 6.0 * (uu - 0.5)
sat = CFG['sat'] * (0.95 + 0.05 * t)
alb = hsv_array(hue, np.clip(sat, 0, 1), np.full_like(hue, CFG['val']))

face = alb * shade[..., None]

# crisp chamfer highlight where the edge turns into the light
sp = np.clip(nx * Hx + ny * Hy + nz * Hz, 0, 1)
spec = np.clip(sp ** 90 * 0.95 + sp ** 12 * 0.05, 0, 1)
face += (alb * 0.45 + 255.0 * 0.55) * spec[..., None]

# one small soft gloss at the top-left corner, like a polished card
gcx, gcy = BCX - 0.30 * BW, BCY - 0.30 * BH
gl = 0.09 * np.exp(-(((XX - gcx) / (0.22 * BW)) ** 2
                     + ((YY - gcy) / (0.16 * BH)) ** 2))
gl *= np.clip(e * 3.0, 0, 1)
face += np.array([238, 248, 255]) * gl[..., None]

# slight bounce off the bright lens on the very bottom edge
vb = np.clip(((YY - BODY_T) / BH - 0.62) / 0.38, 0, 1)
eb = np.clip((0.18 - e) / 0.18, 0, 1)
bw_ = (vb ** 1.2 * eb) * 0.16
face += np.array([96, 178, 226]) * bw_[..., None]

# contact occlusion in the crease where the face meets the chamfer
occ = np.clip((0.9 - e) / 0.9, 0, 1) ** 2 * 0.18
face = face * (1 - occ[..., None])

# thin dark contour right at the silhouette: keeps the shape crisp and makes
# the face read as a solid object instead of a printed area
cont_b = np.clip(1.0 - (-d) / 1.05, 0, 1) ** 1.2
face = face * (1 - (0.30 * cont_b)[..., None])
face = np.clip(face, 0, 255)

# ---- side wall (body only: the thin tail stays flat like the front face) ---
ox = 0.42 * WALL
oy = 0.91 * WALL
d_shift = sdf_rrect(XX - ox, YY - oy, BODY_L, BODY_T, BODY_R, BODY_B, BR)
shift_a = np.clip(0.5 - d_shift * K, 0, 1)
wall_a = shift_a * (1.0 - front_a)
fw = np.clip(-d_shift / WALL, 0, 1)
wall_rgb = alb * (0.26 + 0.22 * fw)[..., None]
wall_rgb += np.array([8, 18, 42]) * (0.30 + 0.70 * (1 - fw))[..., None]
wall_rgb += np.array([18, 40, 66]) * ((1 - fw) ** 2 * 0.55)[..., None]
# dark crease where the wall folds under the face
wall_rgb *= (1 - 0.30 * np.clip((fw - 0.72) / 0.28, 0, 1))[..., None]

# ---- cast shadow: contact + ambient --------------------------------------
fa_img = Image.fromarray((np.clip(front_a, 0, 1) * 255).astype(np.uint8))
c_sh = np.asarray(fa_img.filter(ImageFilter.GaussianBlur(1.0 * K))).astype(np.float64) / 255.0
c_sh = np.clip(np.roll(np.roll(c_sh, int(round(2.4 * K)), axis=0),
                       int(round(1.4 * K)), axis=1), 0, 1) * 0.56 * SHK
s_sh = np.asarray(fa_img.filter(ImageFilter.GaussianBlur(3.2 * K))).astype(np.float64) / 255.0
s_sh = np.clip(np.roll(np.roll(s_sh, int(round(7.0 * K)), axis=0),
                       int(round(4.6 * K)), axis=1), 0, 1) * 0.50 * SHK
w_sh = np.asarray(fa_img.filter(ImageFilter.GaussianBlur(7.0 * K))).astype(np.float64) / 255.0
w_sh = np.clip(np.roll(np.roll(w_sh, int(round(11.0 * K)), axis=0),
                       int(round(7.0 * K)), axis=1), 0, 1) * 0.26 * SHK
bgA = bgA * (1 - w_sh[..., None]) + np.array([54, 74, 104]) * w_sh[..., None]
bgA = bgA * (1 - s_sh[..., None]) + np.array([20, 34, 62]) * s_sh[..., None]
bgA = bgA * (1 - c_sh[..., None]) + np.array([10, 18, 40]) * c_sh[..., None]

bgA = bgA * (1 - wall_a[..., None]) + wall_rgb * wall_a[..., None]
bgA = bgA * (1 - front_a[..., None]) + face * front_a[..., None]

# ---- two message bars -----------------------------------------------------
LONG, SHORT = 0.50 * BW, 0.28 * BW
THICK, PITCH = 5.4, 19.0
LEFT = BCX - LONG / 2.0
TOP = BCY - (PITCH + THICK) / 2.0

bar = Image.new('L', (W4, H4), 0)
bd = ImageDraw.Draw(bar)
for i, wn in enumerate((LONG, SHORT)):
    x0 = LEFT * K
    y0 = (TOP + i * PITCH) * K
    bd.rounded_rectangle([x0, y0, x0 + wn * K, y0 + THICK * K],
                         radius=THICK * K / 2.0, fill=255)
bar_a = np.asarray(bar.filter(ImageFilter.GaussianBlur(0.45 * K))).astype(np.float64) / 255.0

bar_sh = np.asarray(bar.filter(ImageFilter.GaussianBlur(1.3 * K))).astype(np.float64) / 255.0
bar_sh = np.clip(np.roll(np.roll(bar_sh, int(round(2.2 * K)), axis=0),
                         int(round(1.1 * K)), axis=1), 0, 1) * 0.30
bgA = bgA * (1 - bar_sh[..., None]) + np.array([8, 16, 38]) * bar_sh[..., None]

bar_rgb = np.zeros((H4, W4, 3))
bt = np.clip(((YY - TOP) % PITCH) / PITCH, 0, 1)
bar_rgb[..., :] = (np.array([252, 254, 255]) * (1 - 0.14 * bt)[..., None]
                   + np.array([198, 220, 244]) * (0.14 * bt)[..., None])
bgA = bgA * (1 - bar_a[..., None]) + bar_rgb * bar_a[..., None]

# ============================================================= flat ring ====
RUN = np.clip((R4 - RING_IN) / (RING_OUT - RING_IN), 0, 1)
H_RING = DEPTH['h_ring']
bev_in = np.clip(RUN / 0.16, 0, 1)
bev_out = np.clip((1.0 - RUN) / 0.14, 0, 1)
edge = np.minimum(bev_in, bev_out)
hr = H_RING * edge ** 0.45 + 0.35 * np.sin(np.pi * RUN)

gy, gx = np.gradient(hr)
rx = np.clip(gx * K, -6.0, 6.0)
ry = np.clip(gy * K, -6.0, 6.0)
rn = np.sqrt(rx * rx + ry * ry + 1.0)
rx, ry, rz = -rx / rn, -ry / rn, 1.0 / rn

rdiff = np.clip(rx * Lx + ry * Ly + rz * Lz, 0, 1)
rfill = np.clip(-(rx * 0.60 + ry * 0.60 + rz * 0.35), 0, 1)
rshade = (0.44 + 0.74 * rdiff + 0.08 * rfill) * (0.93 + 0.18 * F)
RING_BASE = np.array([42, 198, 219], dtype=float)
ring_rgb = RING_BASE * rshade[..., None]

rsp = np.clip(rx * Hx + ry * Hy + rz * Hz, 0, 1)
rspec = np.clip(rsp ** 60 * 1.15 + rsp ** 12 * 0.06, 0, 1) * (0.35 + 0.65 * F)
ring_rgb = ring_rgb * (1 - rspec[..., None]) + 255.0 * rspec[..., None]

# soft reflection of the room on the flat top, brightest on the lit side
sheen = (0.03 * np.exp(-((RUN - 0.50) / 0.22) ** 2)
         * (0.30 + 0.70 * F) ** 1.2)
ring_rgb += np.array([246, 255, 255]) * sheen[..., None]

# thin dark contour on both edges keeps the silhouette crisp
d_out = RING_OUT - R4
d_in = R4 - RING_IN
cont = np.clip(1.0 - np.minimum(d_out, d_in) / 1.25, 0, 1) ** 1.1
ring_rgb = ring_rgb * (1 - (0.36 * (0.55 + 0.45 * (1 - F)) * cont)[..., None])

# hairline catch-light on the lit half of the outer edge
hl = np.clip(1.0 - (RING_OUT - R4) / 0.9, 0, 1) * F ** 1.6
ring_rgb += np.array([255, 255, 255]) * (hl * 0.50)[..., None]
ring_rgb = np.clip(ring_rgb, 0, 255)

ring_a = (np.clip((R4 - (RING_IN - 0.28)) * K, 0, 1)
          * np.clip((RING_OUT + 0.28 - R4) * K, 0, 1))
bgA = bgA * (1 - ring_a[..., None]) + ring_rgb * ring_a[..., None]

# ================================================================ output ====
ART = (18, 19, 211, 213)
GROW = 1.0 + (RING_OUT - R_OUT_FIT)
gain = np.clip(255.0 / np.maximum(PAGE, 1.0), 1.0, 1.08)
bgA = np.clip(bgA * gain, 0, 255)
comp = Image.fromarray(bgA.astype(np.uint8))

x0 = int(round(ART[0] - GROW - 3))
x1 = int(round(ART[2] + GROW + 3))
y0 = int(round(ART[1] - GROW - 3))
y1 = int(round(ART[3] + GROW + 3))
icon = comp.crop((x0 * K, y0 * K, x1 * K, y1 * K))
side = int(round(max(icon.size) * 1.10))
canvas = Image.new('RGB', (side, side), (255, 255, 255))
canvas.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
big = canvas.resize((1024, 1024), Image.LANCZOS)
big = big.filter(ImageFilter.UnsharpMask(radius=1.6, percent=34, threshold=2))
big.save(f'{OUT_DIR}/{OUT_BASE}.png')
big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-512.png')
big.resize((420, 420), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-preview.png')
print('wrote', OUT_BASE, CN_NAME)
