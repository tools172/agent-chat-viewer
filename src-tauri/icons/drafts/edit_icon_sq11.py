"""Round 12: same icon, transparent background (RGBA).

The artwork keeps the round-11 relief (top face, outer/inner walls, recessed
glass, vivid deep-blue lines) but is composited onto premultiplied alpha, so
the paper disappears and the icon sits on whatever surface it is drawn on.
Two flavours: plain (nothing but the object) and grounded (a tight contact
shadow plus a faint cyan glow).

Usage: python src-tauri/icons/drafts/edit_icon_sq11.py [a|b|all]
"""
from PIL import Image, ImageFilter
import numpy as np
import math
import sys

OUT_DIR = 'src-tauri/icons/drafts'
K = 4
SIDE = 236.0
CX = CY = SIDE / 2.0
RI, RO = 70.0, 92.0
LIFT = 13.0                     # how far the rim stands above the paper
SHIFT = np.array([0.42, 0.91])  # projected extrusion direction
SHIFT = SHIFT / np.linalg.norm(SHIFT) * LIFT
HANDLE_ANG = 45.0
PAD = 0.045                    # margin around the drawing, as a fraction of its size

W4 = H4 = int(round(SIDE * K))
XX = (np.arange(W4)[None, :] + 0.5) / K
YY = (np.arange(H4)[:, None] + 0.5) / K

L = np.array([-0.34, -0.46, 0.82])
L = L / np.linalg.norm(L)
Lx, Ly, Lz = L
Hh = (L + np.array([0.0, 0.0, 1.0]))
Hh = Hh / np.linalg.norm(Hh)
Hx, Hy, Hz = Hh

BLUE = (12, 66, 224)          # one vivid, saturated deep blue for all lines
VARIANTS = {
    'a': dict(cn='透明底 · 纯净', bg='none', ring=(0, 172, 208), grip=(0, 190, 222),
              lines=[BLUE, BLUE, BLUE], glow=0.0, shadow='none'),
    'b': dict(cn='透明底 · 接触影 + 微光', bg='none', ring=(0, 172, 208), grip=(0, 190, 222),
              lines=[BLUE, BLUE, BLUE], glow=0.20, shadow='tight'),
}
CFG = VARIANTS['a']

LINES = [
    (118.0, 95.0, 92.0, 11.0),
    (112.0, 118.0, 78.0, 11.0),
    (101.0, 141.0, 54.0, 11.0),
]


def over(buf, col, a):
    """Composite col with coverage a onto a premultiplied RGBA buffer."""
    col = np.asarray(col, float)
    a3 = a[..., None]
    rgb = buf[..., :3] * (1 - a3) + col * a3
    al = buf[..., 3] * (1 - a) + a
    return np.concatenate([rgb, al[..., None]], axis=-1)


def blur(a, sigma, dx=0.0, dy=0.0):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    b = np.asarray(img.filter(ImageFilter.GaussianBlur(sigma * K))).astype(np.float64) / 255.0
    if dx or dy:
        b = np.roll(np.roll(b, int(round(dy * K)), axis=0), int(round(dx * K)), axis=1)
    return b


def rrect(px, py, cx, cy, w, h, rad):
    qx = np.abs(px - cx) - (w * 0.5 - rad)
    qy = np.abs(py - cy) - (h * 0.5 - rad)
    return (np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
            + np.minimum(np.maximum(qx, qy), 0) - rad)


def aa(d):
    return np.clip(0.5 - d * K, 0, 1)


# ------------------------------------------------------------- background ----
def background(kind):
    if kind == 'none':
        return np.zeros((H4, W4, 4), dtype=float)
    R = np.hypot(XX - CX, YY - CY) / (SIDE * 0.52)
    t = np.clip(R, 0, 1) ** 1.35
    if kind == 'white':
        v = 1.0 - 0.032 * t
        rgb = np.stack([255 * v, 255 * v, 255 * v * 1.004], axis=-1)
        return np.concatenate([rgb, np.ones((H4, W4, 1))], axis=-1)
    if kind == 'light':
        c0 = np.array([255, 255, 255], float)
        c1 = np.array([198, 224, 244], float)
        col = c0 * (1 - t[..., None]) + c1 * t[..., None]
        ang = np.clip(((XX - CX) * 0.7 + (YY - CY) * 0.7) / (SIDE * 0.72) + 0.5, 0, 1)
        col = col * (1 - 0.07 * ang[..., None]) + np.array([180, 210, 236]) * (0.07 * ang[..., None])
        return np.concatenate([col, np.ones((H4, W4, 1))], axis=-1)
    c0 = np.array([18, 48, 80], float)
    c1 = np.array([5, 14, 27], float)
    rgb = c0 * (1 - t[..., None]) + c1 * t[..., None]
    return np.concatenate([rgb, np.ones((H4, W4, 1))], axis=-1)


