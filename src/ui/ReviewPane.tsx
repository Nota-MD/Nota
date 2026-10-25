/**
 * **编辑区里的那块插件面板**——用户在正文的位置上看插件给的东西（AI 的改动
 * 预览、git 的 diff）。
 *
 * # 用户为什么要它（2026-09-25 原话）
 *
 * 「要求允许直接在Markdown编辑区域进行预览。删除用红色背景色+删除线；
 * 加入用绿色背景色+下划线。」
 *
 * 在这之前，改动只能摊在**右侧那一栏里**（260px 宽）。diff 这种内容是
 * **左右对照着看**的东西：一行的原文和改后文放在 260px 里会折成一团，
 * 而用户真正要判断的"这一改对不对"恰恰要靠看见整段上下文。
 * 所以它得占正文那一块地方。
 *
 * # 它是"面板"，不是"另一种窗口"
 *
 * 里面画的还是 `PanelBody`——和右侧栏同一种内容块（同样的 `kind`、同样的
 * `panel-*` 类）。所以：
 *
 * - **插件那边一行新 API 都不用**：它照旧 `register_panel` 声明一块面板，
 *   只是多喊一声 `nota.ui.review(id)` 把它摊到编辑区来；
 * - 面板上的按钮、`kind = "diff"` 的行、`kind = "input"` 的输入框，
 *   在这里和在那儿是**同一份实现**，不会漂。
 *
 * ⚠️ 正因为是同一份实现，**文案也只有一份**：这里不重新解释一遍
 * "什么叫 del、什么叫 add"——那是 `panel-nodes.ts` 的事。
 *
 * # ⚠️ 谁决定"现在摊着哪一块"
 *
 * **宿主**（`plugin::ReviewState`），不是这里。这个组件是**纯展示**：
 * 拿到 `plugin` / `panel` 两个 id，去拉内容、画出来。用户按「回到正文」时
 * 它调 `onClose`（= `api.plugin.reviewClose`），**宿主那边收了这一格、
 * 发事件**，`App.tsx` 才把主区切回编辑区。
 *
 * 为什么不让这个组件自己 `useState` 一个"我开着"：那样一刷新界面就没了，
 * 而"AI 提了改动、我正在看预览"这件事不该被一次热重载抹掉
 * （与 BUG-13 同一条教训：状态归宿主，界面只照做）。
 *
 * # ⚠️ 这里的"拉"为什么没有和 `PluginDock` 共用
 *
 * `PluginDock` 那一套拉是**按面板键存一张表**的：它要在页签之间来回切而
 * 不闪白，所以每页的内容都留着。这里**只摊一块**，关了就没了——
 * 共用那套表只会让"什么时候该清"变成两边都要记的事。
 * 取舍写在这儿：**第三个调用者出现时再抽**，两个不抽。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  events,
  on,
  type PanelDirtyPayload,
  type PluginInfo,
  type PluginPanel,
  type PluginReviewPanel,
} from "@/bridge/ipc";
import { useT } from "@/i18n";
import { PanelBody } from "@/ui/PanelBody";
import { normalise, type PanelNode } from "@/ui/panel-nodes";
import type { PromptRequest } from "@/ui/useDialogs";

/**
 * 顶上那条标题栏上写什么：`插件名 · 面板标题`。
 *
 * ⚠️ 两个名字都**查表得来**，不是插件随口给的：插件能决定的只有自己那个
 * 面板 id，名字由宿主那两份清单说了算（`plugins` 里的插件名、`panels` 里的
 * 面板标题）。查不到就退到 id——**不要**因为查不到就整块不画：
 * 那会让"预览摊着、标题栏空白"看起来像界面坏了。
 *
 * ⚠️ 放在这个文件（而不是 `App.tsx`）的理由很实在：`App.tsx` 贴着 1000 行
 * 上限（`AGENTS.md` §0.4），而这段是**这个组件自己的门面**，归它管最顺。
 * 2026-09-25 起**不再导出**：语言那句提示也要查同一份插件清单，
 * 于是标题的合成搬进了组件里，外面没有人再调它。
 *
 * ⚠️ 收的是 [`PluginReviewPanel`] 而**不是** `PluginReview` 那个联合
 * （2026-09-26）：改动预览那一形态（`"diff"`）自带 `title`，不走这条查表的路
 * ——它的标题是插件给的措辞，不是"插件名 · 面板名"。
 */
function previewMarkTitle(
  // ⚠️ 只要两个字段，不要整个 `PluginReviewPanel`：`kind` 对这个函数没有意义，
  // 逼调用方现造一个 `kind: "panel"` 只是为了过类型检查（见下面 `Props` 里
  // 那两条分开的 `plugin` / `panel`）。
  review: Pick<PluginReviewPanel, "plugin" | "panel">,
  panels: PluginPanel[],
  plugins: PluginInfo[],
): string {
  const panel = panels.find((p) => p.plugin === review.plugin && p.id === review.panel);
  const plugin = plugins.find((p) => p.id === review.plugin);
  return `${plugin?.name ?? review.plugin} · ${panel?.title ?? review.panel}`;
}

interface Props {
  /** 摊着的是哪个插件。拉内容和跑命令都要它（`id` 只在插件内部唯一）。 */
  plugin: string;
  /** 插件内部的**面板** id。 */
  panel: string;
  /**
   * 标题栏上写的字。**由 [`预览标题`] 合成**——它要查插件名和面板标题
   * 那两张清单，而那两张清单在这里就有（`plugins` / `panels` 两个 props）。
   *
   * ⚠️ 早先是调用方（`App.tsx`）合成好传进来的，2026-09-25 挪进来了：
   * 语言那句提示（`langs` / `lang_ok`）也要查同一份插件清单，
   * 分成两处传就是同一件事说两遍。
   */
  plugins: PluginInfo[];
  panels: PluginPanel[];
  /** 用户按了「回到正文」。 */
  onClose: () => void;
  /** 跑一条插件命令（面板上的按钮）。错误由调用方负责说给用户听。 */
  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
}

