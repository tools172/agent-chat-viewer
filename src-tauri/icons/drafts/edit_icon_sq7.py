"""Round 8: the "chat log inside the lens" concept (c-b), finished.

The sketch was flat: a pale glass, flat white bars, a rim with a small bevel
and no shadow.  This pass rebuilds it with depth as the priority:

  * glass  = gradient + window reflection + the rim's inner shadow + a bright
             inner lip, so it reads as a lens, not a printed disc
  * bars   = raised capsules: top highlight, dark bottom lip, contact shadow
  * rim    = taller bevel, crisp contour, catch light on the lit side, tight
             and soft cast shadows
  * handle = thicker grip, metal ferrule, its own shadow
  * colour = more saturated cyan; three backgrounds:
             a white / b light blue gradient / c deep navy with a glow

Everything is procedural, so the canvas is independent of the source sheet.

Usage: python src-tauri/icons/drafts/edit_icon_sq7.py [a|b|c|all]
"""
from PIL import Image, ImageFilter
import numpy as np
import math
import sys

OUT_DIR = 'src-tauri/icons/drafts'
K = 4
SIDE = 230.0                     # native px of the square canvas
CX = CY = SIDE / 2.0
RI, RO = 68.0, 92.0
HANDLE_ANG = 45.0

W4 = H4 = int(round(SIDE * K))
XX = (np.arange(W4)[None, :] + 0.5) / K
YY = (np.arange(H4)[:, None] + 0.5) / K

L = np.array([-0.34, -0.46, 0.82])
L = L / np.linalg.norm(L)
Lx, Ly, Lz = L
Hh = (L + np.array([0.0, 0.0, 1.0]))
Hh = Hh / np.linalg.norm(Hh)
Hx, Hy, Hz = Hh

VARIANTS = {
    'a': dict(cn='白底 · 亮青', bg='white', ring=(0, 176, 212), grip=(0, 194, 226)),
    'b': dict(cn='浅蓝渐变底', bg='light', ring=(0, 170, 206), grip=(0, 188, 222)),
    'c': dict(cn='深蓝底 · 发光', bg='dark', ring=(0, 198, 230), grip=(0, 208, 238)),
}

ROWS = [
    (115.0, 86.0, 100.0, 12.0),
    (108.0, 111.0, 84.0, 12.0),
    (96.0, 136.0, 58.0, 12.0),
]


def over(bg, col, a):
    col = np.asarray(col, dtype=float)
    return bg * (1 - a[..., None]) + col * a[..., None]


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


# ------------------------------------------------------------- background ----
def background(kind):
    R = np.hypot(XX - CX, YY - CY) / (SIDE * 0.52)
    t = np.clip(R, 0, 1) ** 1.35
    if kind == 'white':
        v = 1.0 - 0.035 * t
        return np.stack([255 * v, 255 * v, 255 * v * 1.004], axis=-1)
    if kind == 'light':
        c0 = np.array([255, 255, 255], float)
        c1 = np.array([196, 224, 246], float)
        col = c0 * (1 - t[..., None]) + c1 * t[..., None]
        ang = np.clip(((XX - CX) * 0.7 + (YY - CY) * 0.7) / (SIDE * 0.72) + 0.5, 0, 1)
        col = col * (1 - 0.08 * ang[..., None]) + np.array([178, 208, 236]) * (0.08 * ang[..., None])
        return col
    c0 = np.array([20, 52, 84], float)
    c1 = np.array([5, 14, 27], float)
    return c0 * (1 - t[..., None]) + c1 * t[..., None]


