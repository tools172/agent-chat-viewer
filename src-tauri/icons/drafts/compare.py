"""Build a before/after comparison sheet for the edited icon variants."""
from PIL import Image, ImageDraw
import pathlib

D = pathlib.Path('src-tauri/icons/drafts')
ART = (18, 19, 211, 213)   # same crop the edit script uses
MARGIN = 1.12

variants = [
    ('original', None),
    ('azure 1.09', 'v-azure-s109.png'),
    ('royal 1.09', 'v-royal-s109.png'),
    ('azure 1.06', 'v-azure-s106.png'),
]


def square(im):
    icon = im.crop(ART)
    side = int(round(max(icon.size) * MARGIN))
    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
    return canvas.resize((512, 512), Image.LANCZOS)


orig = square(Image.open('src-tauri/icons/new_icon.png').convert('RGB'))

CW, CH = 300, 560
GAP, PAD = 18, 18
W = PAD * 2 + len(variants) * CW + (len(variants) - 1) * GAP
H = PAD * 2 + CH
sheet = Image.new('RGB', (W, H), (237, 242, 247))
d = ImageDraw.Draw(sheet)

for i, (label, fname) in enumerate(variants):
    x = PAD + i * (CW + GAP)
    y = PAD
    d.rounded_rectangle([x, y, x + CW, y + CH], 22, fill=(248, 250, 252), outline=(219, 227, 238), width=2)
    d.text((x + CW // 2 - 6 * len(label), y + 16), label.upper(), fill=(15, 23, 42))
    im = orig if fname is None else Image.open(D / fname).convert('RGB').resize((512, 512), Image.LANCZOS)
    sheet.paste(im.resize((248, 248), Image.LANCZOS), (x + 26, y + 52))
    for j, (sz, bg) in enumerate([(64, (15, 23, 42)), (64, (255, 255, 255)), (32, (15, 23, 42)), (32, (255, 255, 255))]):
        px = x + 26 + j * 62
        py = y + 330
        d.rounded_rectangle([px - 6, py - 6, px + sz + 6, py + sz + 6], 10, fill=bg, outline=(203, 213, 225))
        sheet.paste(im.resize((sz, sz), Image.LANCZOS), (px, py))
    d.text((x + 26, y + 440), '64px on dark / light, 32px on dark / light', fill=(100, 116, 139))

sheet.save(D / 'compare.png')
print('wrote compare.png', sheet.size)
