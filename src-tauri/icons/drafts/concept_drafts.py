"""Concept drafts for the app icon: alternatives to "bubble inside the lens".

Four compositions, all drawn with the same kit (deep-teal flat-bevel ring,
flat-face chat card, metal-collar handle) so only the *idea* differs:

  a  magnifier laid ON the chat card, the lens showing the lines enlarged
  b  the lens itself filled with chat-log lines, no card
  c  chat card + a small magnifier badge on its corner
  d  chat card + an eye

Usage: python src-tauri/icons/drafts/concept_drafts.py [a|b|c|d|all]
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math
import sys

K = 4
OUT_DIR = 'src-tauri/icons/drafts'
ART = (18, 19, 211, 213)

# palette (round 6 / 6E)
RING_BASE = np.array([14, 156, 184], dtype=float)
GRIP_BASE = np.array([30, 186, 208], dtype=float)
COL_BASE = np.array([203, 214, 225], dtype=float)
HUE_TOP, HUE_BOT, SAT, VAL = 212.0, 224.0, 0.96, 0.78

L = np.array([-0.34, -0.46, 0.82])
L = L / np.linalg.norm(L)
Lx, Ly, Lz = L
Hh = (L + np.array([0.0, 0.0, 1.0]))
Hh = Hh / np.linalg.norm(Hh)
Hx, Hy, Hz = Hh

W4 = (ART[2] - ART[0]) * K
H4 = (ART[3] - ART[1]) * K
XX = ART[0] + (np.arange(W4)[None, :] + 0.5) / K
YY = ART[1] + (np.arange(H4)[:, None] + 0.5) / K


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


def blur(a, sigma, dx=0.0, dy=0.0):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    b = np.asarray(img.filter(ImageFilter.GaussianBlur(sigma * K))).astype(np.float64) / 255.0
    if dx or dy:
        b = np.roll(np.roll(b, int(round(dy * K)), axis=0), int(round(dx * K)), axis=1)
    return b


def over(bg, col, a):
    col = np.asarray(col, dtype=float)
    return bg * (1 - a[..., None]) + col * a[..., None]


def rrect_sdf(px, py, cx, cy, w, h, rad):
    qx = np.abs(px - cx) - (w * 0.5 - rad)
    qy = np.abs(py - cy) - (h * 0.5 - rad)
    return (np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
            + np.minimum(np.maximum(qx, qy), 0) - rad)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def tail_poly(base_l, base_r, y_base, tip, rr=3.0):
    A = np.array([base_l, y_base], dtype=float)
    B = np.array([base_r, y_base], dtype=float)
    C = np.array(tip, dtype=float)
    u = (A - C) / np.linalg.norm(A - C)
    v = (B - C) / np.linalg.norm(B - C)
    theta = float(np.arccos(np.clip(np.dot(u, v), -1, 1)))
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


def poly_sdf(px, py, pts):
    """Signed distance to a convex polygon; sign comes from the winding."""
    n = len(pts)
    area = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    sg = 1.0 if area > 0 else -1.0
    d = np.full(np.shape(px), -1e9)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        ln = math.hypot(ex, ey)
        if ln < 1e-9:
            continue
        d = np.maximum(d, (px - x1) * (sg * ey / ln) + (py - y1) * (-sg * ex / ln))
    return d


# ------------------------------------------------------------------ page ----
def page():
    rad = np.hypot(XX - 108.3, YY - 108.5) / 110.0
    v = 1.0 - 0.030 * np.clip(rad, 0, 1) ** 2
    return np.stack([255.0 * v, 255.0 * v, 255.0 * v * 1.004], axis=-1)


# ------------------------------------------------------------------ ring ----
def ring(bg, cx, cy, r_in, r_out, hgt=4.4, base=RING_BASE, shk=1.0, cast=True):
    R = np.hypot(XX - cx, YY - cy)
    A = np.arctan2(YY - cy, XX - cx)
    F = 0.5 + 0.5 * np.cos(A + 2.356)
    RUN = np.clip((R - r_in) / (r_out - r_in), 0, 1)
    edge = np.minimum(np.clip(RUN / 0.16, 0, 1), np.clip((1 - RUN) / 0.14, 0, 1))
    hr = hgt * edge ** 0.45 + 0.35 * np.sin(np.pi * RUN)
    gy, gx = np.gradient(hr)
    rx = np.clip(gx * K, -6, 6)
    ry = np.clip(gy * K, -6, 6)
    rn = np.sqrt(rx * rx + ry * ry + 1.0)
    rx, ry, rz = -rx / rn, -ry / rn, 1.0 / rn
    diff = np.clip(rx * Lx + ry * Ly + rz * Lz, 0, 1)
    fill = np.clip(-(rx * 0.60 + ry * 0.60 + rz * 0.35), 0, 1)
    shade = (0.44 + 0.74 * diff + 0.08 * fill) * (0.93 + 0.18 * F)
    rgb = base * shade[..., None]
    sp = np.clip(rx * Hx + ry * Hy + rz * Hz, 0, 1)
    spec = np.clip(sp ** 70 * 1.10 + sp ** 12 * 0.06, 0, 1) * (0.35 + 0.65 * F)
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]
    d_out = r_out - R
    d_in = R - r_in
    cont = np.clip(1.0 - np.minimum(d_out, d_in) / 1.25, 0, 1) ** 1.1
    rgb = rgb * (1 - (0.36 * (0.55 + 0.45 * (1 - F)) * cont)[..., None])
    hl = np.clip(1.0 - (r_out - R) / 0.9, 0, 1) * F ** 1.6
    rgb = np.clip(rgb + 255.0 * (hl * 0.5)[..., None], 0, 255)

    band = ((R > r_in - 0.4) & (R < r_out + 0.4)).astype(np.float64)
    if cast:
        sh = blur(band, 1.1, 2.0, 1.4)
        bg = over(bg, (26, 42, 68), sh * np.clip((R - r_out) / 1.2, 0, 1) * 0.55 * shk)
        sh = blur(band, 4.2, 3.6, 2.6)
        bg = over(bg, (96, 116, 146), sh * np.clip((R - r_out) / 1.2, 0, 1) * 0.42 * shk)
        sh = blur(band, 1.0, 1.6, 2.2)
        bg = over(bg, (40, 58, 84), sh * np.clip((r_in - R) / 1.2, 0, 1) * 0.45 * shk)
    a = np.clip((R - (r_in - 0.28)) * K, 0, 1) * np.clip((r_out + 0.28 - R) * K, 0, 1)
    return over(bg, rgb, a)


# ---------------------------------------------------------------- handle ----
def handle(bg, cx, cy, r_col0, r_col1, r_g0, r_g1, w_col, w_grip, shk=1.0):
    th = math.radians(45.0)
    dx, dy = math.cos(th), math.sin(th)
    px_, py_ = -dy, dx
    DU = (XX - cx) * dx + (YY - cy) * dy
    DV = (XX - cx) * px_ + (YY - cy) * py_

    def cap(du, dv, u0, u1, r):
        return np.hypot(du - np.clip(du, u0, u1), dv) - r

    def capn(du, dv, u0, u1):
        ex = du - np.clip(du, u0, u1)
        rho = np.maximum(np.hypot(ex, dv), 1e-6)
        s = np.clip(dv / rho, -1, 1)
        t = np.clip(ex / rho, -1, 1)
        nz = np.sqrt(np.clip(1 - s * s - t * t, 0, 1))
        return px_ * s + dx * t, py_ * s + dy * t, nz

    d_col = cap(DU, DV, r_col0, r_col1, w_col)
    d_grp = cap(DU, DV, r_g0, r_g1, w_grip)
    d_h = np.minimum(d_col, d_grp)
    a = np.clip(0.5 - d_h * K, 0, 1)

    gx, gy, gz = capn(DU, DV, r_g0, r_g1)
    gd = np.clip(gx * Lx + gy * Ly + gz * Lz, 0, 1)
    gs = np.clip(gx * Hx + gy * Hy + gz * Hz, 0, 1)
    grip = GRIP_BASE * (0.74 + 0.48 * gd)[..., None]
    grip = grip + 255.0 * (np.clip(gs ** 22 * 0.40, 0, 1))[..., None]
    grip = grip * (1 - np.clip(gs ** 80 * 0.55, 0, 1)[..., None]) \
        + 255.0 * np.clip(gs ** 80 * 0.55, 0, 1)[..., None]

    cxn, cyn, czn = capn(DU, DV, r_col0, r_col1)
    cd = np.clip(cxn * Lx + cyn * Ly + czn * Lz, 0, 1)
    cs = np.clip(cxn * Hx + cyn * Hy + czn * Hz, 0, 1)
    col = COL_BASE * (0.62 + 0.66 * cd)[..., None]
    col = col * (1 - np.clip(cs ** 10 * 0.35, 0, 1)[..., None]) \
        + 255.0 * np.clip(cs ** 10 * 0.35, 0, 1)[..., None]
    col = col * (1 - 0.24 * np.clip(1 - np.abs(DU - r_col1) / 2.0, 0, 1))[..., None]

    rgb = np.where((d_col < d_grp)[..., None], col, grip)
    cont = np.clip(1.0 - (-d_h) / 1.0, 0, 1) ** 1.2
    rgb = np.clip(rgb * (1 - (0.34 * cont)[..., None]), 0, 255)

    sh = blur(a, 2.2, 4.4, 3.2)
    bg = over(bg, (92, 112, 142), sh * 0.34 * shk)
    return over(bg, rgb, a)


# ------------------------------------------------------------------ card ----
def card(bg, cx, cy, w, h, rad, tail, rows, wall=3.2, bev=2.2, shk=1.0,
         alb=(HUE_TOP, HUE_BOT, SAT, VAL)):
    d_body = rrect_sdf(XX, YY, cx, cy, w, h, rad)
    if tail is None:
        d = d_body
    else:
        d = smin(d_body, poly_sdf(XX, YY, tail_poly(*tail)), 2.4)
    a_face = np.clip(0.5 - d * K, 0, 1)

    e = np.clip(-d / bev, 0, 1)
    hgt = 3.4 * np.sqrt(e)
    gy, gx = np.gradient(hgt)
    hx = np.clip(gx * K, -8, 8)
    hy = np.clip(gy * K, -8, 8)
    nn = np.sqrt(hx * hx + hy * hy + 1.0)
    nx, ny, nz = -hx / nn, -hy / nn, 1.0 / nn
    diff = np.clip(nx * Lx + ny * Ly + nz * Lz, 0, 1)
    fill = np.clip(-(nx * 0.55 + ny * 0.62 + nz * 0.42), 0, 1)
    shade = 0.56 + 0.52 * diff + 0.06 * fill

    t = np.clip((cy + h / 2 - YY) / h, 0, 1)
    uu = np.clip((XX - (cx - w / 2)) / w, 0, 1)
    hue = alb[1] + (alb[0] - alb[1]) * t + 6.0 * (uu - 0.5)
    sat = alb[2] * (0.95 + 0.05 * t)
    albedo = hsv_array(hue, np.clip(sat, 0, 1), np.full_like(hue, alb[3]))

    face = albedo * shade[..., None]
    sp = np.clip(nx * Hx + ny * Hy + nz * Hz, 0, 1)
    spec = np.clip(sp ** 90 * 0.95 + sp ** 12 * 0.05, 0, 1)
    face = face + (albedo * 0.45 + 255.0 * 0.55) * spec[..., None]
    gcx, gcy = cx - 0.30 * w, cy - 0.30 * h
    gl = 0.09 * np.exp(-(((XX - gcx) / (0.22 * w)) ** 2 + ((YY - gcy) / (0.16 * h)) ** 2))
    face = face + np.array([238, 248, 255]) * (gl * np.clip(e * 3.0, 0, 1))[..., None]
    occ = np.clip((0.9 - e) / 0.9, 0, 1) ** 2 * 0.18
    face = face * (1 - occ[..., None])
    cont = np.clip(1.0 - (-d) / 1.05, 0, 1) ** 1.2
    face = np.clip(face * (1 - (0.30 * cont)[..., None]), 0, 255)

    # cast shadow
    sh = blur(a_face, 1.0, 2.4, 1.4)
    bg = over(bg, (10, 18, 40), sh * 0.56 * shk)
    sh = blur(a_face, 3.2, 7.0, 4.6)
    bg = over(bg, (20, 34, 62), sh * 0.50 * shk)
    sh = blur(a_face, 7.0, 11.0, 7.0)
    bg = over(bg, (54, 74, 104), sh * 0.26 * shk)

    # side wall (body only)
    ox, oy = 0.42 * wall, 0.91 * wall
    d_shift = rrect_sdf(XX - ox, YY - oy, cx, cy, w, h, rad)
    wall_a = np.clip(0.5 - d_shift * K, 0, 1) * (1.0 - a_face)
    fw = np.clip(-d_shift / wall, 0, 1)
    wrgb = albedo * (0.26 + 0.22 * fw)[..., None]
    wrgb = wrgb + np.array([8, 18, 42]) * (0.30 + 0.70 * (1 - fw))[..., None]
    wrgb = wrgb * (1 - 0.30 * np.clip((fw - 0.72) / 0.28, 0, 1))[..., None]

    bg = over(bg, wrgb, wall_a)
    bg = over(bg, face, a_face)

    # message bars
    if rows:
        m = np.zeros_like(XX)
        for (bx, by, bw, bh, br) in rows:
            m = np.maximum(m, np.clip(0.5 - rrect_sdf(XX, YY, bx, by, bw, bh, br) * K, 0, 1))
        shb = blur(m, 1.3, 2.2, 1.1)
        bg = over(bg, (8, 16, 38), shb * 0.30)
        bar = np.array([252, 254, 255], dtype=float)
        bg = over(bg, bar, m)
    return bg


# ------------------------------------------------------------------ eye -----
def eye(bg, cx, cy, ew, eh, pupil, glint_y=0.34):
    d_ell = ((XX - cx) / (ew * 0.5)) ** 2 + ((YY - cy) / (eh * 0.5)) ** 2
    a_ell = np.clip((1.0 - d_ell) * 6.0, 0, 1)
    d_pup = np.hypot(XX - cx, YY - cy)
    a_pup = np.clip((pupil - d_pup) * K, 0, 1)
    a_gl = np.clip((pupil * 0.34 - np.hypot(XX - (cx - pupil * 0.34),
                                           YY - (cy - pupil * glint_y))) * K, 0, 1)
    # shadow under the eye
    sh = blur(a_ell, 1.4, 1.6, 2.2)
    bg = over(bg, (8, 16, 38), sh * 0.30)
    bg = over(bg, (250, 253, 255), a_ell)
    bg = over(bg, (16, 32, 74), a_pup)
    bg = over(bg, (255, 255, 255), a_gl * 0.95)
    return bg


# ------------------------------------------------------------------ lens ----
def lens(bg, cx, cy, r_in, rows_zoom=None, tint=0.16):
    R = np.hypot(XX - cx, YY - cy)
    m = np.clip((r_in - R) * K, 0, 1)
    # glass tint
    bg = over(bg, (226, 242, 252), m * tint)
    if rows_zoom:
        for (bx, by, bw, bh, br) in rows_zoom:
            a = np.clip(0.5 - rrect_sdf(XX, YY, bx, by, bw, bh, br) * K, 0, 1)
            bg = over(bg, (255, 255, 255), a * m)
    # sheen
    g = 0.16 * np.exp(-(((XX - (cx - r_in * 0.42)) ** 2 + (YY - (cy - r_in * 0.46)) ** 2))
                      / (2 * (r_in * 0.52) ** 2))
    bg = over(bg, (255, 255, 255), g * m)
    return bg


# ================================================================ concepts ==
def concept_a():
    bg = page()
    rows = [(95, 84, 82, 7, 3.5), (95, 104, 82, 7, 3.5), (81, 124, 54, 7, 3.5)]
    bg = card(bg, 104, 100, 132, 96, 24, (46, 72, 148, (42, 162)), rows)
    lx, ly, ri, ro = 118, 118, 30, 42
    # inside the lens the same lines read thicker: the magnifier effect
    rows_z = [(lx, 104, ri * 2.1, 12, 6.0), (lx, 126, ri * 1.4, 12, 6.0)]
    bg = lens(bg, lx, ly, ri, rows_zoom=rows_z, tint=0.20)
    bg = ring(bg, lx, ly, ri, ro, hgt=3.8)
    bg = handle(bg, lx, ly, ro - 2.0, ro + 8.0, ro + 7.0, ro + 32.0, 6.0, 7.2)
    return bg


def concept_b():
    bg = page()
    RI, RO = 62.0, 83.0
    R = np.hypot(XX - 108, YY - 100)
    m = np.clip((RI - R) * K, 0, 1)
    # glass: light blue so the white lines read
    bg = over(bg, (168, 206, 228), m * 0.62)
    bg = over(bg, (206, 232, 246), m * 0.35)
    rows = [(110, 82, 88, 9, 4.5), (102, 103, 72, 9, 4.5), (90, 124, 50, 9, 4.5)]
    m = np.zeros_like(XX)
    for (bx, by, bw, bh, br) in rows:
        m = np.maximum(m, np.clip(0.5 - rrect_sdf(XX, YY, bx, by, bw, bh, br) * K, 0, 1))
    m = m * np.clip((RI - 2.5 - np.hypot(XX - 108, YY - 100)) * K, 0, 1)
    bg = over(bg, (255, 255, 255), m)
    bg = ring(bg, 108, 100, RI, RO, hgt=4.8)
    bg = handle(bg, 108, 100, RO - 2.0, RO + 9.0, RO + 8.0, RO + 36.0, 8.0, 9.2)
    return bg


def concept_c():
    bg = page()
    rows = [(92, 80, 84, 7, 3.5), (78, 102, 56, 7, 3.5)]
    bg = card(bg, 100, 98, 136, 102, 26, (44, 70, 149, (40, 163)), rows)
    lx, ly, ri, ro = 152, 152, 24, 33
    bg = lens(bg, lx, ly, ri, tint=0.20)
    bg = ring(bg, lx, ly, ri, ro, hgt=3.2)
    bg = handle(bg, lx, ly, ro - 1.5, ro + 7.0, ro + 6.0, ro + 27.0, 5.2, 6.2)
    return bg


def concept_d():
    bg = page()
    bg = card(bg, 106, 100, 136, 102, 26, (50, 76, 151, (46, 165)), None)
    bg = eye(bg, 106, 98, 88, 46, 17.0)
    return bg


CONCEPTS = {'a': concept_a, 'b': concept_b, 'c': concept_c, 'd': concept_d}


def save(name, bg):
    comp = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    side = max(comp.size)
    sq = Image.new('RGB', (side, side), (255, 255, 255))
    sq.paste(comp, ((side - comp.width) // 2, (side - comp.height) // 2))
    big = sq.resize((1024, 1024), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.6, percent=32, threshold=2))
    big.save(f'{OUT_DIR}/{name}.png')
    big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{name}-512.png')
    print('wrote', name)


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for key, fn in CONCEPTS.items():
        if which in ('all', key):
            save(f'c-{key}', fn())
