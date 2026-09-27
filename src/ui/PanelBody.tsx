/**
 * 面板内容的渲染层：一串 `PanelNode` → 一串 DOM。
 *
 * # ⚠️ 这里没有一条路能把字符串变成 HTML
 *
 * 每一块都是**具名 JSX**：文本走 `{text}`（React 自己转义），属性只有
 * `className` / `title` / `disabled` 这类**本仓自己写的字面量**。
 * 插件给的字符串**只**出现在子节点位置。所以「插件往面板里塞一段
 * `<script>`」这件事在结构上就做不到，而不是"在某处过滤了它"。
 *
 * 真发生过的教训（Folio 那边的 `use-markup` 默认开）说明：靠"记得转义"
 * 是不行的，得让"忘了转义"这件事没有落点。
 *
 * # 认不出的东西如实说出来
 *
 * `kind: "unknown"` 会画一句"不认识这种内容块（kind=xxx）"。这是**给插件作者
 * 看的**：静默丢掉的话，他看到的是"面板少了一块"，然后会去怀疑是
 * 宿主没实现、还是自己写错了字段名，而界面上一点线索都没有。
 */

import { useState } from "react";

import { useT } from "@/i18n";
import { 推纵刻度, 格式化数 } from "@/ui/chart-ticks";
import { 问参数 } from "@/ui/plugin-prompt";
// ⚠️ 分享图那一块（`kind: "share"`）2026-09-27 搬去了 `ui/ShareCard.tsx`：
// 强制专注的总结框要共用同一份"存/复制"实现，而那个框不是面板、够不着本文件的
// 私有组件。`.panel-share*` 那几个类名没变（仍在 `share.css`）。
import { ShareCardBlock } from "@/ui/ShareCard";
import type { PromptRequest } from "@/ui/useDialogs";
import type {
  PanelAction,
  PanelChart,
  PanelDiffOp,
  PanelGraphLine,
  PanelHeatmap,
  PanelInput as PanelInputSpec,
  PanelNode,
} from "@/ui/panel-nodes";

/**
 * 差异行**行首那一列标记**。
 *
 * 不只是好看：`src/styles/diff.css` 里给颜色配的装饰（删除线 / 下划线）和
 * 底色一起，才让"这行是删的还是加的"不**只**靠颜色能读出来。行首这个字符
 * 是第三道冗余——红绿色觉障碍的用户靠它读（Folio 那边也是这么说的：
 * 「颜色只是加了一层冗余信息——每行开头的 +/- 一直都在」）。
 *
 * ⚠️ 加/删各占两个字符（标记 + 一个空格），上下文补**两个空格**好让三类行的
 * 文字左边缘对齐。段头与文件信息给空串：它们是**整行原样**（`@@ -1,4 +1,4 @@`、
 * `diff --git a/x b/x` 自己就带着标记），再补一个前缀就成了 `@@ @@ -1,4 …`。
 */
const DIFF_MARK: Record<PanelDiffOp, string> = {
  add: "+ ",
  del: "- ",
  ctx: "  ",
  hunk: "",
  meta: "",
};

interface Props {
  /** 这些按钮属于哪个插件。`panelContent(plugin, id)` 里的那个 `plugin`。 */
  plugin: string;
  nodes: PanelNode[];
  /** 跑一条插件命令。**错误由调用方负责说给用户听**（那边有 toast）。 */
  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;
  /** 弹宿主的单行输入框。面板**没有**自己的输入控件，要问就用它。 */
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
  /** 正在跑的命令名。跑着的时候按钮全灰，防连点。 */
  busy: string | null;
}

