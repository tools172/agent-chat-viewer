"""Analyse the geometry of the icon inside new_icon.png (dev helper)."""
from PIL import Image
import numpy as np

im = Image.open('src-tauri/icons/new_icon.png').convert('RGB')
a = np.asarray(im).astype(int)
reg = a[:, :215]
r, g, b = reg[:, :, 0], reg[:, :, 1], reg[:, :, 2]

cyan = (b > 130) & (g > 100) & (b > r + 45) & (g > r + 10)
ys, xs = np.where(cyan)
print('cyan bbox', xs.min(), ys.min(), xs.max(), ys.max())
cx, cy = xs.mean(), ys.mean()
print('cyan centroid', round(cx, 2), round(cy, 2))
d = np.hypot(xs - cx, ys - cy)
print('cyan radius pct 1,50,99,100:', [round(float(np.percentile(d, p)), 2) for p in (1, 50, 99, 100)])

# inner boundary of the ring = for each angle, smallest radius of cyan
ang = np.arctan2(ys - cy, xs - cx)
bins = np.linspace(-np.pi, np.pi, 361)
inner_pts = []
for i in range(360):
    m = (ang >= bins[i]) & (ang < bins[i + 1])
    if m.sum():
        inner_pts.append((xs[m].min(), ys[m].min()))
# fit circle to inner boundary points (only where the lens is light behind)
pts = np.array(inner_pts, dtype=float)
A = np.c_[2 * pts[:, 0], 2 * pts[:, 1], np.ones(len(pts))]
bb = (pts ** 2).sum(axis=1)
sol, *_ = np.linalg.lstsq(A, bb, rcond=None)
icx, icy = sol[0], sol[1]
R = np.sqrt(sol[2] + icx ** 2 + icy ** 2)
print('inner circle fit', round(icx, 2), round(icy, 2), 'R=', round(R, 2))

# bubble = dark navy
dark = (reg.sum(axis=2) < 470) & (b > r) & (b > g)
ys2, xs2 = np.where(dark)
print('dark bbox', xs2.min(), ys2.min(), xs2.max(), ys2.max())
# restrict to the lens area
inside = np.hypot(xs2 - icx, ys2 - icy) < R - 1
bx, by = xs2[inside], ys2[inside]
print('bubble bbox', bx.min(), by.min(), bx.max(), by.max())
print('bubble center', round((bx.min() + bx.max()) / 2, 1), round((by.min() + by.max()) / 2, 1))
dd = np.hypot(bx - icx, by - icy)
print('bubble radius pct 50,99,100:', [round(float(np.percentile(dd, p)), 2) for p in (50, 99, 100)])
print('farthest bubble pixel', bx[np.argmax(dd)], by[np.argmax(dd)], round(float(dd.max()), 2))

# scan tail: bottom rows of bubble
for y in range(int(by.max()) - 12, int(by.max()) + 1):
    row = np.where(dark[y] & (np.hypot(np.arange(215) - icx, y - icy) < R))[0]
    if len(row):
        print('row', y, row.min(), row.max())

# distance of the bubble corners: bbox corners
for name, (px, py) in {
    'tl': (bx.min(), by.min()), 'tr': (bx.max(), by.min()),
    'bl': (bx.min(), by.max()), 'br': (bx.max(), by.max()),
}.items():
    print('bbox corner', name, round(float(np.hypot(px - icx, py - icy)), 2))
