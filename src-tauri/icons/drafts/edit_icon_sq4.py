"""Round 4: real volume instead of a painted bezel.

Round 3 faked depth with (a) a wide inner bevel band and (b) a top-to-bottom
colour gradient.  Both only touch the border / the surface tint, so the bubble
still read as a flat sticker with a glossy frame.  Round 4 does it the way a 3D
renderer does:

  * bubble = rounded-rect SDF -> smooth height field ("h") -> surface normals
    -> Lambert diffuse + Blinn-Phong specular + fresnel rim + bounce light from
    the glass.  The albedo is almost flat; all of the light/dark comes from the
    geometry, which is what makes an object look like it has mass.
  * an extruded side wall under the down-right edge (the "leap off the page"
    cue) plus a long soft cast shadow and a tight contact/AO shadow.
  * ring = torus normals (cos v along the tube, sin v up) -> Lambert + fresnel
    silhouette rim + tight specular, ~20% thicker than round 3, with an inner
    shadow on the lens and a soft outer shadow on the page.

Usage: python src-tauri/icons/drafts/edit_icon_sq4.py [variant]
Variants: a | b | c | d | e
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math
import sys

SRC = 'src-tauri/icons/new_icon.png'
K = 4
OUT_DIR = 'src-tauri/icons/drafts'

# albedo ramps: hue only drifts a little top->bottom; the shading carries volume
VARIANTS = {
    'a': dict(cn='冰川蓝 · 青到钴', hue_top=189.0, hue_bot=228.0, sat=0.94, val=0.94),
    'b': dict(cn='宝石蓝 · 湛蓝到靛', hue_top=204.0, hue_bot=248.0, sat=0.96, val=0.90),
    'c': dict(cn='湖水青 · 偏绿', hue_top=176.0, hue_bot=214.0, sat=0.88, val=0.93),
    'd': dict(cn='电光蓝 · 偏紫', hue_top=208.0, hue_bot=262.0, sat=0.95, val=0.95),
    'e': dict(cn='靛蓝 · 深邃', hue_top=216.0, hue_bot=268.0, sat=0.94, val=0.86),
}
VARIANT = sys.argv[1] if len(sys.argv) > 1 else 'a'
CFG = VARIANTS[VARIANT]
CN_NAME = CFG['cn']
OUT_BASE = f'z-{VARIANT}'


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


def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


# ------------------------------------------------------------------ load ----
src = Image.open(SRC).convert('RGB')
arr = np.asarray(src).astype(np.float64)
H, W, _ = arr.shape
r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
lum = luma(arr)

# page colour (used at the end so the artwork sits on pure white)
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
print(f'{VARIANT}: centre=({cx:.2f},{cy:.2f}) cyan {R_IN_FIT:.2f}..{R_OUT_FIT:.2f}')

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
F = 0.5 + 0.5 * np.cos(ANG + 2.356)          # 1 towards top-left

# =========================================================== ring geometry ==
RING_IN = R_IN_FIT - 2.0
RING_OUT = R_OUT_FIT + 1.7
R_MID = 0.5 * (RING_IN + RING_OUT)
R_RAD = 0.5 * (RING_OUT - RING_IN)
print(f'  ring {RING_IN:.2f}..{RING_OUT:.2f} width={RING_OUT - RING_IN:.2f}')

# light: upper left, in front of the page
L = unit([-0.34, -0.46, 0.82])
Hh = unit(L + np.array([0.0, 0.0, 1.0]))
Lx, Ly, Lz = L
Hx, Hy, Hz = Hh

# --- soft drop shadow of the whole magnifier on the page (bottom-right) -----
disk = (R4 < RING_OUT + 1.0).astype(np.float64)
rad2 = np.hypot(np.arange(W)[None, :] - cx, np.arange(H)[:, None] - cy)
hnd = (cyan & (rad2 > R_OUT_FIT + 2)).astype(np.int16)
# handle silhouette, rebuilt at 4x from the source mask
hnd_img = Image.fromarray((np.asarray(Image.fromarray((hnd * 255).astype(np.uint8))
                                      .filter(ImageFilter.MaxFilter(9))) > 0)
                          .astype(np.uint8) * 255).resize((W4, H4), Image.LANCZOS)
hnd4 = np.asarray(hnd_img).astype(np.float64) / 255.0
hnd4 = np.asarray(Image.fromarray((hnd4 * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(1.5 * K))).astype(np.float64) / 255.0
icon_sil = np.clip(disk + hnd4, 0, 1)
icon_sil = np.asarray(Image.fromarray((icon_sil * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(1.2 * K))).astype(np.float64) / 255.0

sh_whole = np.asarray(Image.fromarray((icon_sil * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(6.0 * K))).astype(np.float64) / 255.0
dy, dx = int(round(5.0 * K)), int(round(2.8 * K))
sh_whole = np.clip(np.roll(np.roll(sh_whole, dy, axis=0), dx, axis=1), 0, 1)
sh_whole *= 0.20
bgA = bgA * (1 - sh_whole[..., None]) + np.array([96, 116, 148]) * sh_whole[..., None]

# --- ring contact shadow cast outwards onto the page (bottom-right) --------
ring_disk = (R4 < RING_OUT + 0.6).astype(np.float64)
o_sh = np.asarray(Image.fromarray((ring_disk * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(5.5 * K))).astype(np.float64) / 255.0
o_sh = np.clip(np.roll(np.roll(o_sh, int(round(3.4 * K)), axis=0),
                       int(round(2.4 * K)), axis=1), 0, 1)
o_out = np.clip((R4 - RING_OUT) / 8.0, 0, 1)[..., None].squeeze()
ang_w = np.clip(np.cos(ANG - 0.78), 0, 1) ** 0.7
o_sh = o_sh * o_out * ang_w * 0.24
bgA = bgA * (1 - o_sh[..., None]) + np.array([120, 142, 172]) * o_sh[..., None]

# --- ring shadow and ambient occlusion onto the lens ----------------------
d_in = RING_IN - R4
ang_w2 = np.clip(np.cos(ANG - 0.78), 0, 1) ** 0.6
# tight contact ring
ac = np.clip(d_in / 4.5, 0, 1) ** 1.6 * 0.14
bgA = bgA * (1 - ac[..., None]) + np.array([44, 62, 88]) * ac[..., None]
# long directional shadow towards the bottom-right
as_ = np.clip(d_in / 11.0, 0, 1) ** 1.5 * 0.26 * ang_w2 ** 1.2
bgA = bgA * (1 - as_[..., None]) + np.array([32, 50, 80]) * as_[..., None]
# cyan light bleeding off the ring onto the glass
sc = np.exp(-((d_in - 2.6) / 4.2) ** 2) * 0.11
bgA = bgA * (1 - sc[..., None]) + np.array([130, 232, 246]) * sc[..., None]
# cool silver tint over the whole lens, keeps the palette together
lt = np.clip((RING_IN - R4) / 3.0, 0, 1) * 0.10
bgA = bgA * (1 - lt[..., None]) + np.array([204, 224, 244]) * lt[..., None]

# ========================================================== bubble shading ==
BCX, BCY = 108.3, 104.6
BW, BH = 94.0, 88.0
BR = 29.0
BODY_L, BODY_T = BCX - BW / 2.0, BCY - BH / 2.0
BODY_R, BODY_B = BCX + BW / 2.0, BCY + BH / 2.0
TAIL_BASE_L, TAIL_BASE_R = 81.0, 101.0
TAIL_TIP = (85.0, BODY_B + 9.2)

HMAX = 9.0          # height of the bubble above the glass, native px
BEV = 4.0           # width of the rounded shoulder
WALL = 2.8          # extrusion visible at the bottom-right


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
    rr = 4.2
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
    """Signed distance to a convex polygon (negative inside)."""
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


# outward-normal orientation of the tail polygon: probe its centroid
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
NEG = _dp > 0          # normals pointed inward -> flip the half-plane test

def smin(a, b, k):
    """Polynomial smooth minimum: rounds the body/tail junction into a fillet."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


