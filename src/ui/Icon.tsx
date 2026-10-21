/**
 * 界面图标：**从 Folio 搬来的那一套**（`src/assets/icons/`，96 个文件）。
 *
 * # 为什么是 Folio 的那一套
 *
 * 用户 2026-09-24 定：「算了，将 folio 的非项目图标用上。」
 * 那一套的来路查过，见 `THIRD-PARTY.md` §5：Folio 自己重绘的（2026-09-12），
 * 与 Nota 同为 **BSD-2-Clause、同一作者**，搬进来不欠谁的。
 * ⚠️ **只搬 `actions/` 里的"动作图标"，不搬应用图标**——`folio-*.svg` 那几枚
 * 是 Folio 自己的脸，Nota 用 `src-tauri/icons/nota.svg`。
 *
 * # 为什么不是内联 SVG，也不是图标库
 *
 * 一个 16 格的描边图标，内联进来要 1~3 KB 的 `<path>` 文本；
 * 96 个全内联就是这个数乘 96 进 JS 包。**用遮罩（mask）**把 SVG 当图片用：
 * 文件由 Vite 当**资源**发出去（`?url`），JS 里只留一行网址，
 * 而**颜色由 CSS 给**——`.icon` 的 `background-color: currentColor`。
 *
 * 于是原文件里那 355 处写死的 `fill="#2e3436"`（GTK 的深灰）**一个字都不用改**：
 * 遮罩只取形状，颜色由外面刷。深色主题、`--accent-fg` 反色，
 * 全都自动跟着 `color` 走，不需要"深色版图标"。
 *
 * ⚠️ 这也是**为什么不改那些文件里的 `fill`**：改了就不再是逐字节的搬运，
 * "搬来的东西一个字节没动"这句话就失效了——而那句话是这套图标能一眼核对的前提。
 *
 * # 名字表为什么手写，还要在加载时核对一遍
 *
 * `import.meta.glob` 的键是**字符串**，`keyof` 一个 `Record<string, string>`
 * 得到的是 `string`——写错一个字母（`folio-close` 写成 `folio-closed`）
 * 类型检查**一句话不说**，界面上只是**少了一个图标**：空按钮、点得动、
 * 只是什么都不显示。这是本仓最讨厌的那种"看着好好的"。
 *
 * 所以：名字的联合类型从这张 `名字表` 推出来（调用处写错**编译期就红**），
 * 而表里的名字在**模块加载时**逐个核对有没有对应的文件（文件被删/改名**当场报**）。
 * 加图标就走这两步：拷文件 → 往 `名字表` 加一行。
 *
 * ⚠️ 表里**只列用到的**。96 个文件都在仓库里（谁要用谁加），
 * 但"Nota 用了哪几枚"这件事得能从这一张表读出来。
 */

import type { CSSProperties } from "react";

/**
 * `?url` + `eager`：拿到的是 `{ 相对路径: 网址 }`，
 * 网址指向**构建后**的文件（dev 下是 `/src/assets/icons/xxx.svg`）。
 *
 * ⚠️ `eager: true` 会把 96 个文件**全部**发到 `dist/`（共约 724 KB），
 * 但**不进 JS 包**——JS 里只有 96 行网址。浏览器只在真画到某个图标时
 * 才去取那一个文件（遮罩图是懒加载的），所以多发的那些文件不花运行时的钱。
 * 724 KB 对一个桌面应用是可忽略的；换来的是"想用哪枚就写哪枚名字"。
 */
const 网址表: Record<string, string> = import.meta.glob("../assets/icons/*.svg", {
  query: "?url",
  eager: true,
  import: "default",
});

/** glob 的键是相对本文件的路径（`../assets/icons/folio-close-symbolic.svg`）。 */
const 图标网址: Record<string, string> = {};
for (const [路径, 网址] of Object.entries(网址表)) {
  图标网址[路径.slice(路径.lastIndexOf("/") + 1).replace(/\.svg$/, "")] = 网址;
}

/**
 * Nota 实际用到的那几枚。名字**与文件名逐字符相同**（含 `-symbolic` 后缀）——
 * 这样从调用处能直接找到文件，不需要第二张"别名 → 文件"的表。
 */