export function PanelBody({ plugin, nodes, onCall, askPrompt, busy }: Props) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  const t = useT();
  /**
   * 点一个按钮。
   *
   * `prompt` 那一条是**先问再发**。⚠️ 那一步（以及"取消就什么都不做"这条规矩）
   * 在 `ui/plugin-prompt.ts`，与插件**菜单项**那条路共用同一份实现——
   * 写两遍就会漂，漂的那一半是"把空串当参数发出去"这种不报错的毛病。
   */
  const 点按钮 = async (b: Extract<PanelNode, { kind: "buttons" }>["items"][number]) => {
    if (b.disabled || busy || !b.command) return;

    // 用户取消 → `null` → 到此为止（`plugin-prompt.ts` 里写着理由）。
    const 问 = await 问参数({ prompt: b.prompt, askPrompt, args: b.args, title: b.label });
    if (!问) return;

    await onCall(plugin, b.command, 问.args);
  };

  /**
   * 点提交树上的一颗（那一行的左边或右边）。
   *
   * 与上面那颗按钮只差一件事：**没有 `prompt` 那一步**——树上没有需要先问一句
   * 的动作（`panel-nodes.ts::PanelAction` 写着这条）。`busy` 时同样不理，
   * 因为树上的键一按就是一次 git 调用。
   */
  const 点动作 = (a: PanelAction) => {
    if (busy) return;
    void onCall(plugin, a.command, a.args);
  };

  return (
    <>
      {nodes.map((node, i) => {
        // ⚠️ key 用下标是**对的**：这一串没有任何身份，插件每次渲染给的都是
        // 一份全新的列表（`render` 每次重跑）。用内容当 key 反而会在两行文字
        // 恰好相同时撞车，而用下标最坏也只是重挂一次 DOM。
        switch (node.kind) {
          case "heading":
            return (
              <h4 key={i} className="panel-heading">
                {node.text}
              </h4>
            );

          case "text":
            return (
              <p key={i} className={`panel-text tone-${node.tone}`}>
                {node.text}
              </p>
            );

          case "fields":
            return (
              <dl key={i} className="panel-fields">
                {node.items.map((f, j) => (
                  <div key={j} className="panel-field">
                    <dt>{f.label}</dt>
                    <dd className={`tone-${f.tone}`}>{f.value}</dd>
                  </div>
                ))}
              </dl>
            );

          case "list":
            return (
              <ul key={i} className="panel-list">
                {node.items.map((it, j) => (
                  <li key={j} className={`panel-item tone-${it.tone}`}>
                    <div className="panel-item-main">
                      <span className="panel-item-title" title={it.title}>
                        {it.title}
                      </span>
                      {it.badge && <span className="panel-item-badge">{it.badge}</span>}
                    </div>
                    {it.subtitle && <div className="panel-item-sub">{it.subtitle}</div>}
                  </li>
                ))}
              </ul>
            );

          case "buttons":
            return (
              <div key={i} className="panel-buttons">
                {node.items.map((b, j) => {
                  // 没写 `command` 的按钮**画成灰的**，而不是消失：
                  // 它摆在那儿是给插件作者看的信号（"这里少写了一根线"）。
                  const 灰 = b.disabled || busy !== null || !b.command;
                  return (
                    <button
                      key={j}
                      type="button"
                      className={`btn panel-btn${b.style === "normal" ? "" : ` btn-${b.style}`}`}
                      disabled={灰}
                      title={b.command ? undefined : t("这个按钮没有写 `command`，点了也没事发生")}
                      onClick={() => void 点按钮(b)}
                    >
                      {b.label || b.command}
                    </button>
                  );
                })}
              </div>
            );

          case "empty":
            return (
              <p key={i} className="panel-empty">
                {node.text}
              </p>
            );

          case "separator":
            return <hr key={i} className="panel-sep" />;

          case "message":
            return (
              <div key={i} className={`panel-msg panel-msg-${node.from}`}>
                {/* ⚠️ 说话人这两个字**不翻译**：「AI」本来就是缩写，「你」是
                    第二人称——它跟界面语言无关，跟**对话里谁在说话**有关。 */}
                <span className="panel-msg-who">{node.from === "user" ? "你" : "AI"}</span>
                {/* 预格式：AI 的回答里换行是内容的一部分（列表、代码、改动块），
                    当普通段落会被折叠成一行。仍然走 `{text}`——React 转义。 */}
                <span className="panel-msg-text">{node.text}</span>
              </div>
            );

          case "diff":
            return (
              <pre key={i} className="panel-diff">
                {node.items.map((l, j) => (
                  // 粘在一行里的 `-`/`+` 行没有可点的东西，所以这里不需要交互；
                  // 应用由插件那条命令负责（它才知道该改哪儿）。
                  //
                  // ⚠️ `diff-line` / `diff-<op>` 是**和编辑区那份改动预览
                  // 共用**的类（`src/styles/diff.css`）：同一次改动在两处
                  // 必须长一样，否则用户会以为是两回事。
                  <span key={j} className={`diff-line diff-${l.op}`}>
                    {DIFF_MARK[l.op]}
                    {l.text}
                    {"\n"}
                  </span>
                ))}
              </pre>
            );

          case "graph":
            return (
              <div key={i} className="panel-graph">
                {node.items.map((l, j) => (
                  // ⚠️ 和别的块一样用下标当 key（理由同上面那段：这一串没有身份）。
                  <GraphRow key={j} line={l} disabled={busy !== null} onPress={点动作} />
                ))}
              </div>
            );

          case "chart":
            return <PanelChartBlock key={i} spec={node.spec} />;

          case "heatmap":
            return <PanelHeatmapBlock key={i} spec={node.spec} />;

          case "share":
            // ⚠️ 卡片是**画出来**的（一张 SVG → `<img>`），不是拼成一堆 DOM：
            // 它最后要变成 PNG（存盘/进剪贴板），预览与成品必须出自同一份绘制
            // 代码（`ui/share-card.ts`）。拼 DOM 的话就变成两套画法——面板上
            // 看着挺好、存出来却不是那张，而这种错在截图上根本对比不出来。
            // ⚠️ 这一块**不在本文件里**（2026-09-27 搬去了 `ui/ShareCard.tsx`）：
            // 强制专注的总结框要共用同一份"存/复制"实现，而那个框不是面板。
            return <ShareCardBlock key={i} spec={node.spec} />;

          case "input":
            return (
              <PanelInput
                key={i}
                spec={node.spec}
                disabled={busy !== null}
                onSubmit={(值) => onCall(plugin, node.spec.submit, { [node.spec.arg]: 值 })}
              />
            );

          case "frame":
            // 没地址 = 没在跑（宿主那边"这场会话不在了"填的就是空）。
            // 画一句提示，而不是嵌一个永远转圈的空白框——后者看起来像卡住了。
            return node.url ? (
              <iframe
                key={i}
                className="panel-frame"
                // ⚠️ 这里是全仓唯一一处把外部内容嵌进 DOM 的地方，所以
                // **该给的权限一条都不多给**：顶层跳转、弹窗、表单、模态、
                // 指针锁、下载全部关掉，只留下脚本。
                //
                // ⚠️ 但 `allow-same-origin` **必须给**——不给就是一片空白
                // （2026-09-25 实测坐实）：少了它，这个框拿到的来源是"不透明的"，
                // 而开发服务器上的页面（Slidev 这种 SPA）一碰 `localStorage`
                // 就抛异常，脚本当场死掉。用户看到的是一块**什么都没有**的深色
                // 方框，控制台里连条报错都没有，是最难查的那种。
                //
                // ⚠️ 它**不等于**"把宿主交出去"：框里嵌的是开发服务器自己的
                // `http://127.0.0.1:端口`（或 `localhost:端口`），和界面自己的来源
                // （`localhost:5273` / `tauri://localhost`）**不同源**，
                // 所以跨来源那道墙还在，那条页面够不着 Nota 的 DOM。
                // 这一条只是把"自己的来源"还给那个页面。
                sandbox="allow-scripts allow-same-origin"
                // 地址已经过 `本机地址()`（协议 + 主机名两道），
                // 浏览器那头还有 CSP 的 `frame-src` 兜一层。
                src={node.url}
                style={{ height: `${node.height}px` }}
                title={t("插件预览")}
              />
            ) : (
              <p key={i} className="panel-empty">
                {node.alive
                  ? t("预览的地址不对，嵌不进来。")
                  : t("预览没有在跑。「停止」之后再点一次「预览」试试。")}
              </p>
            );

          case "unknown":
            return (
              <p key={i} className="panel-unknown">
                {t("不认识这种内容块（kind={0}）", node.raw)}{" "}
                {t("这一块的插件版本可能比 Nota 新，或者 `kind` 拼错了。")}
              </p>
            );
        }
      })}
    </>
  );
}

