"""Render true 32/16 px thumbnails and a one-page HTML comparison sheet."""
from PIL import Image
import pathlib

D = pathlib.Path('src-tauri/icons/drafts')
SRC = 'src-tauri/icons/new_icon.png'
ART = (18, 19, 211, 213)          # same crop edit_icon.py / compare_drafts.py use

# round 12: the same icon on a transparent background (RGBA)
W7 = [
    ('w7-a', '12A', '透明底 · 纯净', '只有图形本身，无背景、无投影'),
    ('w7-b', '12B', '透明底 · 接触影 + 微光', '带一层贴身接触影和一点青色柔光'),
]
# round 11: single vivid deep blue lines
W6 = [
    ('w6-a', '11A', '白底', '横线统一用鲜亮深蓝 · 环抬高 13px'),
    ('w6-b', '11B', '浅蓝底 · 光晕', '同一套几何，环外柔光'),
    ('w6-c', '11C', '深蓝底 · 强光晕', '深色底 + 强光晕'),
]
# round 9: a magnifier with real thickness (walls + deep shadow)
W4 = [
    ('w4-a', '9A', '白底 · 厚镜圈', '顶面 + 外/内侧壁 + 深投影 · 平直白条'),
    ('w4-b', '9B', '浅蓝底', '同上，加浅蓝渐变背景'),
    ('w4-c', '9C', '深蓝底 · 发光', '同上，深色底 + 青色光晕'),
]
W3 = []
# concept drafts 2: no magnifier at all
NEWD = [
    ('d-a', 'E', '消息堆叠', '一叠消息卡，前面一张带两行字 · 讲"翻记录"'),
    ('d-b', 'F', '对话线程', '一条主线，消息左右分列 · 讲"一条对话"'),
    ('d-c', 'G', '双色气泡', '一个气泡，一半你一半 agent · 讲"对话双方"'),
    ('d-d', 'H', '气泡 + 时间轴', '气泡下面是带播放头的进度条 · 讲"回看"'),
]
# concept drafts: alternatives to "bubble inside the lens"
NEWC = [
    ('c-a', 'A', '放大镜压在气泡上', '镜片里是被放大的两行字 · 讲"查聊天"'),
    ('c-b', 'B', '镜片里就是聊天记录', '没有气泡，只有三行记录 · 讲"看记录"'),
    ('c-c', 'C', '气泡 + 小放大镜徽章', '气泡是主角，放大镜挂在角上'),
    ('c-d', 'D', '气泡 + 眼睛', '用"看"代替"搜"'),
]
# round 6: deeper ring cyan, real magnifier handle, bigger tail
NEW6D = [
    ('w2-b-soft', '薄', '厚度档位 · 薄', '倒角 1.6px · 侧面 2.2px · 投影较轻'),
    ('w2-b', '中', '厚度档位 · 中', '倒角 2.2px · 侧面 3.2px · 投影适中'),
    ('w2-b-deep', '厚', '厚度档位 · 厚', '倒角 3.0px · 侧面 4.4px · 投影更重'),
]
NEW6 = [
    ('w2-b', '6B', '宝石蓝 · 偏靛', '镜环加深 · 手柄重画 · 尾巴加大'),
    ('w2-d', '6D', '电光紫 · 偏紫', '同上，气泡偏紫'),
    ('w2-e', '6E', '深海蓝 · 最深', '同上，气泡最深'),
]
# round 4: physically shaded bubble (SDF height field) + torus ring
NEW4 = [
    ('z-a', '4A', '冰川蓝 · 青到钴', '镜环再粗约 20% · 气泡为 3D 高度场'),
    ('z-b', '4B', '宝石蓝 · 湛蓝到靛', '气泡更饱和 · 立体不变'),
    ('z-c', '4C', '湖水青 · 偏绿', '气泡顶部偏青绿 · 立体不变'),
    ('z-d', '4D', '电光蓝 · 偏紫', '气泡偏紫一档 · 立体不变'),
    ('z-e', '4E', '靛蓝 · 深邃', '气泡最深 · 立体不变'),
]
# round 3: parametric 3D ring, strong bubble gradient
NEW3 = [
    ('y-n', 'N', '霓虹蓝 · 青到紫', '镜环重绘加粗 · 气泡青顶紫底'),
    ('y-o', 'O', '钴蓝 · 偏青', '镜环重绘加粗 · 气泡偏青'),
    ('y-p', 'P', '星蓝 · 偏紫', '镜环重绘加粗 · 气泡偏紫'),
    ('y-q', 'Q', '水晶蓝 · 更亮', '镜环重绘加粗 · 气泡更亮'),
]
# round 2: light magnifier, 3D lens bezel, deep vivid bubble
NEW2 = [
    ('x-j', 'J', '深湛蓝 · 高对比', '气泡更深 · 镜环提亮 · 镜片边框重绘'),
    ('x-k', 'K', '宝蓝 · 更深', '气泡再深一档 · 镜环更亮'),
    ('x-l', 'L', '亮蓝 · 饱和', '气泡略亮 · 仍明显深于镜环'),
    ('x-m', 'M', '深湖蓝 · 最接近青', '气泡偏青一档 · 对比靠明度'),
]
# round 1: rounded square, two bars, vivid bright blue
NEW = [
    ('v-vivid-s109', 'C', '电光蓝 · 第一轮基准', '气泡 ×1.09 · 三行横线 · 偏深蓝'),
    ('s-vivid', 'E', '艳丽蓝 · 高饱和', '圆角方形 110×102 · 圆角 34 · 双横线'),
    ('s-azure', 'F', '湛蓝 · 亮蓝', '圆角方形 110×102 · 圆角 34 · 双横线'),
    ('s-lagoon', 'G', '湖水蓝', '圆角方形 110×102 · 圆角 34 · 双横线'),
    ('s-cyan', 'H', '青碧蓝 · 贴近镜环', '圆角方形 110×102 · 圆角 34 · 双横线'),
    ('s-sapphire', 'I', '宝蓝 · 偏纯蓝', '圆角方形 110×102 · 圆角 34 · 双横线'),
]
# previously generated options, kept for reference
OLD = [
    ('orig', '原图', '原图参考', '深藏青 · 4 行 · 未修改'),
    ('v-azure-s109', 'A', '宝石蓝 · 标准', '气泡 ×1.09 · 四角留细白边'),
    ('v-azure-s113', 'B', '宝石蓝 · 贴边', '气泡 ×1.13 · 四角接近镜片'),
    ('v-vivid-s113', 'D', '电光蓝 · 贴边', '气泡 ×1.13 · 更亮 + 贴边'),
]
VARIANTS = W7 + W6 + W4 + NEWD + NEWC + NEW6D + NEW6 + NEW4 + NEW3 + NEW2 + NEW + OLD
TB_VARIANTS = W7 + W6 + W4 + NEW6D + NEW6 + NEW4 + NEW3 + NEW2 + NEW + OLD