d_body = sdf_rrect(XX, YY, BODY_L, BODY_T, BODY_R, BODY_B, BR)
d_tail = sdf_poly(XX, YY, TAIL, NEG)
d = smin(d_body, d_tail, 3.2)

front_a = np.clip(0.5 - d * K, 0, 1)

# ---- height field -> normals ----------------------------------------------
e = np.clip(-d / BEV, 0, 1)
q = np.clip(1.0 - ((XX - BCX) / (0.60 * BW)) ** 2
            - ((YY - BCY) / (0.62 * BH)) ** 2, 0, 1)
dome = np.sqrt(q * (2.0 - q))                     # broad curvature over the face
h = HMAX * np.sqrt(e) * (0.52 + 0.48 * dome)

gy, gx = np.gradient(h)
hx = np.clip(gx * K, -3.0, 3.0)
hy = np.clip(gy * K, -3.0, 3.0)
nn = np.sqrt(hx * hx + hy * hy + 1.0)
nx, ny, nz = -hx / nn, -hy / nn, 1.0 / nn

diff = np.clip(nx * Lx + ny * Ly + nz * Lz, 0, 1)
fill = np.clip(-(nx * 0.55 + ny * 0.62 + nz * 0.42), 0, 1)     # bounce from lower right
ao = 1.0 - 0.38 * np.clip(1.0 - diff, 0, 1) * np.clip(1.0 - e * 2.0, 0, 1)
shade = (0.34 + 0.66 * diff + 0.12 * fill) * ao