# --------------------------------------------------------------- geometry ---
R = np.hypot(XX - CX, YY - CY)
ANG = np.arctan2(YY - CY, XX - CX)
F = 0.5 + 0.5 * np.cos(ANG + 2.356)          # 1 towards the light

a_ann = aa(np.maximum(RI - R, R - RO))       # the footprint of the ring
# the base of the solid sits at the top face + SHIFT (down-right)
R_sh = np.hypot(XX - CX - SHIFT[0], YY - CY - SHIFT[1])
a_shift = aa(np.maximum(RI - R_sh, R_sh - RO))
a_wall = np.clip(a_shift - a_ann, 0, 1)      # the visible side walls


# --------------------------------------------------------------- the rim ----
def rim_face():
    RUN = np.clip((R - RI) / (RO - RI), 0, 1)
    edge = np.minimum(np.clip(RUN / 0.17, 0, 1), np.clip((1 - RUN) / 0.15, 0, 1))
    h = 6.0 * edge ** 0.45 + 0.55 * np.sin(np.pi * RUN)
    gy, gx = np.gradient(h)
    rx = np.clip(gx * K, -7, 7)
    ry = np.clip(gy * K, -7, 7)
    rn = np.sqrt(rx * rx + ry * ry + 1.0)
    rx, ry, rz = -rx / rn, -ry / rn, 1.0 / rn
    diff = np.clip(rx * Lx + ry * Ly + rz * Lz, 0, 1)
    fill = np.clip(-(rx * 0.60 + ry * 0.60 + rz * 0.35), 0, 1)
    shade = (0.46 + 0.76 * diff + 0.10 * fill) * (0.93 + 0.16 * F)
    rgb = np.array(CFG['ring'], float) * shade[..., None]
    sp = np.clip(rx * Hx + ry * Hy + rz * Hz, 0, 1)
    spec = np.clip(sp ** 55 * 1.25 + sp ** 10 * 0.10, 0, 1) * (0.35 + 0.65 * F)
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]
    # crisp contours
    d_out = RO - R
    d_in = R - RI
    cont = np.clip(1.0 - np.minimum(d_out, d_in) / 1.5, 0, 1) ** 1.1
    rgb = rgb * (1 - (0.40 * (0.55 + 0.45 * (1 - F)) * cont)[..., None])
    # catch light on the lit half
    hl = np.clip(1.0 - (RO - R) / 1.1, 0, 1) * F ** 1.6
    rgb = np.clip(rgb + 255.0 * (hl * 0.62)[..., None], 0, 255)
    # polished gloss arc across the top face
    RUN2 = np.clip((R - RI) / (RO - RI), 0, 1)
    gloss = 0.26 * np.exp(-((RUN2 - 0.40) / 0.15) ** 2) * np.clip(F - 0.12, 0, 1) ** 1.2
    rgb = rgb * (1 - gloss[..., None]) + 255.0 * gloss[..., None]
    return np.clip(rgb, 0, 255)


def wall_col():
    """Side walls: dark, a touch lighter where they meet the top face."""
    base = np.array(CFG['ring'], float) * 0.26
    outer = (R > RO).astype(float)
    t = np.clip((R - RO) / max(LIFT, 1e-3) * 0.75 + 0.50, 0, 1)
    rgb = base * (0.52 + 0.86 * t)[..., None]
    rgb = rgb + np.array([4, 16, 30]) * (1 - t)[..., None]
    # the inner wall sits in the well: a bit darker, cooler
    rgb = np.where((outer < 0.5)[..., None], rgb * 0.72, rgb)
    # ambient occlusion right at the base
    ao = np.clip((a_wall - 0.15) / 0.85, 0, 1) ** 2
    return np.clip(rgb * (1 - 0.22 * ao[..., None]), 0, 255)