/**
 * 提交树上的一行：左边那截图线，右边那串字。
 *
 * # 两头各自可以是一颗按钮，也可以只是一段文字
 *
 * 判据是**插件给没给那一颗动作**（`PanelGraphLine.bond` / `.pick`）：给了就画
 * 按钮，没给就画 `<span>`。⚠️ **不是"给不了就画成灰按钮"**——纯连接线行
 * （`|\`）右边本来就没有提交，画一颗灰按钮会让人以为"这里本来能点"。
 *
 * # 为什么是两颗按钮而不是"整行一颗"
 *
 * 一行的左半是**键**（通向某个提交），右半是**提交本身**。合成一颗就必须二选一，
 * 而两种意图都是真的（见 `git` 插件里那段：点键看"这次提交改了什么"，
 * 点字选中两个提交比一比）。
 *
 * ⚠️ 画的是 `<button>` 而不是可点的 `<div>`：键盘 Tab 能走到、回车能触发，
 * 都不用再写一遍。代价是按钮的默认长相（边框/底色/内边距）必须在
 * `dock.css` 里全部抹掉，否则两颗按钮会把树撑成一列方块。
 */
function GraphRow({
  line,
  disabled,
  onPress,
}: {
  line: PanelGraphLine;
  disabled: boolean;
  onPress: (a: PanelAction) => void;
}) {
  const 键 = line.bond;
  const 字 = line.pick;

  return (
    <div className={`pg-row tone-${line.tone}${line.picked ? " is-picked" : ""}`}>
      {键 ? (
        <button
          type="button"
          className="pg-art"
          title={键.title || undefined}
          disabled={disabled}
          onClick={() => onPress(键)}
        >
          {line.art}
        </button>
      ) : (
        <span className="pg-art">{line.art}</span>
      )}

      {字 ? (
        <button
          type="button"
          className="pg-text"
          // `title` 里放**整串字**：这一栏只有 260px，长标题会被截断
          //（`dock.css` 的 `text-overflow`），鼠标停上去得能看到全的。
          title={字.title || line.text}
          disabled={disabled}
          onClick={() => onPress(字)}
        >
          {line.text}
        </button>
      ) : (
        // 空串也占一个位置：纯连接线行的右半边保持空着，**不要**用 `&nbsp;`
        // 之类的东西去撑——那会变成一颗看不见但存在的可点区域。
        <span className="pg-text" />
      )}
    </div>
  );
}