# ------------------------------------------------------------------- rim ----
def rim_rgb(R, F, base, hgt=7.0):
    RUN = np.clip((R - RI) / (RO - RI), 0, 1)
    edge = np.minimum(np.clip(RUN / 0.18, 0, 1), np.clip((1 - RUN) / 0.16, 0, 1))
    hr = hgt * edge ** 0.45 + 0.55 * np.sin(np.pi * RUN)
    gy, gx = np.gradient(hr)
    rx = np.clip(gx * K, -7, 7)
    ry = np.clip(gy * K, -7, 7)
    rn = np.sqrt(rx * rx + ry * ry + 1.0)
    rx, ry, rz = -rx / rn, -ry / rn, 1.0 / rn
    diff = np.clip(rx * Lx + ry * Ly + rz * Lz, 0, 1)
    fill = np.clip(-(rx * 0.60 + ry * 0.60 + rz * 0.35), 0, 1)
    shade = (0.44 + 0.76 * diff + 0.10 * fill) * (0.92 + 0.20 * F)
    rgb = np.array(base, float) * shade[..., None]
    sp = np.clip(rx * Hx + ry * Hy + rz * Hz, 0, 1)
    spec = np.clip(sp ** 60 * 1.20 + sp ** 11 * 0.08, 0, 1) * (0.35 + 0.65 * F)
    rgb = rgb * (1 - spec[..., None]) + 255.0 * spec[..., None]
    d_out = RO - R
    d_in = R - RI
    cont = np.clip(1.0 - np.minimum(d_out, d_in) / 1.4, 0, 1) ** 1.1
    rgb = rgb * (1 - (0.42 * (0.55 + 0.45 * (1 - F)) * cont)[..., None])
    hl = np.clip(1.0 - (RO - R) / 1.0, 0, 1) * F ** 1.6
    rgb = np.clip(rgb + 255.0 * (hl * 0.60)[..., None], 0, 255)
    return rgb


# ----------------------------------------------------------------- glass ----
def glass(bg):
    R = np.hypot(XX - CX, YY - CY)
    m = np.clip((RI - R) * K, 0, 1)
    t = np.clip(((XX - CX) * 0.45 + (YY - CY) * 0.90) / (RI * 1.9) + 0.5, 0, 1)
    c0 = np.array([246, 254, 255], float)
    c1 = np.array([158, 200, 232], float)
    col = c0 * (1 - t[..., None]) + c1 * t[..., None]
    bg = over(bg, col, m)
    F = 0.5 + 0.5 * np.cos(np.arctan2(YY - CY, XX - CX) + 2.356)
    sh = np.clip((R - (RI - 7.5)) / 7.5, 0, 1) ** 1.7 * (0.26 + 0.34 * F)
    bg = over(bg, (22, 84, 128), sh * m)
    lip = np.exp(-((R - (RI - 1.7)) / 1.2) ** 2)
    bg = over(bg, (255, 255, 255), lip * 0.80 * m)
    g = 0.40 * np.exp(-((((XX - CX) + RI * 0.30) / (RI * 0.50)) ** 2
                        + (((YY - CY) + RI * 0.50) / (RI * 0.24)) ** 2))
    bg = over(bg, (255, 255, 255), g * m)
    g2 = 0.28 * np.exp(-((((XX - CX) + RI * 0.12) / (RI * 0.15)) ** 2
                         + (((YY - CY) + RI * 0.54) / (RI * 0.085)) ** 2))
    bg = over(bg, (255, 255, 255), g2 * m)
    return bg


# ------------------------------------------------------------------- bar -----
def bar(bg, cx, cy, w, h):
    rad = h * 0.5
    d = rrect(XX, YY, cx, cy, w, h, rad)
    a = np.clip(0.5 - d * K, 0, 1)
    bg = over(bg, (26, 56, 92), blur(a, 2.2, 1.6, 2.6) * 0.40)
    d2 = rrect(XX, YY, cx, cy + 1.5, w, h, rad)
    lip = np.clip(0.5 - d2 * K, 0, 1) * (1 - a)
    bg = over(bg, (142, 186, 212), lip)
    t = np.clip((cy + h * 0.5 - YY) / h, 0, 1)
    rgb = np.array([252, 254, 255], float) * (0.90 + 0.12 * t)[..., None]
    g = np.exp(-(((YY - (cy - h * 0.34)) / (h * 0.15)) ** 2)) * 0.60
    g = g * np.clip((w * 0.5 - np.abs(XX - cx)) / (w * 0.5), 0, 1)
    rgb = rgb * (1 - g[..., None]) + 255.0 * g[..., None]
    cont = np.clip(1.0 - (-d) / 0.7, 0, 1)
    rgb = rgb * (1 - 0.24 * cont[..., None])
    return over(bg, np.clip(rgb, 0, 255), a)


