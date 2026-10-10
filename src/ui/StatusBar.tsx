/**
 * 下栏：**左边两颗按钮，右边一格统计 ＋ 鼠标移进来才出现的两颗**（2026-09-30
 * 照 Typora 重做，2026-09-30 晚补的 hover 那半）。
 *
 * # 用户要的是什么
 *
 * 原话（第一批）：「**修改下栏逻辑。这是 Typora。其中左边圆圈是显示/隐藏侧边栏；
 * 第二个是切换代码/所见即所得模式。右边一个极简的统计 token 的显示区。**
 * 注意下方变化。」（下面变化那半句，指的是侧栏**开着的时候左边那颗从圆圈
 * 变成左向折角**——用户给的三张图里就这一处不同。）
 *
 * 原话（第二批，五张图）：「**平时如图1，当鼠标移到区域内时，如图2,3,4,5
 * （可以在"字数统计"小菜单修改是显示哪一个统计量）**」。也就是：
 *
 * | 什么时候 | 那一格长什么样 |
 * |---|---|
 * | 平时 | 只有「N 词」 |
 * | 鼠标停在这一栏里 | 多出两颗：**拼写检查**（`A✓`）与**展开统计菜单**（上下箭头） |
 * | 点拼写那颗 | 弹出一层菜单：自动检测语言 / 不使用拼写检查（图3） |
 * | 点箭头那颗 | 弹出一层「字数统计」菜单，四项**各带此刻的数值**（图4、图5） |
 *
 * ⚠️ 图3 那个菜单在 Typora 里是**几十种语言**（EN-US / EN-GB / ID / NB / …）。
 * Nota 这一版**只做了两项**，原因不在界面而在后端：WebKitGTK 这边我们只有
 * `set_spell_checking_enabled` 与"语言列表为空 = 跟随系统"这一条
 * （`commands/webview.rs` 文件头），**没有"系统装了哪些词典"这个查询**——
 * 列一份写死的语言名，用户选了没装的那些照样不生效，而界面上看不出区别。
 * 那半截留着，等拼写引擎那条轴定下来再说。
 *
 * 于是这一栏现在的账是：
 *
 * | 位置 | 是什么 | 谁管 |
 * |---|---|---|
 * | 左一 | 侧栏开关（关着＝空心圆圈，开着＝左向折角） | `App.tsx` 的 `sidebarOpen` |
 * | 左二 | 源码／所见即所得开关（`</>`，在源码模式时点亮） | `App.tsx` 的 `viewMode`（家在 `ui/useFileKindMode.ts`，会话内、**不落盘**） |
 * | 右一之左 | 强制专注余额（**只在跑着的时候出现**） | `ui/FocusMeter.tsx` |
 * | 右一 | 「N 词」，悬停给出词/字符/行/约几分钟 | 下面那个 `四个` 表 |
 * | 右一之右 | 展开「字数统计」菜单的那颗箭头（**悬停才出现**） | 同上 |
 * | 最左那颗（悬停才出现） | 拼写检查菜单 | `settings.editor.spellcheck` |
 *
 * ⚠️ **下面一行都不在了**（用户答「其余全删」）：文件路径、`● 已修改`、
 * 模式名、`严格`、字符数、行数、「约几分钟」。删掉的是**显示**，不是数据——
 * 那些数仍然每一个都在算（`countText` 一次全给），只是改成**那个小菜单里看**。
 * 其中两件要单独说：
 *
 * - **「● 已修改」的落点是窗口标题**（`ui/useWindowTitle.ts`），不是凭空没了。
 *   这一栏里它原来和文件路径挤在一格，是"这一栏实在太满"的一部分。
 * - **强制专注的余额留着**，它不是"这份文档有多少字"，是"应用在替你记什么账"
 *   ——`ui/FocusMeter.tsx` 头上写着「看不到余额这个功能就不成立」。
 *
 * # 2026-09-24 那两条口径仍然有效
 *
 * | 显示什么 | 什么时候显示 | 为什么 |
 * |---|---|---|
 * | 模式（现在由那颗 `</>` 的点亮状态表示） | **恒显** | 它不是是非题，三个值里总有一个是真的，藏着反而要用猜 |
 * | 「严格」 | **不显示**（2026-09-30 起） | 它是少数派口径（默认关），常驻一个"没开"等于把状态栏开成开关清单 |
 *
 * ⚠️ 2026-09-30 晚新增的第三条口径：**"悬停才出现"只配给"展开一个菜单"这一
 * 类**（拼写那颗、箭头那颗）。左边两颗开关与那一格统计**不参加**——它们
 * 是这一栏的正事，藏起来会变成"要点一下才看得见现在是什么状态"。
 *
 * # ⚠️ 2026-09-30：这两颗是**开关**，不是指示器
 *
 * 2026-09-24 那版写死过一句「这两个都是只读指示，不是开关……指示器不该有
 * 副作用」。那说的是**模式名那格字**（那时它确实只是一格字）。**现在这两颗
 * 是按钮**，用户点名的就是"点一下切过去"（「左边圆圈是显示/隐藏侧边栏；
 * 第二个是切换代码/所见即所得模式」）——所以那条规矩在这一版**不适用**，
 * 别拿旧注释把它锁回去。
 *
 * ⚠️ 但"不要第三个真相"那半句照旧：**这一层一个状态都不存**——
 * 侧栏开合住在 `App.tsx` 的 `sidebarOpen` 里，模式住在 `ui/useFileKindMode.ts`
 * 那条 `useState` 里（**会话内状态**，2026-10-07 起不落盘；`App.tsx` 把它们
 * 递下来），显示哪个统计量住在
 * `settings.appearance.status_metric` 里，拼写开关
 * 住在 `settings.editor.spellcheck` 里。这里只拿现成的值画个形状、把点击
 * 原样交出去（四个回调）。自己 `useState` 一份的症状是"菜单里选了，勾也动了，
 * 那一格还是旧数"。
 *
 * ⚠️ **源码那颗在"分屏"模式下不亮**：它的语义是"**是不是源码模式**"，
 * 而分屏既不是源码也不是所见即所得——点它从分屏进源码模式，符合
 * 「切换代码/所见即所得」那半句。
 *
 * # 「统计 token」按**词**算（默认那一项）
 *
 * 用户写的是 token，给的参考图里 Typora 那格写的是「0 词」。这一栏沿用
 * `ui/outline.ts::countText` 的 `words`（**CJK 按字、西文按词**）——与
 * 写作统计插件、分享卡同一口径。⚠️ **真要换成 LLM 那种 token 数
 * 得另立一个判据**（分词器/折算率），不是在这里换一个字段名的事。
 *
 * # 2026-09-27：「没文档」那一支也得画强制专注的余额
 *
 * 开窗目检的时候发现的：**在主页（没打开文档）开着强制专注，状态栏一个字都
 * 没有**——因为下面那个 `if (!doc)` 直接返回了一个只有「就绪」的栏。而
 * `ui/FocusMeter.tsx` 头上写着「看不到余额这个功能就不成立」，菜单里那一条又是
 * 任何时候都能点的，所以这是**实质上的漏洞**。
 *
 * ⚠️ 判据是「**这一格说的是应用在记什么账，不是这份文档有多少字**」。所以它跟着
 * `doc` 一起消失是错的；跟着 `focus.running` 出现才对（`FocusMeter` 自己判）。
 *
 * ⚠️ 同一把尺子也管着 2026-09-30 新增的那三样（两颗按钮 ＋ 那一格统计）：
 * 它们说的是**这份文档**有多少内容，所以 `doc` 为空时**一起不画**。
 * 拼写开关本身是全局的，但它在没有正文的地方没有一个可拨的对象。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Document, ViewMode } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";
import type { StatusMetric } from "@/bridge/types-settings";
import { useT } from "@/i18n";
import { FocusMeter } from "@/ui/FocusMeter";
import { Icon } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";
import type { MenuEntry } from "@/ui/commands";
import { countText } from "@/ui/outline";

/**
 * 「字数统计」菜单里四项的**排列顺序**（用户给的图4 里就是这么一个次序：
 * 分钟、行、词、字符）。
 *
 * ⚠️ 顺序**不是** `StatusMetric` 枚举的声明顺序（那个是"默认项排第一"）。
 * 图里怎么排就怎么排——用户是拿那张图来点名的。
 */
