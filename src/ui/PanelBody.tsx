/**
 * 面板内容的渲染层：一串 `PanelNode` → 一串 DOM。
 *
 * # ⚠️ 这里没有一条路能把字符串变成 HTML
 *
 * 每一块都是**具名 JSX**：文本走 `{text}`（React 自己转义），属性只有
 * `className` / `title` / `disabled` 这类**我们自己写的字面量**。
 * 插件给的字符串**只**出现在子节点位置。所以「插件往面板里塞一段
 * `<script>`」这件事在结构上就做不到，而不是"我们在某处过滤了它"。
 *
 * 真发生过的教训（Folio 那边的 `use-markup` 默认开）说明：靠"记得转义"
 * 是不行的，得让"忘了转义"这件事没有落点。
 *
 * # 认不出的东西如实说出来
 *
 * `kind: "unknown"` 会画一句"不认识这种内容块（kind=xxx）"。这是**给插件作者
 * 看的**：静默丢掉的话，他看到的是"我的面板少了一块"，然后会去怀疑是
 * 宿主没实现、还是自己写错了字段名，而界面上一点线索都没有。
 */

import { useState } from "react";

import { 问参数 } from "@/ui/plugin-prompt";
import type { PromptRequest } from "@/ui/useDialogs";
import type { PanelInput as PanelInputSpec, PanelNode } from "@/ui/panel-nodes";

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
                  // 它摆在那儿是给插件作者看的信号（"我这里少写了一根线"）。
                  const 灰 = b.disabled || busy !== null || !b.command;
                  return (
                    <button
                      key={j}
                      type="button"
                      className={`btn panel-btn${b.style === "normal" ? "" : ` btn-${b.style}`}`}
                      disabled={灰}
                      title={b.command ? undefined : "这个按钮没有写 `command`，点了也没事发生"}
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
                  <span key={j} className={`panel-diff-line panel-diff-${l.op}`}>
                    {l.op === "del" ? "- " : "+ "}
                    {l.text}
                    {"\n"}
                  </span>
                ))}
              </pre>
            );

          case "input":
            return (
              <PanelInput
                key={i}
                spec={node.spec}
                disabled={busy !== null}
                onSubmit={(值) => onCall(plugin, node.spec.submit, { [node.spec.arg]: 值 })}
              />
            );

          case "unknown":
            return (
              <p key={i} className="panel-unknown">
                不认识这种内容块（kind = <code>{node.raw}</code>）。
                这一块的插件版本可能比 Nota 新，或者 `kind` 拼错了。
              </p>
            );
        }
      })}
    </>
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
          title={灰 ? "这个输入框没有写 `submit` / `arg`，点了也没事发生" : undefined}
          onClick={发}
        >
          {spec.submitLabel}
        </button>
        {spec.hint && <span className="panel-input-hint">{spec.hint}</span>}
      </div>
    </div>
  );
}
