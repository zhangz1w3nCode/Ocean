#!/usr/bin/env bash
#
# build-icon.sh — 从 assets/logo.svg 生成 macOS 圆角 app 图标 build/icon.icns
#
# 做法（与项目选择页 logo 一致）：
#   · 圆角深色盒（rx 圆角 + 深色背景）铺满 logo 区域，圆角外透明(alpha=0)
#   · 像素风 OCEAN 字样居中，浅色
#   · 消除白色方框：不再是不透明白底方形画布，换成「圆角盒 + 外圈透明」
#
# 依赖：python3 + Pillow(PIL) + macOS 自带 sips / iconutil
#
# 用法：
#   scripts/build-icon.sh                 # 默认 assets/logo.svg -> build/icon.icns
#   scripts/build-icon.sh <svg> <icns>    # 指定源与输出
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SVG="${1:-$PROJECT_ROOT/assets/logo.svg}"
OUT_ICNS="${2:-$PROJECT_ROOT/build/icon.icns}"
ICONSET_DIR="$PROJECT_ROOT/build/Ocean.iconset"

echo "[build-icon] source : $SVG"
echo "[build-icon] output : $OUT_ICNS"

rm -rf "$ICONSET_DIR"; mkdir -p "$ICONSET_DIR"

# ---------------------------------------------------------------
# 1) SVG -> 1024x1024 PNG（2048 超采样后 LANCZOS 缩到 1024，圆角更平滑）
# ---------------------------------------------------------------
python3 - "$SVG" "$ICONSET_DIR/icon_512x512@2x.png" <<'PY'
import re, sys
from PIL import Image, ImageDraw

svg_path, out_path = sys.argv[1], sys.argv[2]
txt = open(svg_path, encoding='utf-8').read()

def hexrgb(h):
    h = h.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# viewBox（默认 144x144）
m = re.search(r'viewBox=["\']\s*0[\s,]+0[\s,]+([\d.]+)[\s,]+([\d.]+)["\']', txt)
vbw = float(m.group(1)) if m else 144.0
vbh = float(m.group(2)) if m else 144.0

# 背景 rect：取第一个带 rx 的 <rect>，提取 rx 与 fill（属性顺序无关）
bg_tag = re.search(r'<rect\b[^>]*\brx[^>]*>', txt)
if bg_tag:
    seg = bg_tag.group(0)
    bg_rx = float(re.search(r'\brx=["\']([\d.]+)["\']', seg).group(1))
    f = re.search(r'\bfill=["\'](#[0-9a-fA-F]{3,6})["\']', seg)
    bg_fill = hexrgb(f.group(1)) if f else (31, 41, 55)
else:
    bg_rx = 0.0
    bg_fill = (31, 41, 55)   # 兜底 #1f2937

# g 的 transform：translate(tx ty) scale(s)
gm = re.search(r'translate\(([\d.\-]+)[\s,]+([\d.\-]+)\)\s*scale\(([\d.\-]+)\)', txt)
tx, ty, s = (float(gm.group(1)), float(gm.group(2)), float(gm.group(3))) if gm else (0.0, 0.0, 1.0)

TARGET = 1024
SS = 2048                       # 超采样画布（> target，真正的超采样）
sx, sy = SS / vbw, SS / vbh

img = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角深色盒（圆角外透明）
if bg_rx > 0:
    d.rounded_rectangle([0, 0, SS - 1, SS - 1], radius=bg_rx * sx, fill=(*bg_fill, 255))
else:
    d.rectangle([0, 0, SS - 1, SS - 1], fill=(*bg_fill, 255))

# 像素 rect（带 x/y 的才是像素块，背景 rect 无 x/y 会跳过）
cnt = 0
for r in re.finditer(r'<rect\b([^>]*?)\s*/?>', txt):
    a = r.group(1)
    if 'x=' not in a or 'y=' not in a:
        continue
    xm = re.search(r'\bx=["\']([\d.]+)["\']', a);     x = float(xm.group(1)) if xm else 0.0
    ym = re.search(r'\by=["\']([\d.]+)["\']', a);     y = float(ym.group(1)) if ym else 0.0
    wm = re.search(r'\bwidth=["\']([\d.]+)["\']', a); w = float(wm.group(1)) if wm else 0.0
    hm = re.search(r'\bheight=["\']([\d.]+)["\']', a); h = float(hm.group(1)) if hm else 0.0
    fm = re.search(r'\bfill=["\'](#[0-9a-fA-F]{3,6})["\']', a)
    fill = hexrgb(fm.group(1)) if fm else (249, 250, 251)
    X = (tx + x * s) * sx; Y = (ty + y * s) * sy
    WW = w * s * sx;       HH = h * s * sy
    d.rectangle([X, Y, X + WW, Y + HH], fill=(*fill, 255))
    cnt += 1

img = img.resize((TARGET, TARGET), Image.LANCZOS)
img.save(out_path, 'PNG')
print(f"[build-icon] svg -> png: {cnt} pixel rects, viewBox {vbw}x{vbh}, rx={bg_rx}")
PY

# ---------------------------------------------------------------
# 2) 生成 10 个标准尺寸 iconset
# ---------------------------------------------------------------
SRC="$ICONSET_DIR/icon_512x512@2x.png"
sips -z 16 16   "$SRC" --out "$ICONSET_DIR/icon_16x16.png"      >/dev/null
sips -z 32 32   "$SRC" --out "$ICONSET_DIR/icon_16x16@2x.png"   >/dev/null
sips -z 32 32   "$SRC" --out "$ICONSET_DIR/icon_32x32.png"      >/dev/null
sips -z 64 64   "$SRC" --out "$ICONSET_DIR/icon_32x32@2x.png"   >/dev/null
sips -z 128 128 "$SRC" --out "$ICONSET_DIR/icon_128x128.png"    >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC" --out "$ICONSET_DIR/icon_256x256.png"    >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC" --out "$ICONSET_DIR/icon_512x512.png"    >/dev/null

# ---------------------------------------------------------------
# 3) iconutil 合成 icns
# ---------------------------------------------------------------
iconutil -c icns -o "$OUT_ICNS" "$ICONSET_DIR"
echo "[build-icon] wrote $OUT_ICNS"

# ---------------------------------------------------------------
# 4) 验证：解包回来，10 个子图四角必须 transparent(alpha=0)
# ---------------------------------------------------------------
python3 - "$OUT_ICNS" <<'PY'
import subprocess, sys, os, tempfile
from PIL import Image
import numpy as np

icns = sys.argv[1]
tmp_parent = tempfile.mkdtemp(prefix='build-icon-verify-')
tmp = os.path.join(tmp_parent, 'verify.iconset')  # iconutil 要求 -o 扩展名为 .iconset
subprocess.run(['iconutil', '-c', 'iconset', '-o', tmp, icns], check=True, capture_output=True)
bad = []
for f in sorted(os.listdir(tmp)):
    if not f.endswith('.png'):
        continue
    a = np.array(Image.open(os.path.join(tmp, f)).convert('RGBA'))
    h, w = a.shape[:2]; Al = a[:, :, 3]
    corners = [int(Al[y, x]) for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    if any(c != 0 for c in corners):
        bad.append((f, corners))
if bad:
    for f, c in bad:
        print(f"[build-icon] FAIL {f} corners={c}")
    sys.exit(1)
print("[build-icon] verify: 10 sub-images, 4 corners transparent -> PASS")
PY

echo "[build-icon] done"