/**
 * 面板里的输入框。
 *
 * # ⚠️ 发出去之后**立刻清空**，不等结果
 *
 * 输入框里的字是**用户还没交出去的东西**，而交出去之后它的归属就变了：
 * 它成了对话里的一条消息，**由插件那边记着**（`render` 下一趟就把它画出来）。
 * 所以"清空"不是"扔掉"，是"交给插件保管"。
 *
 * 反过来（等成功再清）会有一个更坏的表现：慢接口下用户看着自己刚打的字
 * 一动不动地待在那儿，既没发出去也没法改——而这个框**只在下一次重拉时才重画**，
 * 拖得越久越像卡住了。真失败时插件会把它当成一条"发送失败"的 AI 消息画出来，
 * 字没丢。
 *
 * ⚠️ 这里**没有** `value` 之外的受控逻辑：面板是"每次拉都现跑"的，
 * 组件会被整块重画，所以输入到一半的草稿**可能随重画消失**——
 * 这是这一版的已知取舍（面板不适合当草稿本），写进 `docs/13` §input。
 */
function PanelInput({
  spec,
  disabled,
  onSubmit,
}: {
  spec: PanelInputSpec;
  disabled: boolean;
  onSubmit: (值: string) => Promise<void>;
}) {
  // ⚠️ 这是**另一个组件**，`PanelBody` 里那个 `t` 它够不着，得自己订阅一次
  // （`useT` 是 hook，不能在两个组件之间借用）。
  const t = useT();
  const [草稿, set草稿] = useState("");
  const 灰 = disabled || !spec.submit || !spec.arg;

  const 发 = () => {
    const 值 = 草稿.trim();
    if (灰 || !值) return;
    set草稿("");
    void onSubmit(值);
  };

  return (
    <div className="panel-input">
      {spec.multiline ? (
        <textarea
          className="panel-input-box"
          rows={3}
          value={草稿}
          placeholder={spec.placeholder}
          disabled={灰}
          onChange={(e) => set草稿(e.target.value)}
          // 多行框用 `Ctrl/Cmd+Enter` 发：回车在这个框里是**换行**，
          // 否则一段话永远打不完（发出去的都是第一行）。
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              发();
            }
          }}
        />
      ) : (
        <input
          type="text"
          className="panel-input-box"
          value={草稿}
          placeholder={spec.placeholder}
          disabled={灰}
          onChange={(e) => set草稿(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              发();
            }
          }}
        />
      )}

      <div className="panel-input-foot">
        <button
          type="button"
          className="btn btn-primary panel-input-send"
          disabled={灰 || !草稿.trim()}
          title={灰 ? t("这个输入框没有写 `submit` / `arg`，点了也没事发生") : undefined}
          onClick={发}
        >
          {spec.submitLabel}
        </button>
        {spec.hint && <span className="panel-input-hint">{spec.hint}</span>}
      </div>
    </div>
  );
}