# ---------------------------------------------------------------- handle ----
def handle_parts(r_g, r_c, u_g1):
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

    c0, c1 = RO - 2.0, RO + 5.0
    g0, g1 = RO + 4.0, u_g1
    d_col = cap(DU, DV, c0, c1, r_c)
    d_grp = cap(DU, DV, g0, g1, r_g)
    d = np.minimum(d_col, d_grp)
    a = np.clip(0.5 - d * K, 0, 1)

    gx, gy, gz = capn(DU, DV, g0, g1)
    gd = np.clip(gx * Lx + gy * Ly + gz * Lz, 0, 1)
    gs = np.clip(gx * Hx + gy * Hy + gz * Hz, 0, 1)
    grip = np.array(CFG['grip'], float) * (0.70 + 0.54 * gd)[..., None]
    grip = grip * (1 - np.clip(gs ** 16 * 0.45, 0, 1)[..., None]) \
        + 255.0 * np.clip(gs ** 16 * 0.45, 0, 1)[..., None]
    cxn, cyn, czn = capn(DU, DV, c0, c1)
    cd = np.clip(cxn * Lx + cyn * Ly + czn * Lz, 0, 1)
    cs = np.clip(cxn * Hx + cyn * Hy + czn * Hz, 0, 1)
    col = np.array([208, 218, 228], float) * (0.58 + 0.72 * cd)[..., None]
    col = col * (1 - np.clip(cs ** 9 * 0.42, 0, 1)[..., None]) \
        + 255.0 * np.clip(cs ** 9 * 0.42, 0, 1)[..., None]
    col = col * (1 - 0.26 * np.clip(1 - np.abs(DU - c1) / 2.4, 0, 1))[..., None]
    rgb = np.where((d_col < d_grp)[..., None], col, grip)
    cont = np.clip(1.0 - (-d) / 1.1, 0, 1) ** 1.2
    return np.clip(rgb * (1 - (0.36 * cont)[..., None]), 0, 255), a


# ------------------------------------------------------------------ build ---
def build():
    bg = background(CFG['bg'])
    dark = CFG['bg'] == 'dark'

    bg = glass(bg)

    R = np.hypot(XX - CX, YY - CY)
    A = np.arctan2(YY - CY, XX - CX)
    F = 0.5 + 0.5 * np.cos(A + 2.356)
    rim_a = np.clip((R - (RI - 0.3)) * K, 0, 1) * np.clip((RO + 0.3 - R) * K, 0, 1)
    rim_col = rim_rgb(R, F, CFG['ring'])
    h_col, h_a = handle_parts(9.8, 8.8, RO + 28.0)

    obj_a = np.clip(rim_a + h_a, 0, 1)
    if dark:
        bg = over(bg, (0, 200, 236), blur(obj_a, 5.0) * 0.50)
        bg = over(bg, (0, 150, 205), blur(obj_a, 13.0) * 0.34)
        bg = over(bg, (0, 40, 70), blur(obj_a, 1.6, 3.0, 2.4) * 0.35)
    else:
        bg = over(bg, (10, 24, 44), blur(obj_a, 1.4, 2.8, 2.0) * 0.62)
        bg = over(bg, (26, 52, 88), blur(obj_a, 5.4, 5.0, 3.8) * 0.52)

    for (bx, by, bw, bh) in ROWS:
        bg = bar(bg, bx, by, bw, bh)

    bg = over(bg, h_col, h_a)
    bg = over(bg, rim_col, rim_a)

    # crisp join where the rim meets the glass
    line = np.exp(-((R - RI) / 0.55) ** 2) * np.clip((RI - R) * K, 0, 1) * 0.45
    bg = over(bg, (16, 46, 74), line)
    return bg


def save(name, bg):
    big = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.5, percent=30, threshold=2))
    big.save(f'{OUT_DIR}/{name}.png')
    big.resize((512, 512), Image.LANCZOS).save(f'{OUT_DIR}/{name}-512.png')
    print('wrote', name)


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for key in VARIANTS:
        if which in ('all', key):
            CFG = VARIANTS[key]
            globals()['CFG'] = CFG
            save(f'w3-{key}', build())