# ------------------------------------------------------------ the lens -----
def glass(bg, a_lens):
    t = np.clip(((XX - CX) * 0.42 + (YY - CY) * 0.92) / (RI * 1.85) + 0.5, 0, 1)
    c0 = np.array([228, 246, 255], float)
    c1 = np.array([122, 178, 218], float)
    col = c0 * (1 - t[..., None]) + c1 * t[..., None]
    bg = over(bg, col, a_lens)
    # shadow thrown by the inner wall onto the glass (falls on the lit side)
    sh = np.clip((R - (RI - 13.0)) / 13.0, 0, 1) ** 1.7 * (0.40 + 0.46 * F)
    bg = over(bg, (20, 66, 108), sh * a_lens)
    # curved reflection: a bright arc along the upper left
    arc = np.exp(-((R - RI * 0.60) / (RI * 0.085)) ** 2) * np.clip(F - 0.20, 0, 1) ** 1.3
    bg = over(bg, (255, 255, 255), arc * 0.70 * a_lens)
    # window reflection blob
    g = 0.42 * np.exp(-((((XX - CX) + RI * 0.26) / (RI * 0.46)) ** 2
                        + (((YY - CY) + RI * 0.50) / (RI * 0.22)) ** 2))
    bg = over(bg, (255, 255, 255), g * a_lens)
    # bright lip where the glass meets the wall
    lip = np.exp(-((R - (RI - 0.9)) / 1.0) ** 2) * np.clip(F + 0.15, 0, 1)
    bg = over(bg, (255, 255, 255), lip * 0.85 * a_lens)
    return bg


# --------------------------------------------------------------- handle -----
def handle_parts():
    th = math.radians(HANDLE_ANG)
    dx, dy = math.cos(th), math.sin(th)
    px_, py_ = -dy, dx
    DU = (XX - CX) * dx + (YY - CY) * dy
    DV = (XX - CX) * px_ + (YY - CY) * py_

    def cap(du, dv, a0, a1, r):
        return np.hypot(du - np.clip(du, a0, a1), dv) - r

    def capn(du, dv, a0, a1):
        ex = du - np.clip(du, a0, a1)
        rho = np.maximum(np.hypot(ex, dv), 1e-6)
        s = np.clip(dv / rho, -1, 1)
        t = np.clip(ex / rho, -1, 1)
        nz = np.sqrt(np.clip(1 - s * s - t * t, 0, 1))
        return px_ * s + dx * t, py_ * s + dy * t, nz

    C0, C1, CR = RO + 13.0, RO + 22.0, 11.2   # metal ferrule
    G0, G1, GR = RO + 21.0, RO + 46.0, 10.4   # grip
    d_col = cap(DU, DV, C0, C1, CR)
    d_grp = cap(DU, DV, G0, G1, GR)
    d = np.minimum(d_col, d_grp)
    a = aa(d)

    gx, gy, gz = capn(DU, DV, G0, G1)
    gd = np.clip(gx * Lx + gy * Ly + gz * Lz, 0, 1)
    gs = np.clip(gx * Hx + gy * Hy + gz * Hz, 0, 1)
    grip = np.array(CFG['grip'], float) * (0.66 + 0.58 * gd)[..., None]
    # two specular streaks: a tight one and a wide sheen
    grip = grip + 255.0 * (np.clip(gs ** 40 * 0.55, 0, 1))[..., None]
    grip = grip + 190.0 * (np.clip(gs ** 6 * 0.16, 0, 1))[..., None]
    grip = np.clip(grip, 0, 255)

    cxn, cyn, czn = capn(DU, DV, C0, C1)
    cd = np.clip(cxn * Lx + cyn * Ly + czn * Lz, 0, 1)
    cs = np.clip(cxn * Hx + cyn * Hy + czn * Hz, 0, 1)
    col = np.array([212, 222, 232], float) * (0.55 + 0.75 * cd)[..., None]
    col = col * (1 - np.clip(cs ** 8 * 0.45, 0, 1)[..., None]) \
        + 255.0 * np.clip(cs ** 8 * 0.45, 0, 1)[..., None]
    # turn lines on the ferrule
    for u in (C0 + 2.2, C1 - 2.2):
        col = col * (1 - 0.26 * np.clip(1 - np.abs(DU - u) / 1.1, 0, 1))[..., None]
    col = np.clip(col, 0, 255)

    rgb = np.where((d_col < d_grp)[..., None], col, grip)
    cont = np.clip(1.0 - (-d) / 1.2, 0, 1) ** 1.2
    rgb = rgb * (1 - (0.38 * cont)[..., None])
    return np.clip(rgb, 0, 255), a