const 菜单次序: StatusMetric[] = ["minutes", "lines", "words", "characters"];

/** 菜单条目的 id 前缀。**不是命令**——它们不进 `ui/commands.ts` 那张表
 * （同 `TabBar.tsx` 里那条右键菜单的写法）。 */
const 统计前缀 = "status.metric.";

export function StatusBar({
  doc,
  mode,
  sidebarOpen,
  readingSpeed,
  focus,
  metric,
  onPickMetric,
  spellcheck,
  拼写语言,
  onSetSpellcheck,
  onToggleSidebar,
  onToggleSource,
  onHide,
}: {
  doc: Document | null;
  /** 当前**实际**编辑模式（`App.tsx` 的 `viewMode`：家在那条会话内 `useState`，这里已经过完降级）。**只用来点亮那颗 `</>`。** */
  mode: ViewMode;
  /** 侧栏此刻开着没有（`App.tsx` 的 `sidebarOpen`）。**决定左一是圆圈还是折角。** */
  sidebarOpen: boolean;
  /**
   * 阅读速度（词/分钟，`settings.appearance.reading_speed`），只用来算悬停提示里
   * 那句「约几分钟读完」与菜单里的分钟那一项。
   *
   * ⚠️ **必须传进来，不能在下面写一个常量**：2026-09-25 之前这里用的是
   * `countText` 里写死的 250，于是偏好设置里那一项**拨了没有任何效果**，
   * 而它自己的说明写着"只用于把总字数换算成状态栏里的「约几分钟读完」"。
   */
  readingSpeed: number;
  /**
   * 强制专注此刻的状态（`ui/useForceFocus.ts`）。**没在跑就是 `null` 或
   * `running: false`，两种都不画那一格。**
   *
   * ⚠️ **必须传进来，不能在这一层自己订阅**：订阅是 `App.tsx` 那一层做的
   *（菜单项也要它），在这里再订一次就是同一个事件两个听众，
   * 而这个数每秒都在变——两处各存一份迟早会显示成两个不同的数。
   */
  focus: FocusState | null;
  /** 那一格**平时**显示哪一个统计量（`settings.appearance.status_metric`）。 */
  metric: StatusMetric;
  /** 用户在菜单里挑了另一项。**落到 `settings.appearance.status_metric`。** */
  onPickMetric: (m: StatusMetric) => void;
  /**
   * 拼写检查此刻开着没有（`settings.editor.spellcheck`）。
   * `null` = 设置还没读回来（**两项都画灰**，别猜一个值出来）。
   */
  spellcheck: boolean | null;
  /**
   * 拼写检查配的那几门语言（`settings.editor.spellcheck_langs`）。
   * **空数组 = 跟随系统**，`null` = 设置还没读回来。
   *
   * ⚠️ **只用来把菜单第一项的措辞说准**（2026-10-10 加的语言那一格，
   * 当天晚些从"一门"改成"多门"）：配了具体语言时，那一项再写「自动检测语言」
   * 就是一句假话——它实际用的是那几门。多门时**全都列出来**（用 `, ` 连），
   * 不写"N 门"：用户勾的是 `en_GB` 还是 `en_US` 是他自己记得住的，而"N 门"
   * 他得再点进设置页才知道是哪几门。
   * 菜单里**不放语言列表**（那是一个十几项的列表，塞在这个小菜单里没法用；
   * 选语言在「设置 → 编辑器 → 拼写检查」那一页）。
   */
  拼写语言: string[] | null;
  /** 用户在菜单里选了「自动检测语言 / 不使用拼写检查」。**落到 `settings.editor.spellcheck`。** */
  onSetSpellcheck: (on: boolean) => void;
  /** 显示/隐藏侧栏。**与「视图」菜单、`Ctrl+Shift+L`、侧栏那颗 × 同一个 setter。** */
  onToggleSidebar: () => void;
  /** 切到源码模式／切回所见即所得。**在 App 那边落到 `设模式`**（会话内状态，不落盘）。 */
  onToggleSource: () => void;
  /**
   * 收起这一栏（**最右端那颗 ×**，2026-10-04 补，`docs/07` 第 49 项）。
   *
   * ⚠️ **与「视图 → 状态栏」是同一个 setter**（`App.tsx` 那颗传下来的是
   * `setChrome({ show_status_bar: false })`）：那一格设置仍是唯一真相源，
   * 这颗 × **不是第二份状态**（同 `ui/Sidebar.tsx` 那颗 × 的口径）。
   *
   * ⚠️ **只收不切换**（同侧栏那颗："点一个 × 却把它点开了"不合预期）；
   * 要再打开去「视图 → 状态栏」，所以这一栏**不负责留提示**
   * （菜单栏那条不同：它藏下去会带走唯一写着自己怎么回来的地方，
   * 见 `ui/useChromeVisibility.ts` 头上那段）。
   */
  onHide: () => void;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  // ⚠️ 必须在下面任何 `return` **之前**：hooks 不能有条件。
  const t = useT();
  const counts = useMemo(
    () => countText(doc?.text ?? "", readingSpeed),
    [doc?.text, readingSpeed],
  );

  /** 整个栏的 DOM。**开菜单时要拿它量锚点**（见 `开菜单`）。 */
  const 栏 = useRef<HTMLElement | null>(null);

  /** 开着哪个菜单。`null` = 都没开。⚠️ 两个菜单**共用一个锚**（都在这一栏上）。 */
  const [菜单, set菜单] = useState<"count" | "spell" | null>(null);
  /** 那个菜单的锚点（视口坐标）。与 `菜单` 同生共死，分开存会让 CSS 有一次空锚。 */
  const [锚, set锚] = useState<{ left: number; top: number } | null>(null);

  const 关菜单 = useCallback(() => {
    set菜单(null);
    set锚(null);
  }, []);

  const 开菜单 = useCallback(
    (哪个: "count" | "spell") => {
      // ⚠️ **再点同一颗就收起来**：菜单是点开的，点同一颗关掉——桌面软件的手感。
      //（⚠️ 别照 `MenuPopup` 里 BUG-17 那套"谁开的"抄：那个坑的成因是
      // **划过**也会开子菜单，而这里只有"点"这一条路，不存在划过那一前因。）
      if (菜单 === 哪个) {
        关菜单();
        return;
      }
      const r = 栏.current?.getBoundingClientRect();
      if (!r) return;
      // ⚠️ 锚点钉在**这一栏的上沿、右端**：菜单是往上弹的（`.status-menu-anchor`
      // 那段 CSS 写着为什么），左端用不着——菜单自己 `right: 0`。
      set锚({ left: r.right, top: r.top });
      set菜单(哪个);
    },
    [菜单, 关菜单],
  );

  // 点别处 / 按 Esc / 改窗口大小 / 滚动 → 关掉。⚠️ 前两条与 `TabBar.tsx` 那两条
  // **同一条口径**，理由也照抄：`mousedown` 不是 `click`（`click` 要等鼠标抬起，
  // 期间菜单还开着，点到的东西会被挡着——表现是"点了两下才关掉"）；Esc 必须监听
  // **捕获期**，因为焦点在弹层里时那一条会被 `useMenuRovingFocus` 吃掉
  //（它只调 `onDismiss`，也就是下面那个，所以两条不冲突：谁先到都关）。
  // ⚠️ **滚动与改窗口大小要关**：菜单是 `fixed` 的，而这栏会跟着窗口变宽变窄
  //（侧栏一拖就变），脱节之后菜单指着的位置就不对了。
  useEffect(() => {
    if (!菜单) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (栏.current?.contains(el as Node)) return;
      // ⚠️ 子菜单是 portal 到 `body` 的（`MenuPopup` 文件头那段），它**不在**
      // `栏` 里面。少了这一条，点子菜单里的项会先被这里关掉整个菜单。
      if (el?.closest?.(".menu-sub")) return;
      关菜单();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") 关菜单();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", 关菜单);
    window.addEventListener("scroll", 关菜单, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", 关菜单);
      window.removeEventListener("scroll", 关菜单, true);
    };
  }, [菜单, 关菜单]);

  // 四个统计量**此刻的文案**（数值已经填进去了）。⚠️ **四个数一次全算好**
  // （上面那个 `counts`）：菜单里四项各自带着自己此刻的数值排着（图4 就是
  // 那样），不是"选了才算"。
  //
  // ⚠️ 四条 `t(...)` **必须写在这里**，不能改成"表里存键、用的时候再翻"
  // （`t(键表[m], 数)`）——`tools/i18n-check.sh` 扫的是**代码里的字符串字面量**，
  // 键一旦变成变量它就再也看不见这四条，于是中文表里那四行会被判成"废键"
  // （实测：真报了 FAIL）。这是这套"键就是英文原文"的代价，别绕。
  const 四个: Record<StatusMetric, string> = {
    minutes: t("{0} minutes", counts.readingMinutes),
    lines: t("{0} lines", counts.lines),
    words: t("{0} words", counts.words),
    characters: t("{0} characters", counts.characters),
  };

  // ⚠️ 这里传进去的是**已经翻好的句子**，而 `MenuPopup` 内部还会
  // `t(entry.label)` 一次。那一次查不到就原样返回——本仓既有做法
  // （`TabBar.tsx` 那条右键菜单同样），不是漏翻。
  const 统计条目: MenuEntry[] = 菜单次序.map((m) => ({
    id: 统计前缀 + m,
    label: 四个[m],
    checkable: true,
  }));

  const 统计勾: Record<string, boolean> = {};
  for (const m of 菜单次序) 统计勾[统计前缀 + m] = m === metric;

  const 拼写条目: MenuEntry[] = [
    {
      id: "spell.auto",
      // ⚠️ 配了具体语言时那一项就得说那几门（2026-10-10，当天晚些支持多门）：
      // 菜单里只有「开」和「关」两项，写"自动检测语言"而实际用的是 `en_GB`
      // 就是假话。
      label:
        拼写语言 && 拼写语言.length > 0
          ? t("Languages: {0}", 拼写语言.join(", "))
          : t("Auto-detect language"),
      checkable: true,
    },
    { id: "spell.off", label: t("Do not check spelling"), checkable: true },
  ];
  // ⚠️ 两件事是**同一个布尔的两种说法**（后端只有"跟随系统"这一种语言状态，
  // 见文件头那段），所以两项互斥。`null`（设置没读回来）时**两项都灰**。
  // ⚠️ 语言那一格**不进这两个勾**（它只说"用哪本词典"，开/关还是这个布尔）；
  // 它只在上面那句措辞里露面。
  const 拼写勾: Record<string, boolean> = {
    "spell.auto": spellcheck === true,
    "spell.off": spellcheck === false,
  };
  const 拼写灰 = new Set(spellcheck === null ? ["spell.auto", "spell.off"] : []);

  // 悬停才看得见的那一整份统计。⚠️ 用 ` · ` 拼成一行：`title` 属性里的换行
  // 在 WebKit 上不一定断行，多行提示会长得没法看。
  const 详细 = t(
    "{0} words · {1} characters · {2} lines · about {3} min",
    counts.words,
    counts.characters,
    counts.lines,
    counts.readingMinutes,
  );

  const 左 = (
    <span className="status-left">
      <button
        type="button"
        className="status-btn"
        onClick={onToggleSidebar}
        title={t("Toggle Sidebar")}
        aria-label={t("Toggle Sidebar")}
        aria-pressed={sidebarOpen}
      >
        <Icon
          name={sidebarOpen ? "nota-sidebar-collapse-symbolic" : "nota-sidebar-toggle-symbolic"}
        />
      </button>
      <button
        type="button"
        className="status-btn"
        data-on={mode === "source" || undefined}
        onClick={onToggleSource}
        title={t("Switch between source mode and WYSIWYG")}
        aria-label={t("Switch between source mode and WYSIWYG")}
        aria-pressed={mode === "source"}
      >
        <Icon name="folio-insert-code-symbolic" />
      </button>
    </span>
  );

  const 专注 = <FocusMeter state={focus} />;

  return (
    <footer className="statusbar" ref={栏}>
      {左}
      <span className="status-right">
        {专注}
        {/* ⚠️ 没文档时这三样**一起不画**：它们说的都是"这份文档有多少内容"
            （见文件头最后那段）。 */}
        {doc && (
          <span className="status-count-group">
            <button
              type="button"
              className="status-btn status-aux"
              data-on={菜单 === "spell" || undefined}
              onClick={() => 开菜单("spell")}
              title={t("Spell check")}
              aria-label={t("Spell check")}
              aria-haspopup="menu"
              aria-expanded={菜单 === "spell"}
            >
              <Icon name="nota-spellcheck-symbolic" />
            </button>
            <span className="status-count" title={详细}>
              {四个[metric]}
            </span>
            <button
              type="button"
              className="status-btn status-aux"
              data-on={菜单 === "count" || undefined}
              onClick={() => 开菜单("count")}
              title={t("Which count the status bar shows")}
              aria-label={t("Which count the status bar shows")}
              aria-haspopup="menu"
              aria-expanded={菜单 === "count"}
            >
              <Icon name="nota-unfold-more-symbolic" />
            </button>
          </span>
        )}
        {/* 最右端那颗 ×（2026-10-04，第 49 项）。
            ⚠️ **在 `.status-right` 里面**（不是 `footer` 的第三个孩子）：这一栏是
            `justify-content: space-between`，加第三个孩子会把「那一格统计」
            从右端挤到中间去。
            ⚠️ 它**不跟** `.status-aux` 那一族（不是悬停才出现的）：它是这一栏的
            正事——"关掉这一栏"和"这一栏显示什么"并列，藏起来等于没有出口。 */}
        <button
          type="button"
          className="status-btn statusbar-close"
          title={t("Hide the status bar")}
          aria-label={t("Hide the status bar")}
          onClick={onHide}
        >
          <Icon name="folio-close-symbolic" />
        </button>
      </span>

      {菜单 && 锚 && (
        // ⚠️ 锚容器在 `footer` **里面**（右键菜单那个锚在 `.tabbar` 里，同一套）：
        // 上面那条"点别处关掉"靠 `栏.current.contains` 判，锚在外面的话点菜单项
        // 会先被当作"点到了别处"。
        <div className="status-menu-anchor" style={{ left: 锚.left, top: 锚.top }}>
          {菜单 === "count" ? (
            <MenuPopup
              label={t("Word Count")}
              heading="Word Count"
              entries={统计条目}
              disabled={new Set()}
              checks={统计勾}
              onPick={(id) => {
                const 挑的 = 菜单次序.find((m) => 统计前缀 + m === id);
                关菜单();
                if (挑的) onPickMetric(挑的);
              }}
              onDismiss={关菜单}
              // ⚠️ `←` `→` 在这里**什么都不做**：菜单栏那一套是"往左右切一栏"，
              // 而这一层是独立的一层、没有"邻栏"可切。传空函数而不是省略——
              // 省略的话那一层会拿到 `undefined` 并在按键时炸（同 `TabBar.tsx`）。
              onArrowOut={() => {}}
            />
          ) : (
            <MenuPopup
              label={t("Spell check")}
              entries={拼写条目}
              disabled={拼写灰}
              checks={拼写勾}
              onPick={(id) => {
                关菜单();
                onSetSpellcheck(id === "spell.auto");
              }}
              onDismiss={关菜单}
              onArrowOut={() => {}}
            />
          )}
        </div>
      )}
    </footer>
  );
}