# albedo: nearly constant, only a gentle hue drift
t = np.clip((BODY_B - YY) / BH, 0, 1)
uu = np.clip((XX - BODY_L) / BW, 0, 1)
hue = CFG['hue_bot'] + (CFG['hue_top'] - CFG['hue_bot']) * t + 7.0 * (uu - 0.5)
sat = CFG['sat'] * (0.94 + 0.06 * t)
alb = hsv_array(hue, np.clip(sat, 0, 1), np.full_like(hue, CFG['val']))

face = alb * shade[..., None]

# specular + gloss (tinted, so the highlight keeps the colour)
sp = np.clip(nx * Hx + ny * Hy + nz * Hz, 0, 1)
spec = np.clip(sp ** 120 * 1.05 + sp ** 14 * 0.07, 0, 1)
face += (alb * 0.40 + 255.0 * 0.60) * spec[..., None]

# broad window reflection across the top of the face
gcx, gcy = BCX - 0.17 * BW, BCY - 0.30 * BH
gl = 0.10 * np.exp(-(((XX - gcx) / (0.32 * BW)) ** 2
                     + ((YY - gcy) / (0.13 * BH)) ** 2))
gl = gl * np.clip(e * 2.5, 0, 1)
face += np.array([240, 249, 255]) * gl[..., None]

# bounce light off the bright lens on the lower shoulder
vb = np.clip(((YY - BODY_T) / BH - 0.52) / 0.48, 0, 1)
eb = np.clip((0.32 - e) / 0.32, 0, 1)
bw = (vb ** 1.3 * eb) * 0.26
face += np.array([104, 190, 236]) * bw[..., None]

# fresnel rim on the lit shoulder
fres = np.clip(1.0 - np.clip(nx * 0.0 + ny * 0.0 + nz, 0, 1), 0, 1) ** 3.0
face += np.array([176, 232, 255]) * (fres * 0.14)[..., None]
face = np.clip(face, 0, 255)

# ---- extruded side wall ---------------------------------------------------
ox = 0.42 * WALL
oy = 0.91 * WALL
d_shift = sdf_rrect(XX - ox, YY - oy, BODY_L, BODY_T, BODY_R, BODY_B, BR)
d_shift = smin(d_shift, sdf_poly(XX - ox, YY - oy, TAIL, NEG), 3.2)
shift_a = np.clip(0.5 - d_shift * K, 0, 1)
wall_a = shift_a * (1.0 - front_a)
fw = np.clip(-d_shift / WALL, 0, 1)          # 0 outer edge .. 1 at the face
wall_rgb = alb * (0.16 + 0.30 * fw)[..., None]
wall_rgb += np.array([0, 6, 18]) * (0.5 + 0.5 * (1 - fw))[..., None]