const 名字表 = [
  // 格式化工具栏（`ui/FormatBar.tsx`）
  "folio-format-text-bold-symbolic",
  "folio-format-text-italic-symbolic",
  "folio-format-text-strikethrough-symbolic",
  // 扩展语法的三条（高亮 / 上标 / 下标）＋ 下划线。四枚都是 Folio 那 96 枚里
  // 现成的：`folio-marker-symbolic` 的文件头就写着"标记（高亮）：记号笔 +
  // 底部高亮色条"，正是高亮那一枚。
  "folio-marker-symbolic",
  "folio-format-text-superscript-symbolic",
  "folio-format-text-subscript-symbolic",
  "folio-format-text-underline-symbolic",
  "folio-insert-code-symbolic",
  "nota-inline-code-symbolic",
  "nota-code-block-symbolic",
  "folio-insert-link-symbolic",
  "folio-insert-image-symbolic",
  "folio-view-list-bullet-symbolic",
  "folio-view-list-ordered-symbolic",
  "folio-eraser-symbolic",
  // 上面那套（Folio）里凑不出来的两枚，**是 Nota 自己画的**（`nota-` 前缀）。
  // 引用和任务列表原先拿汉字「引」「任」当图标——汉字笔画多，缩到 16px
  // 就是一团糊，而且和左右两边真正的图形混在一起看着像错位。见
  // `ui/FormatBar.tsx` 里那段说明。
  "nota-quote-symbolic",
  "nota-task-symbolic",
  // 各处"收起/关闭"的 ×（侧边栏、插件栏、标签页、查找条、提示气泡）
  // ⚠️ 2026-10-16 新用的一枚：状态栏里那颗"插件栏"开关（顶栏藏着时才出现，
  // 见 `ui/StatusBar.tsx`）。两栏并列的那个形状正对"右边那一栏"。
  "folio-columns-symbolic",
  "folio-close-symbolic",
  // 侧边栏空态里那颗「打开文件夹…」
  "folio-document-open-symbolic",
  // 偏好设置左栏那十一页（`ui/settings/SettingsDialog.tsx`）。
  // ⚠️ 在这一批之前，设置左栏用的是 `settings/primitives.tsx` 里**手写的五枚
  // 24 格细线图标**——那是第二套画风，和工具栏、侧栏、菜单里这 96 枚摆在一起
  // 看得出不一样（描边粗细、格数、圆角都对不上）。现在全应用一副面孔。
  // 挑法写在 `SettingsDialog.tsx` 的 `SECTIONS` 上，一枚一枚都有理由。
  // ⚠️「文件」那一页复用上面的 `folio-document-open-symbolic`（一枚文件夹
  // 同时表示"打开"和"文件"，本来就是一回事），所以这里没有第六个重复项。
  // ⚠️ **「Markdown」与「文档主题」这两页是 Nota 自己画的**（`nota-` 前缀，
  // 2026-09-25 换）：用户当天看完成品说「markdown 左侧的图标你可以画一个 MD，
  // 用一个框框框起来」「文档主题你也不要用这个啊」。原来那两枚（`¶` 段落符、
  // 页面 + 分页参考线）说的分别是"显示编辑标记"和"参考线"，都不是那两页在讲的
  // 事——**图标画得再好看，指错了东西也没用**。现在这两枚是同一个模子：
  // 一个圆角框 + 两个字母（MD / Aa），一眼能读，也不欠谁的。
  // ⛔ 框里**不放汉字**：汉字笔画多，缩到 16px 是一团糊，用户 2026-09-24
  // 就为此退掉过一次「引」「任」当图标（见上面那两枚 `nota-quote` / `nota-task`）。
  "folio-edit-symbolic", // 编辑器
  "folio-insert-image-symbolic", // 图像
  "nota-markdown-symbolic", // Markdown（框里的 MD）
  "folio-document-export-symbolic", // 导出
  "folio-window-symbolic", // 外观（整个应用的样子）
  "nota-doc-theme-symbolic", // 文档主题（框里的 Aa）
  "nota-keys-symbolic", // 快捷键
  "nota-plugin-symbolic", // 拓展（拼图块）
  "nota-update-symbolic", // 更新设置（循环箭头）
  "nota-advanced-symbolic", // 高级设置（三条滑杆）
  "folio-configure-symbolic", // 通用（齿轮）
  // ⚠️ 这一枚是 **Nota 自己画的**（`nota-` 前缀，2026-09-26），同上面那三枚的
  // 来路。为什么不用现成的：那一套里**没有**秒表/时钟/盾牌这一类，而最接近的
  // 两枚都指错了东西——`folio-today-symbolic` 是日历（说的是"哪一天"），
  // `folio-dialog-warning-symbolic` 是警告三角（说的是"出错了"）。
  // 「强制专注」讲的是**一段时间在走**，形状取秒表。
  "nota-force-focus-symbolic", // 强制专注（秒表）
  // ⚠️ 这两枚也是 **Nota 自己画的**（2026-09-30），来路同上。状态栏左下角那
  // 颗侧栏开关**开着和关着是两个形状**（用户 2026-09-30 照 Typora 点的名：
  // 关着是空心圆圈、开着是左向折角），而那一套 96 枚里**没有折角/箭头**这一类
  // ——最接近的 `folio-format-indent-less-symbolic` 是"减少缩进"（三角 + 正文行），
  // 拿它当"收起侧栏"是把两件事画成一张脸。
  "nota-sidebar-toggle-symbolic", // 侧栏关着（空心圆圈）
  "nota-sidebar-collapse-symbolic", // 侧栏开着（左向折角）
  // ⚠️ 这两枚也是 **Nota 自己画的**（2026-09-30），来路同上：状态栏右下角
  // **鼠标移进去才出现**的那两颗（拼写检查、展开字数统计菜单）。105 枚里
  // 没有"字母 + 对勾"这一类，而上下双箭头与"把这一项往下挪"（单个下箭头）
  // 是两码事，见各自文件头上那两段。
  "nota-spellcheck-symbolic", // 拼写检查（A + 对勾）
  "nota-unfold-more-symbolic", // 能展开一个菜单（上下双箭头）
  // 右键菜单那一排剪贴板图标（`ui/ContextMenu.tsx`，2026-10-04）。
  // ⚠️ 这四枚**本来就是 Folio 那 96 枚里的**（文件一直躺在仓库里），只是到这批
  // 才有人用——所以是"拷文件"那一步早就完成了，"加一行"这一步现在才补。
  // ⚠️ 「删除」挑的是**圆圈 + 叉**（文件头的原话：「与垃圾桶图标区分开」），
  // 不是垃圾桶。这一排里它紧挨着剪切/复制/粘贴，垃圾桶形会让人以为
  // "把这段扔了"＝"从剪贴板里扔掉"，而它其实只是删掉选中的字。
  "folio-edit-cut-symbolic", // 剪切（剪刀）
  "folio-edit-copy-symbolic", // 复制（前后两张纸）
  "folio-edit-paste-symbolic", // 粘贴（写字板 + 夹子）
  "folio-delete-symbolic", // 删除（圆圈 + 叉）
] as const;