/** 一块面板的内容此刻是什么样。**与 `PluginDock` 那边同一种状态机**。 */
type content =
  | { state: "loading" }
  | { state: "ok"; nodes: PanelNode[] }
  | { state: "error"; message: string };

export function ReviewPane({
  plugin,
  panel,
  plugins,
  panels,
  onClose,
  onCall,
  askPrompt,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`。
  const t = useT();
  const markTitle = previewMarkTitle({ plugin, panel }, panels, plugins);
  // ⚠️ 判据与插件栏那一份**同一条**（`langs` 非空 + `lang_ok` 为假），
  // 不在前端按 `lang` 再猜一遍（见 `lua/api/i18n.rs`）。没声明 `langs` 的插件
  // 不参与协商，也就没有这句话。
  const thisPlugin = plugins.find((p) => p.id === plugin);
  const languageMismatch = (thisPlugin?.langs.length ?? 0) > 0 && !thisPlugin?.lang_ok;

  const [content, setContent] = useState<content>({ state: "loading" });
  /** 正在跑的命令名。跑着的时候按钮全灰，防连点。 */
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * 请求序号：慢接口下用户可能已经点了别的按钮、甚至换了面板，
   * 回来的是一个**过期**的结果。和 `PluginDock` 那边同一个套路。
   */
  const index = useRef(0);

  const pull = useCallback(async () => {
    const thisCount = (index.current += 1);
    setContent((oldValue) => (oldValue.state === "ok" ? oldValue : { state: "loading" }));
    try {
      const nodes = normalise(await api.plugin.panelContent(plugin, panel));
      if (index.current !== thisCount) return;
      setContent({ state: "ok", nodes });
    } catch (e) {
      // **错误要看得见**：面板渲染失败（插件里 `render` 抛错）正是插件作者
      // 最需要看到的一条信息，吞掉它就是让人对着一个空白框猜。
      if (index.current !== thisCount) return;
      setContent({ state: "error", message: String(e) });
    }
  }, [plugin, panel]);

  // 摊开哪一块就拉哪一块（也包括"换了一块"：id 变了这里会重跑）。
  useEffect(() => {
    void pull();
  }, [pull]);

  // 插件喊了声"变了" → 重拉。⚠️ 只认**自己这一块**：载荷是 `(plugin, id)`，
  // `id = null` 表示"这个插件的面板都算变了"（与 `PluginDock` 同一条判据）。
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let returnActiveActive = true;

    void on<PanelDirtyPayload>(events.pluginPanel, ({ plugin: p, id }) => {
      if (p !== plugin) return;
      if (id === null || id === panel) void pull();
    }).then((u) => {
      if (returnActiveActive) unsubscribe = u;
      else u(); // 订阅回来时组件已经没了——当场退掉，别留监听者
    });

    return () => {
      returnActiveActive = false;
      unsubscribe?.();
    };
  }, [plugin, panel, pull]);

  /** 面板上的按钮：跑命令，跑完**自己**再拉一次（`PluginDock` 那边同理）。 */
  const run = async (command: string, args?: unknown) => {
    setBusy(command);
    try {
      await onCall(plugin, command, args);
    } finally {
      // ⚠️ `finally` 而不是"成功才刷"：命令失败时（比如 git 报错、AI 接口
      // 报错）界面上那句错误也常常要改面板；而且**卡在忙态上会让按钮永远灰着**。
      setBusy(null);
      void pull();
    }
  };

  return (
    <div className="review-pane">
      {/* 顶上这条是**这个组件唯一的自绘部分**：内容是面板的，标题栏和
          「回到正文」是宿主给的——插件不该有能力让用户出不去。 */}
      <div className="review-bar">
        <span className="review-title" title={markTitle}>
          {markTitle}
        </span>
        <span className="review-spacer" />
        <button
          type="button"
          className="btn review-back"
          onClick={onClose}
          // ⚠️ 这一下**不走插件**（见 `bridge/ipc.ts::reviewClose`）：
          // 插件正卡在一次慢调用里时，用户也得退得出来。
          title={t("Close the preview and go back to the document (this does not apply the changes)")}
        >
          {t("Back to the document")}
        </button>
      </div>

      <div className="review-body">
        {/* 插件语言对不上就在这儿说一句——用户正看着这个插件的字。 */}
        {languageMismatch && <p className="panel-lang">{t("This extension does not support your language")}</p>}
        {content.state === "loading" && <p className="panel-empty">{t("Loading…")}</p>}
        {content.state === "error" && (
          <p className="panel-msg panel-msg-error">{content.message}</p>
        )}
        {content.state === "ok" && (
          <PanelBody
            plugin={plugin}
            nodes={content.nodes}
            // ⚠️ `PanelBody` 的签名是 `(plugin, command, args)`，第一个参数
            // 这里用不上——**这一块面板属于哪一个插件是上面 props 定死的**，
            // 界面里没有第二条路能让按钮跑到别的插件上去。丢掉它而不是拿它
            // 去 `onCall`：少一个能被喂错的参数。
            onCall={(_p, command, args) => run(command, args)}
            askPrompt={askPrompt}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}