def load_square(fn):
    if fn == 'orig':
        im = Image.open(SRC).convert('RGB')
        icon = im.crop(ART)
        side = int(round(max(icon.size) * 1.12))
        canvas = Image.new('RGB', (side, side), (255, 255, 255))
        canvas.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
        out = canvas.resize((1024, 1024), Image.LANCZOS)
        out.save(D / '_orig_square.png')
        return out
    return Image.open(D / f'{fn}.png').convert('RGB')


for key, badge, title, desc in VARIANTS:
    im = load_square(key)
    for sz in (64, 32, 16):
        s = im.resize((sz, sz), Image.LANCZOS)
        s.save(D / f'_small_{key}_{sz}.png')
        s.resize((sz * 6, sz * 6), Image.NEAREST).save(D / f'_small_{key}_{sz}_x6.png')
        s.resize((sz * 8, sz * 8), Image.NEAREST).save(D / f'_small_{key}_{sz}_x8.png')
        if sz == 32:
            s.resize((sz * 5, sz * 5), Image.NEAREST).save(D / f'_small_{key}_{sz}_x5.png')


def card(key, badge, title, desc):
    hero = '_orig_square.png' if key == 'orig' else f'{key}-512.png'
    hero_cls = ' checker' if key.startswith('w7') else ''
    return f'''
    <section class="card">
      <header>
        <span class="badge">{badge}</span>
        <div><h2>{title}</h2><p>{desc}</p></div>
      </header>
      <div class="hero{hero_cls}"><img src="{hero}" alt="{title}"></div>

      <div class="size-row">
        <span class="size-label"><b>32</b><small>px</small></span>
        <div class="tile dark"><img src="_small_{key}_32.png" width="32" height="32" alt=""></div>
        <div class="tile light"><img src="_small_{key}_32.png" width="32" height="32" alt=""></div>
      </div>
      <div class="size-row">
        <span class="size-label"><b>16</b><small>px</small></span>
        <div class="tile dark"><img src="_small_{key}_16.png" width="16" height="16" alt=""></div>
        <div class="tile light"><img src="_small_{key}_16.png" width="16" height="16" alt=""></div>
      </div>

      <div class="zooms">
        <figure><img src="_small_{key}_32_x5.png" width="160" height="160" alt="">
          <figcaption>32px · 5×</figcaption></figure>
        <figure><img src="_small_{key}_16_x8.png" width="128" height="128" alt="">
          <figcaption>16px · 8×</figcaption></figure>
      </div>
    </section>'''


