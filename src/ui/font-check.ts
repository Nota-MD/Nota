/**
 * **"这个主题的首选字体，这台机器上有吗"**（2026-10-17 新建）。
 *
 * 用户原话：「加一个修改：**如果主题首选的字体系统中没有，弹窗提示**」。
 * 起因是 CDE 那套文档主题首选**点宋**（`WenQuanYi Bitmap Song` 那一族）——
 * 没装的时候它会安静地退回系统字体，界面上看着"也挺正常"，只是那股味道没了。
 * 这种**静默降级**正是应该被说出来的一类：用户以为自己看到的是那套主题。
 *
 * # 怎么判"有没有这个字体"
 *
 * ⚠️ `document.fonts.check()` **不适合**这件事：它回答的是"这个 `@font-face`
 * 加载好了没有"，对**系统已安装字体**几乎总是给 `true`（它只认 CSS 里声明过的
 * 那几支，系统字体走的是另一条路）。
 *
 * 所以用那张老办法：**画布量宽度**。同一串字，先用**兜底字体**量一遍，再用
 * `"候选字体", 兜底字体` 量一遍——两者宽度不同 ⇒ 候选真的被用上了（它存在）；
 * 一样 ⇒ 浏览器退回兜底，候选不存在。
 *
 * ⚠️ 要拿**三种**兜底（等宽 / 衬线 / 无衬线）各试一次：只拿一种的话，
 * 候选恰好和那种兜底"度量一样"时会被误判成没有（比如某些中文点阵字体的
 * 全角宽度和 `monospace` 算出来分毫不差）。三种里**有任意一种**量出差别就算有。
 *
 * ⚠️ 样本串**必须同时含拉丁与中文**：只放 `ABC` 时，一个"只有中文字形"的
 * 字体量出来与兜底完全一样，会被判成没有。
 */

/** 量宽度用的样本：拉丁（含宽窄不一的字母）＋ 中文 ＋ 数字。 */
const 样本 = "mmmmWWQ0123ili中文测试字体";

/** 只拿这三种通用族当基准（浏览器一定认识它们）。 */
const 兜底族 = ["monospace", "serif", "sans-serif"] as const;

/**
 * 这台机器上有没有这个字体。
 *
 * ⚠️ **拿不到 canvas 就当"有"**：判不了的时候宁可**不打扰**用户，
 * 也不要用一个可能错的提示去打一次（那是"狼来了"）。
 */
export function 字体可用(名字: string): boolean {
  const 名 = 名字.trim().replace(/^["']|["']$/g, "").trim();
  if (!名) return true;
  const 画布 = document.createElement("canvas").getContext("2d");
  if (!画布) return true;
  return 兜底族.some((兜底) => {
    画布.font = `72px ${兜底}`;
    const 基准 = 画布.measureText(样本).width;
    画布.font = `72px "${名}", ${兜底}`;
    const 试过 = 画布.measureText(样本).width;
    // 0.5px 的容差：同一个字体在不同兜底下会有亚像素级的抖动。
    return Math.abs(试过 - 基准) > 0.5;
  });
}

/**
 * 从一份主题 CSS 里挑出**首选字体**（`--font-doc` 的第一个家族）。
 *
 * 返回 `null` 的两种情形，都是"不该提示"：
 * 1. 这份 CSS 没写 `--font-doc`（那它用的是基础那套，不是主题的锅）；
 * 2. 第一个家族是**通用族**（`serif` / `system-ui` / `monospace` …）——
 *    那些一定存在，不算"缺字体"。
 */
export function 首选字体(css: string): string | null {
  const 命中 = /--font-doc\s*:\s*([^;]+);/.exec(css);
  if (!命中?.[1]) return null;
  const 首个 = 命中[1].split(",")[0]?.trim() ?? "";
  const 名 = 首个.replace(/^["']|["']$/g, "").trim();
  if (!名) return null;
  const 通用 = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "inherit",
    "initial",
    "unset",
    "-apple-system",
    "",
  ]);
  return 通用.has(名.toLowerCase()) ? null : 名;
}
