/**
 * International-grid share card.
 *
 * This suite verifies the actual SVG used by preview, PNG export and clipboard.
 * It deliberately avoids pixel snapshots; the grid geometry can evolve while
 * these structural facts must remain true.
 */

import {
  cardHeight,
  cardWidth,
  darkCard,
  lightCard,
  SafeFileName,
  shareCardSvg,
  toBase64,
  type ShareCardDecoration,
} from "../src/ui/share-card";
import {
  normaliseShareIdentity,
  shareInitials,
} from "../src/ui/share-card-identity";
import {
  avatarCropSource,
  clampAvatarCropOffset,
} from "../src/ui/avatar-crop";
import type { PanelShare } from "../src/ui/panel-nodes";
import { computeHeatmap } from "../src/ui/heatmap";
import { setLanguage } from "../src/i18n";

let pass = 0;
let fail = 0;

async function testCase(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function count(text4: string, part: string): number {
  return text4.split(part).length - 1;
}

const measure = (text4: string, size: number, weight: number) =>
  Array.from(text4).reduce((sum, character) => sum + (/[A-Z]/.test(character) ? 0.68 : 0.61), 0) *
  size *
  (weight >= 700 ? 1.02 : 1);

const identity = {
  name: "Leo Lee",
  avatar: "",
  includePromotion: false,
};

const identityWithAvatar = {
  ...identity,
  avatar: "data:image/png;base64,AAAA",
};

function roundCard(): PanelShare {
  return {
    title: "写作统计",
    subtitle: "Writing Stats",
    date: "2026年9月27日 22:07",
    label: "本轮平均速度",
    value: "13",
    unit: "字 / 分钟",
    points: [20, 20, 0, 0, 0, 0, 0, 20],
    xTicks: [
      { at: 0, label: "开始" },
      { at: 0.571, label: "4 分" },
      { at: 1, label: "结束" },
    ],
    xMinor: 4,
    shape: "curve",
    heat: null,
    less: "",
    more: "",
    stats: [
      { k: "本轮字数", v: "100", small: "字" },
      { k: "净打字时间", v: "7", small: "分 30 秒" },
      { k: "峰值速度", v: "18", small: "字/分" },
    ],
    foot: "这一轮，你写下了 100 个字",
    file: "nota-stats-round-20260927-2207.png",
  };
}

function heatCard(): PanelShare {
  return {
    ...roundCard(),
    label: "近半年总字数",
    value: "128,400",
    unit: "字",
    shape: "heat",
    points: [],
    xTicks: [],
    xMinor: 0,
    heat: computeHeatmap(
      [
        { date: "2026-09-27", value2: 100 },
        { date: "2026-09-26", value2: 50 },
      ],
      "2026-09-27",
      8,
    ),
    less: "少",
    more: "多",
    stats: [
      { k: "有字的天数", v: "173", small: "天" },
      { k: "日均", v: "742", small: "字/天" },
      { k: "单日最多", v: "3,820", small: "字" },
    ],
    foot: "近半年，你在 173 天里写下了 128,400 个字",
  };
}

function render(card: PanelShare, decoration?: ShareCardDecoration): string {
  return shareCardSvg(card, darkCard, measure, decoration);
}

async function main(): Promise<void> {
  setLanguage("zh-CN");

  console.log("\n【国际主义版式】");

  await testCase("固定 4:5 画布与 international-grid 模板", () => {
    const svg = render(roundCard(), { identity });
    assertion(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}"`), "根元素尺寸不对");
    assertion(svg.includes('data-share-style="international-grid"'), "模板标记缺失");
    assertion(svg.endsWith("</svg>"), "SVG 没有收口");
  });

  await testCase("标题、日期、大数字、单位、页脚都在且标题只出现一次", () => {
    const svg = render(roundCard(), { identity });
    for (const text4 of ["写作统计", "2026年9月27日 22:07", "本轮平均速度", "13", "字 / 分钟", "这一轮，你写下了 100 个字"]) {
      assertion(svg.includes(text4), `缺少文案：${text4}`);
    }
    equal(count(svg, ">写作统计</text>"), 1, "标题重复");
  });

  await testCase("使用纯色纸面、粗规则线和无圆角信息栏（不是旧渐变卡片）", () => {
    const svg = render(roundCard(), { identity });
    equal(count(svg, "linearGradient"), 0, "不该再有渐变");
    equal(count(svg, 'rx="22"'), 0, "指标不该再是圆角卡片");
    assertion(svg.includes('height="16" fill="' + darkCard.main + '"'), "顶部强调色条缺失");
    assertion(count(svg, `<line `) >= 6, "网格规则线太少");
  });

  await testCase("三格指标按栏排布，只有一格时也只画一格", () => {
    const svg = render(roundCard(), { identity });
    for (const label of ["本轮字数", "净打字时间", "峰值速度"]) assertion(svg.includes(label), `缺指标 ${label}`);
    const one = render({ ...roundCard(), stats: [{ k: "本轮字数", v: "100", small: "字" }] }, { identity });
    assertion(one.includes("本轮字数"), "一格指标没画");
    assertion(!one.includes("峰值速度"), "一格指标被补成了三格");
  });

  console.log("\n【作者与头像】");

  await testCase("用户名进入页首的 Creator 区", () => {
    const svg = render(roundCard(), { identity });
    assertion(svg.includes(">Leo Lee</text>"), "用户名缺失");
    assertion(svg.includes(">LL</text>"), "无头像时没有首字母占位");
  });

  await testCase("自定义头像以内嵌 data URL 进入 SVG，不依赖外链", () => {
    const svg = render(roundCard(), { identity: identityWithAvatar });
    assertion(svg.includes('href="data:image/png;base64,AAAA"'), "头像没有内嵌");
    assertion(svg.includes('clip-path="url(#avatar-clip)"'), "头像没有圆形裁切");
    assertion(!/href="https?:/.test(svg), "头像不能是外部链接");
  });

  await testCase("姓名清洗：换行和控制字符被去掉，头像协议被白名单拦截", () => {
    equal(normaliseShareIdentity({ name: "A\nB\rC\0", avatar: "https://evil/a.png", includePromotion: 1 }), {
      name: "ABC",
      avatar: "",
      includePromotion: false,
    }, "identity normalization");
    equal(shareInitials("Leo Lee"), "LL", "英文首字母");
    equal(shareInitials("李雷"), "李雷", "中文短名");
  });

  await testCase("圆形裁切框报告实际保留比例，并限制拖出画布", () => {
    const square = clampAvatarCropOffset(256, 256, 1, { x: 0, y: 0 });
    equal(square.visiblePercent, 79, "正方形头像默认保留约 79%");
    equal(square.width, 320, "默认铺满画布");
    const zoomed = clampAvatarCropOffset(256, 256, 2, { x: 999, y: -999 });
    equal(zoomed.visiblePercent, 20, "放大到 200% 后保留约 20%");
    equal(zoomed.offset.x, 160, "横向拖动被夹在边界");
    equal(zoomed.offset.y, -160, "纵向拖动被夹在边界");
    equal(avatarCropSource(256, 256, 1, { x: 0, y: 0 }), { x: 0, y: 0, size: 256 }, "方形源图裁切区域");
  });

  console.log("\n【二维码 / 软件分享】");

  await testCase("关闭软件分享时不画二维码，只保留 Nota 标识", () => {
    const svg = render(roundCard(), { identity, qr: [[true, false], [false, true]] });
    equal(count(svg, 'class="share-qr"'), 0, "关闭时不该有二维码");
    assertion(svg.includes(">NOTA</text>"), "品牌标识缺失");
    const markLeft = Number(svg.match(/<svg x="([\d.]+)" y="1220"/)?.[1]);
    const brandLeft = 1016 - measure("NOTA", 25, 750);
    assertion(Number.isFinite(markLeft), "页脚标识坐标缺失");
    assertion(markLeft + 34 <= brandLeft, `页脚标识压住了 NOTA 字标：mark=${markLeft}, text=${brandLeft}`);
  });

  await testCase("打开软件分享且矩阵已生成时写入可扫描的纯黑白二维码", () => {
    const matrix = Array.from({ length: 21 }, (_, row) =>
      Array.from({ length: 21 }, (_, column) => (row + column) % 3 === 0),
    );
    const svg = render(roundCard(), {
      identity: { ...identity, includePromotion: true },
      qr: matrix,
    });
    equal(count(svg, 'class="share-qr"'), 1, "二维码路径缺失");
    assertion(svg.includes('fill="#ffffff"'), "二维码没有白底");
    assertion(svg.includes('shape-rendering="crispEdges"'), "二维码没有锐利模块");
    assertion(svg.includes("用 NOTA 写作") || svg.includes("WRITE WITH NOTA"), "二维码提示缺失");
    assertion(
      svg.includes('<rect x="904" y="1186" width="112" height="112"'),
      "二维码应与页脚文字处于同一视觉行，并保留正常底边距",
    );
  });

  console.log("\n【图表】");

  await testCase("曲线使用实线折线路径，纵刻度是紧凑整数标尺", () => {
    const svg = render(roundCard(), { identity });
    assertion(svg.includes('class="curve-line"'), "曲线路径缺失");
    for (const tick of ["0", "5", "10", "15", "20"]) assertion(svg.includes(`>${tick}</text>`), `缺纵刻度 ${tick}`);
  });

  await testCase("横刻度与大单位、细分小刻度都在", () => {
    const card = roundCard();
    card.xTicks = [
      { at: 0, label: "开始" },
      { at: 0.5, label: "1 小时", largeSinglePosition: true },
      { at: 1, label: "结束" },
    ];
    const svg = render(card, { identity });
    for (const label of ["开始", "1 小时", "结束"]) assertion(svg.includes(label), `缺横刻度 ${label}`);
    equal(count(svg, 'class="share-x-minor"'), 8, "两段各四小格");
  });

  await testCase("热力图仍然按真实日期铺格，并画深浅图例", () => {
    const svg = render(heatCard(), { identity });
    equal(count(svg, 'class="heat-cell"'), 56, "热力格数量");
    assertion(svg.includes(">8月</text>") && svg.includes(">9月</text>"), "月份缺失");
    assertion(svg.includes(">少</text>") && svg.includes(">多</text>"), "图例文案缺失");
    equal(count(svg, 'class="curve-line"'), 0, "热力图不该画曲线");
  });

  console.log("\n【转义与颜色】");

  await testCase("插件文字先转义 & 再转义尖括号和引号", () => {
    const svg = render({ ...roundCard(), title: 'a<b>&"c', foot: "&lt;" }, { identity });
    assertion(svg.includes("A&lt;B&gt;&amp;&quot;C"), "标题转义不完整");
    assertion(svg.includes("&amp;lt;"), "页脚双重转义顺序错误");
    assertion(!svg.includes("a<b>"), "原始标签进入 SVG");
  });

  await testCase("深色与浅色使用各自的纸面和文字颜色", () => {
    const dark2 = shareCardSvg(roundCard(), darkCard, measure, { identity });
    const light = shareCardSvg(roundCard(), lightCard, measure, { identity });
    assertion(dark2.includes(`fill="${darkCard.bottom1}"`), "深色纸面缺失");
    assertion(light.includes(`fill="${lightCard.bottom1}"`), "浅色纸面缺失");
    assertion(dark2 !== light, "两套配色输出相同");
  });

  await testCase("空日期和空单位不画，空数值画破折号", () => {
    const svg = render({ ...roundCard(), date: "", unit: "", value: "" }, { identity });
    assertion(svg.includes(">—</text>"), "空值没有破折号");
    assertion(!svg.includes("字 / 分钟"), "空单位仍被画出");
  });

  console.log("\n【导出辅助】");

  await testCase("文件名消毒仍挡住路径、隐藏文件和保留字符", () => {
    equal(SafeFileName("../../etc/x.png"), "x.png", "路径");
    equal(SafeFileName("..hidden.png"), "hidden.png", "隐藏文件");
    equal(SafeFileName('a:b*c?d"e<f>g|h.png'), "a-b-c-d-e-f-g-h.png", "保留字符");
    equal(SafeFileName(""), "nota-stats.png", "空名兜底");
  });

  await testCase("PNG 字节 base64 与标准实现一致，大块数据也不爆参数上限", async () => {
    const byte = new Uint8Array(0x8000 + 1).fill(65);
    equal(await toBase64(new Blob([byte])), Buffer.from(byte).toString("base64"), "base64");
  });

  console.log("\n【结果】");
  console.log(`通过 ${pass} 条，失败 ${fail} 条`);
  if (fail > 0) process.exitCode = 1;
}

void main();
