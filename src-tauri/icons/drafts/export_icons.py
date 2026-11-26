"""Export the chosen icon (12A / w7-a.png) into the Tauri bundle assets.

Writes:
  src-tauri/icons/32x32.png
  src-tauri/icons/128x128.png
  src-tauri/icons/128x128@2x.png
  src-tauri/icons/icon.png            (512 fallback)
  src-tauri/icons/icon.ico            (16/24/32/48/64/128/256)
  src-tauri/icons/icon.icns           (16/32/64/128/256/512/1024)

Usage: python src-tauri/icons/drafts/export_icons.py
"""
from PIL import Image
import struct

SRC = 'src-tauri/icons/drafts/w7-a.png'   # 12A: transparent, no shadow, no glow
OUT = 'src-tauri/icons'

im = Image.open(SRC).convert('RGBA')
assert im.size == (1024, 1024), im.size


def px(n):
    return im.resize((n, n), Image.LANCZOS)


# ---- plain PNGs ----
for size, name in ((16, '16x16.png'), (24, '24x24.png'), (32, '32x32.png'),
                   (48, '48x48.png'), (64, '64x64.png'), (128, '128x128.png'),
                   (256, '128x128@2x.png'), (512, 'icon.png')):
    px(size).save(f'{OUT}/{name}')
    print('png', name, size)

# ---- .ico (multi size, PNG compressed by PIL) ----
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
im.save(f'{OUT}/icon.ico', sizes=ico_sizes)
print('ico', ico_sizes)

# ---- .icns (PNG-embedded entries, macOS 10.7+) ----
ICNS_TYPES = [('icp4', 16), ('icp5', 32), ('icp6', 64),
              ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024)]
chunks = []
for code, size in ICNS_TYPES:
    p = f'{OUT}/_tmp_{size}.png'
    px(size).save(p)
    data = open(p, 'rb').read()
    chunks.append(code.encode('ascii') + struct.pack('>I', len(data) + 8) + data)
body = b''.join(chunks)
with open(f'{OUT}/icon.icns', 'wb') as f:
    f.write(b'icns' + struct.pack('>I', len(body) + 8) + body)
print('icns', ICNS_TYPES)