w7_cards = ''.join(card(*v) for v in W7)
w6_cards = ''.join(card(*v) for v in W6)
w4_cards = ''.join(card(*v) for v in W4)
newd_cards = ''.join(card(*v) for v in NEWD)
newc_cards = ''.join(card(*v) for v in NEWC)
new6d_cards = ''.join(card(*v) for v in NEW6D)
new6_cards = ''.join(card(*v) for v in NEW6)
new4_cards = ''.join(card(*v) for v in NEW4)
new3_cards = ''.join(card(*v) for v in NEW3)
new2_cards = ''.join(card(*v) for v in NEW2)
new_cards = ''.join(card(*v) for v in NEW)
old_cards = ''.join(card(*v) for v in OLD)

taskbar = ''.join(
    f'<div class="tb-item"><img src="_small_{key}_32.png" width="32" height="32" alt=""><span>{badge}</span></div>'
    for key, badge, title, desc in TB_VARIANTS)
tray = ''.join(
    f'<div class="tray-item"><img src="_small_{key}_16.png" width="16" height="16" alt=""><span>{badge}</span></div>'
    for key, badge, title, desc in TB_VARIANTS)

html = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>图标小尺寸对比 · 32px / 16px</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 28px 32px 48px;
    background: #eef2f7; color: #0f172a;
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  }}
  h1 {{ font-size: 24px; margin: 0 0 6px; letter-spacing: .2px; }}
  .sub {{ color: #64748b; font-size: 13px; margin: 0 0 22px; line-height: 1.7; }}
  .sub b {{ color: #334155; }}
  .section-title {{
    font-size: 16px; margin: 30px 0 4px; padding-left: 10px;
    border-left: 4px solid #2563eb; line-height: 1.35;
  }}
  .section-title:first-of-type {{ margin-top: 8px; }}
  .section-title small {{ font-weight: 400; color: #64748b; font-size: 12px; margin-left: 8px; }}
  .grid {{
    display: grid; gap: 16px; margin-top: 14px;
    grid-template-columns: repeat(auto-fit, minmax(286px, 1fr));
    align-items: start;
  }}
  .grid.old {{ opacity: .82; }}
  .card {{
    background: #fff; border: 1px solid #dbe3ee; border-radius: 18px;
    padding: 16px 16px 18px; box-shadow: 0 6px 20px rgba(15,23,42,.05);
  }}
  header {{ display: flex; gap: 10px; align-items: center; min-height: 42px; }}
  .badge {{
    flex: 0 0 38px; width: 38px; height: 38px; border-radius: 12px;
    background: linear-gradient(145deg,#2563eb,#1d4ed8); color: #fff;
    font: 700 17px/38px "Segoe UI", sans-serif; text-align: center;
  }}
  .card h2 {{ font-size: 15px; margin: 0 0 2px; }}
  .card header p {{ font-size: 11.5px; color: #64748b; margin: 0; }}
  .hero {{
    margin: 10px 0 6px; text-align: center;
    background: #fff; border: 1px solid #eef2f7;
    border-radius: 14px; padding: 6px;
  }}
  .hero.checker {{
    background-color: #fff;
    background-image:
      linear-gradient(45deg, #dfe7f1 25%, transparent 25%, transparent 75%, #dfe7f1 75%),
      linear-gradient(45deg, #dfe7f1 25%, transparent 25%, transparent 75%, #dfe7f1 75%);
    background-size: 18px 18px;
    background-position: 0 0, 9px 9px;
  }}
  .hero img {{ width: 148px; height: 148px; display: block; margin: 0 auto; }}
  .size-row {{ display: flex; align-items: center; gap: 10px; margin-top: 10px; }}
  .size-label {{ width: 46px; text-align: right; color: #475569; }}
  .size-label b {{ font-size: 15px; }}
  .size-label small {{ font-size: 10px; color: #94a3b8; margin-left: 1px; }}
  .tile {{
    display: flex; align-items: center; justify-content: center;
    width: 56px; height: 48px; border-radius: 10px;
  }}
  .tile.dark {{ background: #0f172a; }}
  .tile.light {{ background: #fff; border: 1px solid #cbd5e1; }}
  .tile img {{ image-rendering: auto; display: block; }}
  .zooms {{
    display: flex; justify-content: center; align-items: flex-end;
    gap: 12px; flex-wrap: wrap;
    margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0;
  }}
  figure {{ margin: 0; text-align: center; }}
  figure img {{
    display: block; background: #fff; border: 1px solid #e2e8f0;
    border-radius: 8px; image-rendering: pixelated;
  }}
  figcaption {{ font-size: 10.5px; color: #94a3b8; margin-top: 4px; }}
  .taskbar-wrap {{ margin-top: 34px; }}
  .taskbar-wrap h2 {{ font-size: 15px; margin: 0 0 4px; }}
  .taskbar-wrap p {{ font-size: 12px; color: #64748b; margin: 0 0 10px; }}
  .taskbar {{
    display: flex; align-items: center; gap: 10px;
    background: #101827; border-radius: 12px; padding: 10px 14px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
    width: fit-content; flex-wrap: wrap;
  }}
  .tb-item {{
    position: relative; width: 48px; height: 48px; border-radius: 10px;
    background: rgba(255,255,255,.055);
    display: flex; align-items: center; justify-content: center;
  }}
  .tb-item img {{ display: block; }}
  .tb-item span {{
    position: absolute; right: 3px; bottom: 1px; font-size: 8px; color: #93a3b8;
  }}
  .tray {{
    display: flex; align-items: center; gap: 2px;
    background: #101827; border-radius: 8px; padding: 4px 8px; width: fit-content;
    margin-top: 8px; flex-wrap: wrap;
  }}
  .tray-item {{ display: flex; align-items: center; gap: 1px; margin-right: 4px; }}
  .tray-item img {{ display: block; }}
  .tray-item span {{ font-size: 7px; color: #93a3b8; }}
  .note {{
    margin-top: 26px; padding: 12px 16px; border-radius: 12px;
    background: #fff; border: 1px solid #dbe3ee; color: #475569;
    font-size: 12px; line-height: 1.8; max-width: 980px;
  }}
  .note b {{ color: #0f172a; }}
  .note code {{ background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 11.5px; }}
</style>
</head>
<body>
  <h1>图标小尺寸对比 · 32px / 16px</h1>
  <p class="sub">
    页面里的 32/16 是<b>真实像素尺寸</b>（由 1024 原图直接缩放生成的 PNG，不经过浏览器二次缩放）；
    下方放大图为最近邻 5×/8×，用来观察像素级可读性。每张卡片同时给出深色/浅色底。<br>
    另见：<a href="desktop-mockup.html">桌面图标 / 任务栏 显示模拟</a>（配了一套 Windows 风格陪衬图标）。
  </p>

  <h2 class="section-title">最终采用：12A（透明底 · 纯净）<small>已导出到 src-tauri/icons：16/24/32/48/64/128/256/512 PNG · icon.ico（16–256）· icon.icns（16–1024）· 棋盘格即透明区域</small></h2>
  <div class="grid">{w7_cards}
  </div>

  <h2 class="section-title">第十一轮（11A–11C）· 横线统一改成鲜亮深蓝<small>三条线同一个颜色（12,66,224）· 环抬高 13px · 四层投影 · 按内容自动裁切，画面填充约 92%</small></h2>
  <div class="grid">{w6_cards}
  </div>

  <h2 class="section-title">第九轮（9A / 9B / 9C）· 放大镜做成有厚度的实体<small>顶面 + 外侧壁 + 内侧壁 + 两道投影 · 镜片是凹进去的玻璃 · 白条恢复成平的 · 手柄恢复金属箍细节</small></h2>
  <div class="grid">{w4_cards}
  </div>

  <h2 class="section-title">上一轮（6B）· 手柄加粗 + 尾巴加倍 + 气泡更凸<small>手柄半径 7.8 → 9.0 · 尾巴约 20×10.5 → 28×14.5（面积约 2 倍）· 侧面 3.2 → 4.4、倒角 3.4 → 4.0、投影 +15%</small></h2>
  <div class="grid">{new6_cards}
  </div>

  <h2 class="section-title">第六轮 · 厚度档位（6B 配色，从薄到厚）<small>三个档位只改"厚度/倒角/投影"，形状完全一样</small></h2>
  <div class="grid">{new6d_cards}
  </div>

  <h2 class="section-title">不用放大镜的方向（概念草案 2，供参考）<small>四个完全不同的讲法，细节未打磨 · E/F/G/H</small></h2>
  <div class="grid">{newd_cards}
  </div>

  <h2 class="section-title">还用放大镜的方向（概念草案 1，供参考）<small>除了"放大镜里放气泡"，还有这四种讲法 · A–D</small></h2>
  <div class="grid">{newc_cards}
  </div>

  <h2 class="section-title">第四轮 · 圆环体着色 + 高度场立体<small>镜环做成圆管、气泡做成鼓面——形状走样，仅留作对比</small></h2>
  <div class="grid">{new4_cards}
  </div>

  <h2 class="section-title">第三轮 · 镜环重绘 + 气泡大尺度立体<small>镜环按圆环体重新渲染并略加粗 · 气泡用大范围明暗渐变，缩小后仍看得出立体</small></h2>
  <div class="grid">{new3_cards}
  </div>

  <h2 class="section-title">第二轮 · 立体感加强<small>放大镜提亮 · 镜片边框重绘为立体金属圈 · 气泡加深加饱和 · 描边重做</small></h2>
  <div class="grid">{new2_cards}
  </div>

  <h2 class="section-title">第一轮 · 圆角方形气泡<small>圆角正方形 · 两条横线一长一短 · 鲜艳亮蓝（镜环未改）</small></h2>
  <div class="grid">{new_cards}
  </div>

  <h2 class="section-title">此前方案（供参考）<small>气泡沿用原始比例、三条横线</small></h2>
  <div class="grid old">{old_cards}
  </div>

  <div class="taskbar-wrap">
    <h2>Windows 任务栏模拟</h2>
    <p>32px（任务栏图标）与 16px（托盘/标题栏小图标）实际尺寸并排对比。</p>
    <div class="taskbar">{taskbar}</div>
    <div class="tray">{tray}</div>
  </div>

  <div class="note">
    <b>第十二轮（12A / 12B）——透明背景：</b><br>
    同一个图形（11Ax 的立体结构 + 鲜亮深蓝横线 + 92% 填充），但背景不再是白色 / 浅蓝 / 深蓝渐变，
    而是真正的<b>透明通道（RGBA PNG）</b>，所以放到任何底色上都干净：白色卡片、深色任务栏、
    彩色壁纸都行。<br>
    12A 只有图形本身；12B 多一层贴身接触影（偏移 3px、模糊 2.6px、40%）和一点青色柔光，
    适合放在浅色桌面上时仍有一点"落下去"的重量感。原先的四层长投影去掉了——透明图标带着大块阴影
    会在深色底上变成一圈脏灰。<br>
    <b>文件：</b><code>w7-a/b.png</code>（1024 / 512，RGBA，由 <code>edit_icon_sq11.py</code> 生成，
    用法 <code>edit_icon_sq11.py b</code>）。<br>
    <b>第十一轮（11A–11C）——横线统一成一种颜色，立体再加强：</b><br>
    上一版（10A–10D，三色横线）已删除——三条线不同颜色看着太花。这一版三条线统一用
    <b>鲜亮刺眼的深蓝 (12, 66, 224)</b>，在浅蓝玻璃上对比最强，缩到 32/16px 也认得出。<br>
    立体部分沿用并加强：环抬高 13px（顶面 + 外侧壁 + 内侧壁 + 落地反光）、顶面抛光高光带、
    侧壁深浅渐变 + 底部环境遮蔽、四层投影（接触 / 近 / 中 / 远）、环外可选柔光。
    横线本身仍然是平的，没有浮雕和投影。<br>
    <b>文件：</b><code>w6-a/b/c.png</code>（1024 / 512，由 <code>edit_icon_sq10.py</code> 生成，
    用法 <code>edit_icon_sq10.py c</code>）。<br>
    <b>第九轮（9A / 9B / 9C）——把放大镜做成有厚度的实体：</b><br>
    上一版（8A–8C）已删除。这一版重做了整个立体结构：<br>
    ① <b>镜环有厚度了</b>：不再是一张贴在纸上的环，而是一个"凸起 11px"的圆环体——你看到的是
    它的<b>顶面</b>、右下方露出的<b>外侧壁</b>，以及透过镜片看到的左上<b>内侧壁</b>（所以环内侧有一道暗带），
    底部落在纸面上的位置再补一条<b>反光</b>。这三个面一起才让它"站起来"。<br>
    ② <b>镜片是凹进去的玻璃</b>：向下沉的渐变 + 内侧壁投下的阴影 + 顶部弧形反光 + 玻璃边缘的亮唇。<br>
    ③ <b>横线恢复成平的</b>：没有倒角、没有浮雕、没有投影，就是印在玻璃上的三条白线。<br>
    ④ <b>手柄恢复细节</b>：金属箍（两道车线 + 高光）+ 圆柱握柄（窄高光 + 宽反光）+ 圆头，
    并且从环里"伸出来"的位置被侧壁挡住，符合结构。<br>
    ⑤ <b>投影加深、加远</b>：贴地的接触影 + 中距影 + 远距散影三层；深色版改成青色光晕。<br>
    ⑥ 三种背景：9A 白底、9B 浅蓝渐变、9C 深海军蓝 + 光晕（都是满幅，背景铺满整张）。<br>
    <b>文件：</b><code>w4-a/b/c.png</code>（1024 / 512，由 <code>edit_icon_sq8.py</code> 生成，
    用法 <code>edit_icon_sq8.py c</code>）。<br>
    <b>不用放大镜的四个方向（E–H，概念草案）：</b><br>
    <b>E 消息堆叠</b>：后面三张浅色卡 + 前面一张带两行字的聊天气泡，像"一叠消息、正在翻最上面一条"。<br>
    <b>F 对话线程</b>：中间一条主线，消息气泡左右分列、尾巴指向主线——一条对话本身，而不是"找"它。<br>
    <b>G 双色气泡</b>：一个气泡斜分成两色，一半是你、一半是 agent，最简洁也最抽象。<br>
    <b>H 气泡 + 时间轴</b>：气泡下面一条带播放头的进度条——"顺着时间看回放"，最贴"viewer"。<br>
    这四个都不再需要放大镜：E/F/G/H 分别讲"翻记录 / 一条对话 / 对话双方 / 回看"。<br>
    <b>还用放大镜的四个方向（A–D，概念草案）：</b><br>
    <b>A 放大镜压在气泡上</b>：气泡是主体，放大镜压在右下，镜片里那两行字被放大——
    讲的是"在聊天里查找"，比"镜片里塞一个气泡"更像真实动作，但元素多，16px 会有点挤。<br>
    <b>B 镜片里就是聊天记录</b>：不放气泡，镜片里直接是三行记录。缩到 16px 最清楚，
    但丢掉了"气泡"这个聊天符号，更像通用的"搜索文本"。<br>
    <b>C 气泡 + 小放大镜徽章</b>：气泡当主角，放大镜缩成右下角的小徽章。友好、易懂，
    但徽章在 16px 基本会糊掉。<br>
    <b>D 气泡 + 眼睛</b>：用"看"代替"搜"，最简洁、最抓眼，但会偏向"已读"的意思，
    而且不再是放大镜。<br>
    <b>6E（当前暂定）</b>：镜片里放气泡——两个符号都保住，16px 也认得出来，是最稳的一个。
    如果只是想要"更好看"，6E 继续打磨就够；如果想要"更不一样的讲法"，A 或 C 是最接近的替代。<br>
    <b>草案文件：</b>E–H <code>d-a.png</code> … <code>d-d.png</code>（<code>concept_drafts2.py</code>）；
    A–D <code>c-a.png</code> … <code>c-d.png</code>（<code>concept_drafts.py</code>）。<br>
    <b>第六轮改动（6B / 6D / 6E）——按你的反馈：</b><br>
    ① <b>镜环颜色加深</b>：底色从浅青（42,198,219）压到深灰青（14,156,184），饱和度更高，
    所以缩到 32/16px 时环色仍然"有颜色"，不再是发白的一圈。<br>
    ② <b>手柄重画</b>：原来的金属颈 + 方块旋钮看着像秒表按钮。现在是从镜环沿 45° 伸出的
    <b>金属箍 + 圆柱握柄 + 圆头</b>：握柄按圆柱面着色（左上一条窄高光、右下压深），
    端头是半球，并且在纸面上有自己的投影。手柄根部藏在镜环后面。<br>
    ③ <b>尾巴加大</b>：从约 10×8px 加到 20×11px（底边 84→104，尖端下移并左移），
    形状是"左边近垂直、斜边回收"的经典聊天尾巴，倒角也一并跟着走，
    所以它和气泡是同一块面，不是贴上去的折角纸片。<br>
    ④ 这一版（6B 为基础）：<b>手柄加粗</b>（握柄半径 7.8 → 9.0，金属箍 8.3 → 9.4）；
    <b>尾巴放大一倍</b>（底边 20 → 28、深度 10.5 → 14.5，面积约 2 倍），
    气泡相应上移 5.5px 给尾巴腾地方，尾巴尖仍在镜片以内；
    <b>气泡立体加强</b>（侧面 3.2 → 4.4、倒角高度 3.4 → 4.0、投影强度 +15%），
    底边那道厚边和影子更明显，压得住"跃然纸上"。<br>
    ⑤ 上一版：<b>手柄再缩短 1/4</b>（可见长度约 48px → 36px），腾出来的空间给镜圈——
    外半径 87.5 → 92.5、环宽 19.5 → 24.5，所以镜圈更"厚实"、手柄更短；
    手柄的金属箍仍然露在环外，握柄按圆柱面着色。<br>
    ⑤ 镜环/气泡的厚度仍是第五轮那套"平顶面 + 倒角 + 侧面 + 两道投影"，只是环色、
    手柄、尾巴三处改了；页面第二排是 6B 的三种厚度，只改厚度不改形状。<br>
    <b>第六轮文件：</b>6B <code>w2-b.png</code> · 6D <code>w2-d.png</code> · 6E <code>w2-e.png</code>；
    厚度档位 <code>w2-b-soft.png</code> / <code>w2-b-deep.png</code>，
    均为 1024 / 512 两个尺寸，由 <code>edit_icon_sq6.py</code> 生成
    （用法 <code>edit_icon_sq6.py b deep</code>；环宽、环色、倒角、侧面厚度、手柄角度/长度/粗细都是参数）。<br>
    <b>第五轮文件（上一版）：</b>5A–5E <code>w-a.png</code> … <code>w-e.png</code>，
    厚度档位 <code>w-a-soft.png</code> / <code>w-a-deep.png</code>（由 <code>edit_icon_sq5.py</code> 生成）。<br>
    <b>第四轮文件：</b>4A <code>z-a.png</code> · 4B <code>z-b.png</code> · 4C <code>z-c.png</code> ·
    4D <code>z-d.png</code> · 4E <code>z-e.png</code>（由 <code>edit_icon_sq4.py</code> 生成）。<br>
    <b>第三轮文件：</b>N <code>y-n.png</code> · O <code>y-o.png</code> · P <code>y-p.png</code> ·
    Q <code>y-q.png</code>（由 <code>edit_icon_sq3.py</code> 生成）。<br>
    <b>第二轮文件：</b>J <code>x-j.png</code> · K <code>x-k.png</code> · L <code>x-l.png</code> ·
    M <code>x-m.png</code>（由 <code>edit_icon_sq2.py</code> 生成）。<br>
    <b>第一轮文件：</b>C <code>v-vivid-s109.png</code> 基准；E <code>s-vivid.png</code> ·
    F <code>s-azure.png</code> · G <code>s-lagoon.png</code> · H <code>s-cyan.png</code> ·
    I <code>s-sapphire.png</code>（由 <code>edit_icon_sq.py</code> 生成）。
  </div>
</body>
</html>'''

out = D / 'small-size-preview.html'
out.write_text(html, encoding='utf-8')
print('wrote', out)