/* ── 数字与曲线（`kind = "chart"`）────────────────────────────────────── */

/**
 * 曲线的逻辑画布（`viewBox` 的单位，不是像素）。
 *
 * ⚠️ 用 `viewBox` ＋ CSS 撑满宽度，而不是把面板的**像素**宽高量出来再算坐标：
 * 面板的宽度是会变的（插件栏 260px、`wide` 面板更宽、`nota.ui.review` 还摊到
 * 编辑区里去），量一次就得再挂一个 `ResizeObserver` 跟着它——而"坐标是坐标、
 * 显示是显示"本来就是 SVG 自带的事，用它就行。
 *
 * ⚠️ 代价是横竖**不等比**（宽被拉长、高不动），描边宽度会跟着变形，所以下面
 * 那条路径挂着 `vector-effect="non-scaling-stroke"`：描边按屏幕像素走，不跟着
 * 缩放。这是 SVG 2 的属性，WebKit 认；万一将来哪个内核不认，表现是"线比设计的
 * 粗或细一点"，不会画不出来。
 *
 * ⚠️ 高宽比定成 30:100 是**给 260px 那一档**定的：面板一栏默认 260px 宽、
 * 曲线 CSS 高 64px，画出来大约 2.5:1，一眼能看出起伏。改宽度那一档的时候
 * 不必跟着改这里——`preserveAspectRatio="none"` 会自己撑满。
 */
const 画布宽 = 100;
const 画布高 = 30;

/**
 * 一块**热力图**（`kind = "heatmap"`，长期记录，2026-09-27 加）。
 *
 * 用户原话：「加一个功能，类似 Contribution Graph 那样的热力图，记录长期数据。
 * 仅记录打字数。」一格一天、一列一周，看的是几个月到一年的勤快程度——
 * 与上面那块曲线（刚才这几分钟）是两个尺度，所以两块可以同页。
 *
 * ⚠️ **格子在这里只是画出来**："哪一格是哪一天、多深"全是 `ui/heatmap.ts` 算好
 * 的（纯函数、单独测）。这一层不碰日期、不碰星期几，只把它们摆成一排。
 * ⚠️ **没有记录时整块不画**（`列` 是空数组）——一个什么都没有的灰网格会被读成
 * "这些天你一个字都没写"，而事实是"这本账还没有内容"（`PanelHeatmap.grid` 那段）。
 *
 * ⚠️ 整块对读屏软件是 `aria-hidden` 的：一排没有文字的色块对它没有意义，而**这块
 * 图要说的事插件紧接着会用一句人话再说一遍**（「近半年，你在 173 天里写下了
 * 128,400 个字」）。格子上的数（每格多少字）走 `title`，那是鼠标悬停时才有的东西。
 */