# ------------------------------------------------------------------ build ---
def build():
    bg = background(CFG['bg'])
    dark = CFG['bg'] == 'dark'

    a_lens = np.clip((RI - np.hypot(XX - CX - SHIFT[0], YY - CY - SHIFT[1])) * K, 0, 1)
    h_col, h_a = handle_parts()
    obj_a = np.clip(np.maximum(a_ann, a_shift) + h_a, 0, 1)
    gl = CFG['glow']
    if gl > 0:
        bg = over(bg, np.array(CFG['ring'], float) * 0.55 + 90.0, blur(obj_a, 9.0) * gl * 0.55)
        bg = over(bg, np.array(CFG['ring'], float) * 0.40 + 60.0, blur(obj_a, 20.0) * gl * 0.40)

    # optional tight contact shadow (a transparent icon must not carry a big one)
    if CFG['shadow'] == 'tight':
        bg = over(bg, (10, 26, 48), blur(obj_a, 2.6, 3.0, 2.4) * 0.40)

    # glass in the well, its shadow, the flat lines
    bg = glass(bg, a_lens)
    for i, (x, y, w, h) in enumerate(LINES):
        a = aa(rrect(XX, YY, x, y, w, h, h * 0.5))
        bg = over(bg, CFG['lines'][i % len(CFG['lines'])], a * 0.97)

    # handle behind the rim
    bg = over(bg, (24, 60, 96), blur(h_a, 3.4, 3.2, 4.2) * 0.30)
    bg = over(bg, h_col, h_a)

    # side walls of the ring, then the top face
    bg = over(bg, wall_col(), a_wall)
    # bounce light off the paper where the wall touches it
    outer_wall = a_wall * (R > RO).astype(float)
    bounce = np.exp(-((R_sh - RO) / 1.3) ** 2) * outer_wall
    bg = over(bg, (150, 236, 255), bounce * 0.28)
    bg = over(bg, rim_face(), a_ann)
    return bg, obj_a


def save(name, bg, obj_a):
    # crop to the drawing so the magnifier fills the frame
    m = obj_a > 0.03
    ys, xs = np.where(m)
    x0, x1 = xs.min() / K, xs.max() / K
    y0, y1 = ys.min() / K, ys.max() / K
    w, h = x1 - x0, y1 - y0
    pad = PAD * max(w, h)
    side = max(w, h) + 2 * pad
    X0 = (x0 + x1) / 2 - side / 2
    Y0 = (y0 + y1) / 2 - side / 2
    X0 = min(max(X0, 0.0), SIDE - side)
    Y0 = min(max(Y0, 0.0), SIDE - side)
    box = (int(round(X0 * K)), int(round(Y0 * K)),
           int(round((X0 + side) * K)), int(round((Y0 + side) * K)))
    buf = bg[box[1]:box[3], box[0]:box[2]]
    a = np.clip(buf[..., 3], 0, 1)
    rgb = buf[..., :3] / np.maximum(a[..., None], 1e-4)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255.0])
    big = Image.fromarray(out.astype(np.uint8), 'RGBA').resize((1024, 1024), Image.LANCZOS)
    big.save(f'{OUT_DIR}/{name}.png')
    big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{name}-512.png')
    print('wrote', name, f'fill={max(w, h) / side:.2f}')

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for key in VARIANTS:
        if which in ('all', key):
            globals()['CFG'] = VARIANTS[key]
            bg, oa = build()
            save(f'w7-{key}', bg, oa)
