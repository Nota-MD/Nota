#!/usr/bin/env python3
"""生成 Nota 的占位图标。

只依赖标准库（zlib + struct），**不需要 PIL**——本机的 Python 环境很干净，
为了画四个方框去装 Pillow 不值得。

画的是一个「带折角的便笺」：圆角方底 + 右上折角 + 三条文字线。
等有正式设计稿了，把 PNG 换掉再跑一次 `npx tauri icon` 即可。

用法：
    tools/gen-icons.py            # 写进 src-tauri/icons/
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

# 配色：底色用接近 Adwaita 蓝的深调，纸面近白，折角稍暗。
BG = (0x2A, 0x5E, 0x9E, 0xFF)
PAPER = (0xFA, 0xFA, 0xFA, 0xFF)
FOLD = (0xC8, 0xD6, 0xE8, 0xFF)
LINE = (0x8A, 0xA8, 0xCC, 0xFF)

# 需要生成的尺寸（文件名 → 边长）。
SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
}


def blend(dst: tuple[int, ...], src: tuple[int, ...], a: float) -> tuple[int, ...]:
    """按 alpha 把 src 叠到 dst 上（两者都是 RGBA 四元组，a 是 0..1）。"""
    return tuple(
        int(round(dst[i] * (1 - a) + src[i] * a)) for i in range(4)
    )


def in_rounded_rect(x: float, y: float, w: float, h: float, r: float) -> bool:
    """点 (x, y) 在不在圆角矩形里。"""
    if not (0 <= x < w and 0 <= y < h):
        return False
    # 四个角各自判一次圆
    for cx, cy in ((r, r), (w - r, r), (r, h - r), (w - r, h - r)):
        if (x < r or x > w - r) and (y < r or y > h - r):
            # 落在角上的格子，看它属于哪个角
            corner_x = r if x < r else w - r
            corner_y = r if y < r else h - r
            if (x - corner_x) ** 2 + (y - corner_y) ** 2 > r * r:
                return False
            continue
        if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return True
    # 不在任何角格子里 —— 直边区域，都在
    if r <= x <= w - r or r <= y <= h - r:
        return True
    return False


def render(size: int) -> bytes:
    """画出 size×size 的 RGBA 像素，返回 PNG 的 IDAT 原始数据。"""
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    # 用 4 倍超采样做抗锯齿：先按 4x 判定，再平均下来。
    ss = 4
    n = size * ss

    # 几何比例（都按边长取相对值，缩放时形状不走样）
    pad = n * 0.06
    w = n - 2 * pad
    radius = n * 0.22

    # 便笺纸（比底稍小、稍靠下）
    paper_x0, paper_y0 = n * 0.26, n * 0.20
    paper_x1, paper_y1 = n * 0.74, n * 0.80
    fold = n * 0.16  # 折角边长

    for y in range(size):
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x * ss + sx + 0.5
                    fy = y * ss + sy + 0.5

                    color = (0, 0, 0, 0)

                    # ① 圆角方底
                    if in_rounded_rect(fx - pad, fy - pad, w, w, radius):
                        color = BG

                    # ② 纸面
                    if paper_x0 <= fx < paper_x1 and paper_y0 <= fy < paper_y1:
                        color = PAPER

                    # ③ 右上折角
                    if (
                        paper_x0 <= fx < paper_x1
                        and paper_y0 <= fy < paper_y1
                        and (paper_x1 - fx) + (fy - paper_y0) < fold
                    ):
                        color = FOLD

                    # ④ 三条文字线
                    if paper_x0 < fx < paper_x1 and paper_y0 < fy < paper_y1:
                        rel_x = (fx - paper_x0) / (paper_x1 - paper_x0)
                        for i, ly in enumerate((0.42, 0.58, 0.74)):
                            ly_abs = paper_y0 + (paper_y1 - paper_y0) * ly
                            # 第三条短一点，看着像段落的收尾
                            x_end = 0.94 if i < 2 else 0.70
                            if 0.10 < rel_x < x_end and abs(fy - ly_abs) < n * 0.020:
                                color = LINE

                    r_acc += color[0]
                    g_acc += color[1]
                    b_acc += color[2]
                    a_acc += color[3]

            total = ss * ss
            px[y][x] = (
                r_acc // total,
                g_acc // total,
                b_acc // total,
                a_acc // total,
            )

    # 打包成 PNG 的 scanline 格式：每行前面加一个 filter 字节（0 = None）
    raw = bytearray()
    for row in px:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))
    return bytes(raw)


def write_png(path: Path, size: int) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return (
            struct.pack(">I", len(data))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8 位 RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(render(size), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "src-tauri" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    for name, size in SIZES.items():
        write_png(out / name, size)
        print(f"  写出 {out / name}（{size}×{size}）")


if __name__ == "__main__":
    main()