function PanelHeatmapBlock({ spec }: { spec: PanelHeatmap }) {
  if (spec.grid.列.length === 0) return null;
  return (
    <div className="panel-heat">
      {spec.title && <div className="panel-heat-title">{spec.title}</div>}
      <div className="panel-heat-grid" aria-hidden="true">
        {spec.grid.列.map((列, i) => (
          // ⚠️ 用下标当 key：这一串是"第几周"，没有身份（同上面 `panel-graph`）。
          <div key={i} className="heat-col">
            {/* 月份那格**每一列都占位**（没有月份就是一个空 div）：只在这一列画
                的话，有月份的那几列会比别的列高一截，整排格子就参差了。 */}
            <div className="heat-month">{列.月}</div>
            {列.格.map((格) => (
              <span
                key={格.日}
                className={`heat-cell heat-${格.档}`}
                // 悬停看到"哪一天、写了多少"。⚠️ 这一串是给人看的本地话，
                // 不翻译：它是 `2026-09-27` 这种日期 ＋ 一个数，译不出别的东西。
                title={格.值 > 0 ? `${格.日} · ${格.值} ${spec.unit}` : 格.日}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 一块"大数字 ＋ 一条曲线"。
 *
 * ⚠️ 曲线是**真 SVG**（React 生成的 `<path>`），不是 canvas、更不是 HTML 串：
 * `points` 里那些数只会变成路径指令里的数字，没有任何一条路能变成标签或属性
 * （本文文件头那条"没有一条路能把字符串变成 HTML"）。
 *
 * ⚠️ **少于两个点就不画图**：一个点画出来是一条横贯面板的直线，看着像"速度
 * 恒定"，而它其实是"只有一个采样"。宁可只显示数字——那才是此刻唯一确定的事。
 */
function PanelChartBlock({ spec }: { spec: PanelChart }) {
  const t = useT();
  const 点 = spec.points;
  const 有图 = 点.length >= 2;

  // ⚠️ 归一化的上下界取**这段时间自己的**极值，不写死 0：写作速度从 0 起跳、
  // 累计字数从某个非零值起跳，两种曲线的"底"本来就不一样。取 min/max 之后，
  // 平的那一段贴着底、高峰顶到天，一块 64px 高的图里才看得出起伏。
  const 上限 = 有图 ? Math.max(...点) : 0;
  const 下限 = 有图 ? Math.min(...点) : 0;
  const 跨度 = 上限 - 下限;

  // ⚠️ 跨度是 0（这一段一直没变，比如停笔了）时**摆在中线**，不是贴着底：
  // 贴着底容易读成"掉到零了"，而事实是"一直平着"。
  const 纵向 = (v: number) => (跨度 > 0 ? (上限 - v) / 跨度 : 0.5) * 画布高;
  const 横向 = (i: number) => (i / (点.length - 1)) * 画布宽;

  // 刻度（2026-09-27 加，用户：「横纵坐标的刻度要标」）。
  //
  // ⚠️ **纵轴由这里推**（按 `points` 的极值，与上面 `纵向()` 那条归一化同源），
  // **横轴只有插件标得出来**（一个点对应哪一刻是插件定的）。分工与理由在
  // `ui/chart-ticks.ts` 文件头那张表。插件自己给了纵轴刻度就用它的。
  const 纵刻度 = spec.yTicks.length > 0 ? spec.yTicks : 推纵刻度(点);
  const 横刻度 = spec.xTicks;

  // ⚠️ 保留两位小数：一条 200 点的曲线如果每个坐标都是十几位有效数字，
  // 那个 `d` 字符串会白白长出好几千字符（宿主和前端各截一刀也拦不住它）。
  const 折线 = 点
    .map((v, i) => `${i === 0 ? "M" : "L"}${横向(i).toFixed(2)} ${纵向(v).toFixed(2)}`)
    .join(" ");
  // 曲线下面那层淡淡的面：收口从最后一个点垂直落到右下角，再回到左下角。
  const 面积 = `${折线} L${画布宽} ${画布高} L0 ${画布高} Z`;

  return (
    <div className="panel-chart">
      {spec.label && <div className="panel-chart-label">{spec.label}</div>}

      <div className="panel-chart-value">
        {/* ⚠️ 空串画一个破折号：那是"这一格现在没有数"，而不是 0——
            0 是"打得慢"，破折号是"还没有结论"，两者不能画成同一个东西。 */}
        <span className="panel-chart-number">{spec.value || "—"}</span>
        {spec.unit && <span className="panel-chart-unit">{spec.unit}</span>}
      </div>

      {有图 && (
        <div className="panel-chart-plot-wrap">
          {/* 纵轴刻度：左边一条窄边栏。⚠️ 它是**单独一层 HTML**，不是 SVG 里的
              `<text>`——这块 svg 横竖不等比（`preserveAspectRatio="none"`），
              里面的字会被横向拉扁。文字一律走 HTML 叠层。 */}
          {纵刻度.length > 0 && (
            <div className="panel-chart-yticks" aria-hidden="true">
              {纵刻度.map((k, i) => (
                <span
                  key={i}
                  className={
                    "panel-chart-ytick" +
                    (k.at <= 0.001 ? " is-top" : k.at >= 0.999 ? " is-bottom" : "")
                  }
                  style={{ top: `${k.at * 100}%` }}
                >
                  {k.label}
                </span>
              ))}
            </div>
          )}

          <svg
            className="panel-chart-plot"
            viewBox={`0 0 ${画布宽} ${画布高}`}
            // ⚠️ `none`：横竖各自撑满。等比的话曲线只占中间一条，左右全是空白。
            preserveAspectRatio="none"
            // 这块图的意思是给读屏软件的一句话——里面那些数字对它是没有形状的。
            // ⚠️ 刻度写进这句里：它们是**读得出来的数**，而曲线对读屏是一团空气。
            role="img"
            aria-label={
              横刻度.length > 0
                ? t(
                    "曲线，共 {0} 个点，纵轴 {1} 到 {2}",
                    点.length,
                    格式化数(上限),
                    格式化数(下限),
                  )
                : t("曲线，共 {0} 个点", 点.length)
            }
          >
            {/* 刻度的横线：线用 `non-scaling-stroke`，不然竖着被压扁的那点
                缩放会把 1px 的线画成看不见的细缝。 */}
            {纵刻度.map((k, i) => (
              <line
                key={i}
                className="panel-chart-grid"
                x1={0}
                x2={画布宽}
                y1={k.at * 画布高}
                y2={k.at * 画布高}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path className="panel-chart-area" d={面积} />
            <path
              className="panel-chart-line"
              d={折线}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}

      {/* 横轴刻度：曲线正下方一行字。⚠️ 与上面那块图**左右对齐**（都让开
          纵轴那条边栏），否则标签会整体偏出去一条边栏的宽度。 */}
      {有图 && 横刻度.length > 0 && (
        <div className="panel-chart-xticks" aria-hidden="true">
          {横刻度.map((k, i) => (
            <span
              key={i}
              className={
                "panel-chart-xtick" +
                (k.at <= 0.001 ? " is-start" : k.at >= 0.999 ? " is-end" : "")
              }
              style={{ left: `${k.at * 100}%` }}
            >
              {k.label}
            </span>
          ))}
        </div>
      )}

      {spec.caption && <div className="panel-chart-caption">{spec.caption}</div>}
    </div>
  );
}
