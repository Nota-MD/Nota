#!/usr/bin/env python3
"""生成图标里那块浅灰底衬的**超椭圆**路径。

为什么单独留一个脚本：`src-tauri/icons/nota.svg` 里那条 `d="M1080.0 627.0 C…"`
是**采出来的数据**，不是几个可读的参数。想改底衬大小/圆度只能重新生成，
照着数字手改是不可能的。

只依赖标准库。用法（默认就是现用的那组参数）：

    tools/gen-squircle.py            # a=453，圆度 n=4.4，画布 1254
    tools/gen-squircle.py 580 4.4    # 放大到 a=580（小尺寸下嫌图小就用这招）

把输出整条替换掉 SVG 里那条 <path fill="url(#tile)" …> 的 d 即可。
⚠️ 它是**居中**的（圆心钉在画布中心），所以 a 变大是四周一起长。
"""

from __future__ import annotations

import math
import sys

PER_QUADRANT = 6          # 每个象限切几段。6 段在这个尺寸下肉眼已看不出折线


def squircle_path(a: float, n: float, size: float) -> str:
    """超椭圆 |x/a|^n + |y/a|^n = 1，转成一串三次贝塞尔。"""
    c = size / 2.0

    def point(t: float) -> tuple[float, float]:
        th = 2 * math.pi * t
        cos, sin = math.cos(th), math.sin(th)
        return (
            c + a * math.copysign(abs(cos) ** (2 / n), cos),
            c + a * math.copysign(abs(sin) ** (2 / n), sin),
        )

    pts = [
        point((q * PER_QUADRANT + k) / (4.0 * PER_QUADRANT))
        for q in range(4)
        for k in range(PER_QUADRANT)
    ]
    m = len(pts)
    out = ["M%.1f %.1f" % pts[0]]
    for i in range(m):
        # 过点式三次贝塞尔：控制点由前后邻居的切线定，曲线**穿过**每个采样点
        p0, p1 = pts[(i - 1) % m], pts[i]
        p2, p3 = pts[(i + 1) % m], pts[(i + 2) % m]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        out.append(
            "C%.1f %.1f %.1f %.1f %.1f %.1f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
        )
    out.append("Z")
    return " ".join(out)


if __name__ == "__main__":
    a = float(sys.argv[1]) if len(sys.argv) > 1 else 453.0
    n = float(sys.argv[2]) if len(sys.argv) > 2 else 4.4
    print(squircle_path(a, n, 1254.0))
