"""Draw a set of Windows-ish companion icons for the desktop / taskbar mockup.

Everything is procedural (PIL), rendered at 2x and downsampled to 256, so the
mockup can use them at 16-96px without external assets.

Usage: python src-tauri/icons/drafts/make_mock_icons.py
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math
import os

S = 512                     # supersampled canvas
T = 256                     # logical size
OUT = 'src-tauri/icons/drafts'
os.makedirs(OUT, exist_ok=True)


def box(x0, y0, x1, y1):
    return (x0 * 2, y0 * 2, x1 * 2, y1 * 2)


def canvas():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def mask_of(box_, radius=0):
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle(box_, radius=radius, fill=255)
    return m


def vgrad(box_, c0, c1, radius=0, alpha=255):
    im = Image.new('RGB', (1, S))
    d = ImageDraw.Draw(im)
    for y in range(S):
        t = y / (S - 1)
        d.point((0, y), tuple(int(c0[i] * (1 - t) + c1[i] * t) for i in range(3)))
    im = im.resize((S, S))
    out = im.convert('RGBA')
    m = mask_of(box_, radius)
    if alpha < 255:
        m = m.point(lambda v: v * alpha // 255)
    out.putalpha(m)
    return out


def hgrad(box_, c0, c1, radius=0):
    im = Image.new('RGB', (S, 1))
    d = ImageDraw.Draw(im)
    for x in range(S):
        t = x / (S - 1)
        d.point((x, 0), tuple(int(c0[i] * (1 - t) + c1[i] * t) for i in range(3)))
    im = im.resize((S, S)).convert('RGBA')
    im.putalpha(mask_of(box_, radius))
    return im


def rr_layer(box_, radius, fill):
    im = canvas()
    ImageDraw.Draw(im).rounded_rectangle(box_, radius=radius, fill=fill)
    return im


def poly_layer(pts, fill):
    im = canvas()
    ImageDraw.Draw(im).polygon(pts, fill=fill)
    return im


def ell_layer(box_, fill):
    im = canvas()
    ImageDraw.Draw(im).ellipse(box_, fill=fill)
    return im


def shadow(img, dy=6, blur=10, alpha=70):
    a = img.split()[3].filter(ImageFilter.GaussianBlur(blur))
    a = a.point(lambda v: v * alpha // 255)
    sh = Image.new('RGBA', (S, S), (10, 20, 35, 0))
    sh.putalpha(a)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(sh, (0, int(dy * 2)))
    out.alpha_composite(img)
    return out


def gloss(box_, radius, top=0.55, bottom=0.15):
    """A soft white sheen over the top of a rounded rect."""
    m = mask_of(box_, radius)
    g = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(g)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=int(255 * 0))
    out = Image.new('RGBA', (S, S), (255, 255, 255, 0))
    grad = Image.new('L', (1, int((box_[3] - box_[1]) * 0.55)))
    gd = ImageDraw.Draw(grad)
    for y in range(grad.height):
        t = y / max(1, grad.height - 1)
        gd.point((0, y), int(255 * (1 - t) ** 1.6))
    grad = grad.resize((S, grad.height))
    a = Image.new('L', (S, S), 0)
    a.paste(grad, (0, box_[1]))
    a = Image.composite(a, Image.new('L', (S, S), 0), m)
    out.putalpha(a.point(lambda v: v * 55 // 255))
    return out


# ------------------------------------------------------------------ icons ----
def icon_this_pc():
    img = canvas()
    # stand
    img.alpha_composite(poly_layer([(228, 336), (284, 336), (300, 402), (212, 402)],
                                   (196, 208, 220, 255)))
    img.alpha_composite(rr_layer(box(150, 396, 362, 416), 8, (176, 188, 202, 255)))
    # bezel
    img.alpha_composite(rr_layer(box(44, 46, 468, 348), 30, (28, 44, 62, 255)))
    # screen
    scr = vgrad(box(58, 60, 454, 334), (126, 216, 255), (26, 106, 196), radius=22)
    img.alpha_composite(scr)
    # window on screen
    img.alpha_composite(rr_layer(box(96, 96, 240, 200), 12, (255, 255, 255, 60)))
    img.alpha_composite(rr_layer(box(96, 216, 330, 240), 10, (255, 255, 255, 90)))
    img.alpha_composite(rr_layer(box(96, 256, 280, 280), 10, (255, 255, 255, 60)))
    # gloss
    img.alpha_composite(poly_layer([(58, 60), (454, 60), (454, 130), (58, 200)],
                                   (255, 255, 255, 34)))
    return downsample(shadow(img, dy=7, blur=11, alpha=80))


def icon_explorer(folder_front=(255, 196, 72), folder_back=(214, 148, 40)):
    img = canvas()
    # back + tab
    img.alpha_composite(rr_layer(box(34, 62, 150, 96), 12, folder_back + (255,)))
    img.alpha_composite(rr_layer(box(34, 74, 458, 424), 22, folder_back + (255,)))
    # front
    front = vgrad(box(30, 108, 462, 428), folder_front, (233, 154, 46), radius=22)
    img.alpha_composite(front)
    img.alpha_composite(gloss(box(30, 108, 462, 428), 22))
    return downsample(shadow(img, dy=7, blur=11, alpha=80))


def icon_recycle():
    img = canvas()
    body = vgrad(box(78, 118, 434, 442), (208, 226, 240), (128, 156, 180), radius=26, alpha=238)
    # ridges
    img.alpha_composite(body)
    for x in (140, 196, 252, 308, 364):
        img.alpha_composite(rr_layer(box(x - 5, 150, x + 5, 420), 5, (255, 255, 255, 60)))
    # lid
    img.alpha_composite(rr_layer(box(62, 92, 450, 136), 22, (150, 174, 194, 255)))
    img.alpha_composite(rr_layer(box(62, 92, 450, 112), 16, (196, 214, 230, 255)))
    img.alpha_composite(rr_layer(box(210, 62, 302, 96), 14, (168, 190, 210, 255)))
    # recycle mark
    img.alpha_composite(poly_layer([(210, 208), (272, 208), (241, 262)],
                                   (255, 255, 255, 150)))
    img.alpha_composite(poly_layer([(302, 274), (240, 274), (271, 220)],
                                   (255, 255, 255, 110)))
    return downsample(shadow(img, dy=7, blur=11, alpha=70))


def icon_network():
    img = canvas()
    c, r = 256, 176
    body = ell_layer((c - r, c - r, c + r, c + r), (0, 0, 0, 255))
    # radial-ish gradient by stacking
    ball = vgrad((c - r, c - r, c + r, c + r), (140, 226, 255), (14, 92, 172), radius=r)
    img.alpha_composite(ball)
    # meridians
    d = ImageDraw.Draw(img)
    for k in (0.42, 0.74):
        d.ellipse((c - r * k, c - r, c + r * k, c + r), outline=(255, 255, 255, 90), width=6)
    d.ellipse((c - r, c - r * 0.42, c + r, c + r * 0.42), outline=(255, 255, 255, 90), width=6)
    d.ellipse((c - r, c - r * 0.78, c + r, c + r * 0.78), outline=(255, 255, 255, 60), width=5)
    # gloss
    img.alpha_composite(ell_layer((c - r * 0.62, c - r * 0.74, c + r * 0.16, c - r * 0.16),
                                  (255, 255, 255, 60)))
    return downsample(shadow(img, dy=7, blur=11, alpha=70))


def icon_terminal():
    img = canvas()
    img.alpha_composite(vgrad(box(36, 36, 476, 476), (44, 56, 72), (14, 20, 30), radius=44))
    img.alpha_composite(rr_layer(box(36, 36, 476, 96), 40, (52, 66, 84, 255)))
    for i, col in enumerate([(255, 96, 92), (255, 196, 72), (96, 214, 120)]):
        img.alpha_composite(ell_layer(box(62 + i * 34, 54, 88 + i * 34, 80), col + (255,)))
    # prompt
    img.alpha_composite(poly_layer([(96, 190), (128, 222), (96, 254), (110, 268),
                                    (158, 222), (110, 176)], (150, 238, 190, 255)))
    img.alpha_composite(rr_layer(box(176, 244, 320, 264), 10, (232, 244, 255, 255)))
    img.alpha_composite(rr_layer(box(176, 288, 268, 308), 10, (150, 180, 208, 255)))
    return downsample(shadow(img, dy=7, blur=11, alpha=80))


def icon_settings():
    img = canvas()
    c = 256
    pts = []
    teeth, r_out, r_in = 8, 200, 156
    for i in range(teeth):
        a = math.pi * 2 * i / teeth
        for da, rr_ in ((-0.34, r_in), (-0.19, r_out), (0.19, r_out), (0.34, r_in)):
            pts.append(((c + rr_ * math.sin(a + da)) * 2,
                        (c - rr_ * math.cos(a + da)) * 2))
    m = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(m)
    md.polygon(pts, fill=255)
    md.ellipse(box(c - 66, c - 66, c + 66, c + 66), fill=0)
    grad = vgrad((0, 0, S, S), (232, 240, 250), (150, 170, 192), 0)
    grad.putalpha(m)
    img.alpha_composite(grad)
    # inner ring shading
    ring = canvas()
    ImageDraw.Draw(ring).ellipse(box(c - 150, c - 150, c + 150, c + 150),
                                 outline=(255, 255, 255, 70), width=10)
    ring.putalpha(Image.composite(ring.split()[3], Image.new('L', (S, S), 0), m))
    img.alpha_composite(ring)
    return downsample(shadow(img, dy=7, blur=11, alpha=70))


def icon_browser():
    img = canvas()
    c, r = 256, 186
    img.alpha_composite(vgrad((c - r, c - r, c + r, c + r), (126, 234, 255), (10, 110, 190), radius=r))
    # swirl
    d = ImageDraw.Draw(img)
    for k, w, a in ((1.0, 26, 120), (0.72, 18, 90)):
        d.arc((c - r * k, c - r * k * 0.9, c + r * k, c + r * k), 200, 340,
              fill=(255, 255, 255, a), width=w * 2)
    img.alpha_composite(ell_layer((c - 60, c - 60, c + 60, c + 60), (255, 255, 255, 40)))
    img.alpha_composite(ell_layer((c - r * 0.6, c - r * 0.8, c + r * 0.1, c - r * 0.2),
                                  (255, 255, 255, 70)))
    return downsample(shadow(img, dy=7, blur=11, alpha=70))


def icon_notepad():
    img = canvas()
    # page
    img.alpha_composite(vgrad(box(64, 40, 448, 456), (255, 255, 255), (226, 236, 246), radius=18))
    # header
    img.alpha_composite(rr_layer(box(64, 40, 448, 108), 18, (58, 140, 226, 255)))
    img.alpha_composite(rr_layer(box(64, 88, 448, 112), 0, (58, 140, 226, 255)))
    # lines
    for i, w in enumerate((300, 320, 260, 300, 240)):
        y = 160 + i * 56
        img.alpha_composite(rr_layer(box(104, y, 104 + w, y + 22), 11, (176, 196, 216, 255)))
    # folded corner
    img.alpha_composite(poly_layer([(448, 40), (448, 120), (368, 40)], (206, 220, 236, 255)))
    return downsample(shadow(img, dy=7, blur=11, alpha=80))


def icon_photos():
    frame = box(40, 56, 472, 440)
    art = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    art.alpha_composite(vgrad(frame, (150, 218, 255), (226, 246, 255), 0))
    art.alpha_composite(ell_layer(box(322, 88, 400, 166), (255, 224, 120, 255)))
    art.alpha_composite(poly_layer([(40, 440), (188, 246), (312, 440)], (92, 172, 122, 255)))
    art.alpha_composite(poly_layer([(196, 440), (338, 226), (472, 440)], (60, 128, 94, 255)))
    art.alpha_composite(rr_layer(box(40, 372, 472, 440), 0, (255, 255, 255, 50)))
    m = mask_of(frame, 28)
    art.putalpha(Image.composite(art.split()[3], Image.new('L', (S, S), 0), m))
    img = canvas()
    img.alpha_composite(art)
    return downsample(shadow(img, dy=7, blur=11, alpha=80))


ICONS = {
    'this-pc': icon_this_pc,
    'explorer': icon_explorer,
    'recycle': icon_recycle,
    'network': icon_network,
    'terminal': icon_terminal,
    'settings': icon_settings,
    'browser': icon_browser,
    'notepad': icon_notepad,
    'photos': icon_photos,
}


def downsample(img):
    return img.resize((T, T), Image.LANCZOS)


if __name__ == '__main__':
    for name, fn in ICONS.items():
        im = fn()
        im.save(f'{OUT}/mock-{name}.png')
        print('wrote', name)
    # the app icon itself, for convenience at the same size
    src = Image.open(f'{OUT}/w7-a.png').convert('RGBA').resize((T, T), Image.LANCZOS)
    src.save(f'{OUT}/mock-app.png')
    print('wrote app')