export type 图标名 = (typeof 名字表)[number];

for (const 名 of 名字表) {
  if (!图标网址[名]) {
    console.error(
      `[图标] 名字表里的 "${名}" 在 src/assets/icons/ 里没有对应文件。` +
        `界面上那颗按钮会是空的——要么补文件，要么把这一行删掉。`,
    );
  }
}

/**
 * 一枚图标。**总是 `aria-hidden`**：图标是装饰，按钮的可读名字得由按钮自己给
 * （`aria-label`，见 `FormatBar.tsx`）。⚠️ 别在这里加 `aria-label`——
 * 一个 `aria-hidden` 的元素上的 `aria-label` 谁也读不到，只会让下一个人以为
 * 无障碍那件事已经办完了。
 *
 * `size` 默认 16：原文件就是 16 格画的，缩放到别的尺寸会糊。
 * 真要变，**成对改宽高**（写成两处的话，一颗图标会被拉成长方形）。
 */
export function Icon({ name, size = 16 }: { name: 图标名; size?: number }) {
  const 网址 = 图标网址[name];
  return (
    <span
      className={网址 ? "icon" : "icon icon-missing"}
      data-icon={name}
      aria-hidden="true"
      style={
        {
          // 主题 CSS 只需声明 `--icon-<逻辑名>: url(...)`。这里把逻辑名拼成
          // 自定义属性名，再用默认图作 fallback；不需要为每枚图标写一条组件规则。
          // 如果两处都写 `--icon-base`，行内 style 会永远赢过主题 CSS。
          "--icon-base": 网址 ? `url("${网址}")` : "none",
          "--icon-override": `var(--icon-${name}, var(--icon-base))`,
          width: size,
          height: size,
        } as CSSProperties
      }
    />
  );
}