# ---- cast shadow + contact AO on the glass --------------------------------
sh_a = np.asarray(Image.fromarray((np.clip(front_a, 0, 1) * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(5.2 * K))).astype(np.float64) / 255.0
sh_a = np.clip(np.roll(np.roll(sh_a, int(round(6.6 * K)), axis=0),
                       int(round(4.2 * K)), axis=1), 0, 1) * 0.50
contact = np.asarray(Image.fromarray((np.clip(front_a, 0, 1) * 255).astype(np.uint8))
                     .filter(ImageFilter.GaussianBlur(1.5 * K))).astype(np.float64) / 255.0
contact = np.clip(np.roll(np.roll(contact, int(round(2.2 * K)), axis=0),
                          int(round(1.0 * K)), axis=1), 0, 1) * 0.42
bgA = bgA * (1 - sh_a[..., None]) + np.array([16, 30, 58]) * sh_a[..., None]
bgA = bgA * (1 - contact[..., None]) + np.array([8, 14, 34]) * contact[..., None]

# ---- assemble bubble ------------------------------------------------------
bgA = bgA * (1 - wall_a[..., None]) + wall_rgb * wall_a[..., None]
bgA = bgA * (1 - front_a[..., None]) + face * front_a[..., None]

# ---- two message bars -----------------------------------------------------
LONG, SHORT = 0.54 * BW, 0.30 * BW
THICK, PITCH = 6.0, 21.5
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

bar_sh = np.asarray(bar.filter(ImageFilter.GaussianBlur(1.4 * K))).astype(np.float64) / 255.0
bar_sh = np.clip(np.roll(np.roll(bar_sh, int(round(2.4 * K)), axis=0),
                         int(round(1.2 * K)), axis=1), 0, 1) * 0.26
bgA = bgA * (1 - bar_sh[..., None]) + np.array([6, 14, 36]) * bar_sh[..., None]

bar_rgb = np.zeros((H4, W4, 3))
bt = np.clip(((YY - TOP) % PITCH) / PITCH, 0, 1)
bar_rgb[..., :] = (np.array([252, 254, 255]) * (1 - 0.16 * bt)[..., None]
                   + np.array([196, 220, 244]) * (0.16 * bt)[..., None])
bgA = bgA * (1 - bar_a[..., None]) + bar_rgb * bar_a[..., None]

# ============================================================= ring render ==
cosv = np.clip((R4 - R_MID) / R_RAD, -1.0, 1.0)
sinv = np.sqrt(np.clip(1.0 - cosv * cosv, 0, 1))
ux = (XX - cx) / np.maximum(R4, 1e-6)
uy = (YY - cy) / np.maximum(R4, 1e-6)
rx, ry, rz = cosv * ux, cosv * uy, sinv

rdiff = np.clip(rx * Lx + ry * Ly + rz * Lz, 0, 1)
rfill = np.clip(-(rx * 0.60 + ry * 0.60 + rz * 0.35), 0, 1)
rocc = 0.66 + 0.34 * np.clip(sinv / 0.45, 0, 1)
rshade = (0.24 + 0.92 * rdiff + 0.14 * rfill) * rocc
RING_BASE = np.array([40, 194, 216], dtype=float)
ring_rgb = RING_BASE * rshade[..., None]

# fresnel silhouette rims (bright hairline on both tube edges)
rfres = np.clip(1.0 - sinv, 0, 1) ** 3.2 * 0.46 * (0.32 + 0.68 * F)
ring_rgb += np.array([214, 255, 255]) * rfres[..., None]

rsp = np.clip(rx * Hx + ry * Hy + rz * Hz, 0, 1)
rspec = np.clip(rsp ** 70 * 1.45 + rsp ** 13 * 0.18, 0, 1)
ring_rgb = ring_rgb * (1 - rspec[..., None]) + 255.0 * rspec[..., None]
ring_rgb = np.clip(ring_rgb, 0, 255)

ring_a = (np.clip((R4 - (RING_IN - 0.28)) * K, 0, 1)
          * np.clip((RING_OUT + 0.28 - R4) * K, 0, 1))
bgA = bgA * (1 - ring_a[..., None]) + ring_rgb * ring_a[..., None]

# ================================================================ output ====
# the source sheet holds a presentation mock-up; keep only the icon plate
ART = (18, 19, 211, 213)          # same crop edit_icon.py / compare_drafts.py use
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
big = big.filter(ImageFilter.UnsharpMask(radius=1.8, percent=38, threshold=2))
big.save(f'{OUT_DIR}/{OUT_BASE}.png')
big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-512.png')
big.resize((420, 420), Image.LANCZOS).save(f'{OUT_DIR}/{OUT_BASE}-preview.png')
print('wrote', OUT_BASE, CN_NAME)
