"""Build the draft comparison sheets (main sheet + corner detail sheet)."""
from PIL import Image, ImageDraw, ImageFont
import pathlib

D = pathlib.Path('src-tauri/icons/drafts')
SRC = 'src-tauri/icons/new_icon.png'
ART = (18, 19, 211, 213)          # the same crop edit_icon.py uses
FONT = 'C:/Windows/Fonts/msyh.ttc'
BOLD = 'C:/Windows/Fonts/msyhbd.ttc'

INK = (15, 23, 42)
MUTED = (100, 116, 139)
BG = (237, 242, 247)
CARD = (255, 255, 255)
LINE = (219, 227, 238)
SHEET_BG = (255, 255, 255)
DARK = (15, 23, 42)


def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def load_square(fn):
    """512 (or 1024) square render of one variant."""
    if fn is None:
        im = Image.open(SRC).convert('RGB')
        icon = im.crop(ART)
        side = int(round(max(icon.size) * 1.12))
        canvas = Image.new('RGB', (side, side), (255, 255, 255))
        canvas.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
        return canvas.resize((1024, 1024), Image.LANCZOS)
    return Image.open(D / fn).convert('RGB')


VARIANTS = [
    ('原图', '深藏青气泡 · 4 行文字', None),
    ('A  宝石蓝 · 标准', '气泡 ×1.09 · 四角留出呼吸感', 'v-azure-s109.png'),
    ('B  宝石蓝 · 贴边', '气泡 ×1.13 · 四角几乎贴住镜片', 'v-azure-s113.png'),
    ('C  电光蓝 · 标准', '气泡 ×1.09 · 整体更亮更鲜', 'v-vivid-s109.png'),
    ('D  电光蓝 · 贴边', '气泡 ×1.13 · 更亮 + 几乎贴边', 'v-vivid-s113.png'),
]


def draw_centered(d, cx, y, text, font, fill):
    box = d.textbbox((0, 0), text, font=font)
    d.text((cx - (box[2] - box[0]) / 2, y), text, font=font, fill=fill)


# ------------------------------------------------------------ main sheet ----
CW, CH, GAP, PAD = 320, 604, 18, 28
HEAD = 86
W = PAD * 2 + len(VARIANTS) * CW + (len(VARIANTS) - 1) * GAP
H = HEAD + CH + PAD
sheet = Image.new('RGB', (W, H), SHEET_BG)
d = ImageDraw.Draw(sheet)

d.text((PAD, 22), '图标草案对比 · 气泡放大 / 鲜亮蓝 / 三行文字', font=f(24, True), fill=INK)
d.text((PAD, 56), '全部用 PNG 位图在原图基础上重绘气泡，放大镜外壳、镜片与手柄保留原始像素与光影。',
       font=f(13), fill=MUTED)

for i, (label, spec, fname) in enumerate(VARIANTS):
    x = PAD + i * (CW + GAP)
    y = HEAD
    d.rounded_rectangle([x, y, x + CW, y + CH], 20, fill=CARD, outline=LINE, width=2)

    d.text((x + 20, y + 16), label, font=f(17, True), fill=INK)
    d.text((x + 20, y + 42), spec, font=f(12), fill=MUTED)

    im = load_square(fname)
    sheet.paste(im.resize((280, 280), Image.LANCZOS), (x + 20, y + 70))

    # small-size check: 64 / 32 / 16 on dark and light
    d.text((x + 20, y + 362), '实际尺寸可读性', font=f(12, True), fill=MUTED)
    groups = [(64, '64 px'), (32, '32 px'), (16, '16 px')]
    for gi, (sz, gname) in enumerate(groups):
        gx = x + 24 + gi * 92
        for row, bg in enumerate((DARK, (255, 255, 255))):
            ty = y + 386 + row * 78
            d.rounded_rectangle([gx - 6, ty - 6, gx + 70, ty + 70], 10,
                                fill=bg, outline=(203, 213, 225), width=1)
            sheet.paste(im.resize((sz, sz), Image.LANCZOS),
                        (gx + (64 - sz) // 2, ty + (64 - sz) // 2))
        draw_centered(d, gx + 32, y + 536, gname, f(11), MUTED)

    d.text((x + 20, y + 566), '深色 / 浅色背景各一枚', font=f(11), fill=(148, 163, 184))
    d.text((x + 20, y + 584), fname or 'new_icon.png', font=f(10), fill=(148, 163, 184))

sheet.save(D / 'compare_drafts.png')
print('wrote compare_drafts.png', sheet.size)

# ------------------------------------------------------- corner detail ----
DEFS = {
    '左上': (62, 86),
    '右上': (301, 86),
    '左下 (含尾巴)': (62, 250),
    '右下': (301, 250),
}
BOXC = 130          # crop size in 512-space
TILE = 260          # 2x for inspection
LEFT = 108
COLGAP = 12
ROWH = 272
CW2 = TILE
W2 = PAD * 2 + LEFT + 4 * CW2 + 3 * COLGAP
H2 = HEAD + 34 + 4 * ROWH + PAD - 20
corner = Image.new('RGB', (W2, H2), SHEET_BG)
c = ImageDraw.Draw(corner)
c.text((PAD, 22), '四角贴边细节（2× 放大）', font=f(24, True), fill=INK)
c.text((PAD, 56), '对比气泡圆角与镜片内沿的间距；×1.09 留一条细白边，×1.13 基本贴住内沿。', font=f(13), fill=MUTED)

DRAFTS = [
    ('A  宝石蓝 ×1.09', 'v-azure-s109.png'),
    ('B  宝石蓝 ×1.13', 'v-azure-s113.png'),
    ('C  电光蓝 ×1.09', 'v-vivid-s109.png'),
    ('D  电光蓝 ×1.13', 'v-vivid-s113.png'),
]
for ci, (name, fn) in enumerate(DRAFTS):
    cx = PAD + LEFT + ci * (CW2 + COLGAP)
    draw_centered(c, cx + TILE / 2, HEAD - 6, name, f(15, True), INK)
    im = Image.open(D / fn).convert('RGB').resize((512, 512), Image.LANCZOS)
    for ri, (cname, (bx, by)) in enumerate(DEFS.items()):
        ty = HEAD + 34 + ri * ROWH
        crop = im.crop((bx, by, bx + BOXC, by + BOXC)).resize((TILE, TILE), Image.LANCZOS)
        c.rounded_rectangle([cx - 3, ty - 3, cx + TILE + 3, ty + TILE + 3],
                            10, outline=LINE, width=2)
        corner.paste(crop, (cx, ty))
    for ri, cname in enumerate(DEFS):
        ty = HEAD + 34 + ri * ROWH + TILE / 2 - 8
        c.text((PAD, ty), cname, font=f(13, True), fill=MUTED)

corner.save(D / 'corners.png')
print('wrote corners.png', corner.size)
