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

import { 问参数 } from "@/ui/plugin-prompt";
import type { PromptRequest } from "@/ui/useDialogs";
import type { PanelNode } from "@/ui/panel-nodes";

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
