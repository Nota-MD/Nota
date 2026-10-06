/**
 * 查找与替换条（`docs/07` backlog 第 4 项）。
 *
 * # 它是**显示端 + 输入端**，不是查找的实现
 *
 * 真正的查找在 `editor/find.ts`（所见即所得）与 `editor/source.ts`（源码）
 * 里，两条通路形状完全一样，由 `EditorPaneHandle` 抹平。这一层只做三件事：
 * 收用户的字、把字报上去、把编辑器报回来的**命中数**画出来。
 *
 * ⚠️ 所以这里**不认识文档内容**——"几个命中、现在第几个"一律是编辑器
 * 报上来的 `status`。本地算一份的话，两边（尤其是源码模式下的正则）
 * 迟早会算出不一样的数，而界面上没人分得清哪个对。
 *
 * # 为什么不做"边打字边跳"
 *
 * 每次查询变化都报一次（`onQuery`），编辑器那侧会**一并选中第一个命中**。
 * 不过滤、不去抖：查找是这个条子的**全部目的**，慢一拍的代价是用户在
 * 一个空条子前面等。
 *
 * # ⚠️ 两个输入框里按 Esc 是"关掉查找条"，但**要放过输入法**
 *
 * Esc 收在条子自己身上（不是 `window`），并且带 `isComposing` 判据：
 * 中文用户正在选字时按 Esc 是"取消候选"，抢过来会把整个条子关掉。
 * 同理，Enter 在组字期间是"确认候选"，不能当成"下一个"。
 * 这条判据和 `ui/accel.ts` 里那条是同一个理由。
 */

import { useEffect, useRef, useState, type KeyboardEvent as 键盘事件 } from "react";

import { 默认查找选项, type FindOptions, type FindStatus } from "@/editor/find";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface Props {
  /** 编辑器报上来的命中情况。条子只显示它，不自己算。 */
  status: FindStatus;
  /** 查询或三个开关变了。空串 = 把高亮全清掉。 */
  onQuery: (query: string, options: FindOptions) => void;
  /** 走上一个（`-1`）/ 下一个（`1`）。 */
  onStep: (方向: 1 | -1) => void;
  /** 替换当前命中。 */
  onReplace: (text: string) => void;
  /** 全部替换。 */
  onReplaceAll: (text: string) => void;
  /** 关掉查找条。关的动作（清高亮、把焦点还给编辑区）由调用方做。 */
  onClose: () => void;
  /**
   * 替换那一行画不画（2026-10-06，第 95 项）。
   * ⚠️ `Ctrl+F` = `false`（只找）、`Ctrl+H` = `true`（找并替换）——**同一个条子**，
   * 差别只在这一格。不画那一行时，**替换那两件事的入口就整个消失**，
   * 这比"灰着"干净：没打开替换的人不需要看见两颗永远用不上的按钮。
   */
  显示替换: boolean;
}

export function FindBar({
  status,
  onQuery,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
  显示替换,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();

  // 三个开关按钮。`key` 是它在 `FindOptions` 里的字段名（**不翻**，它是取值用的）。
  //
  // ⚠️ 这张表**必须建在组件里**，不能提回模块级（2026-09-26 从模块级搬进来）：
  // 模块级求值时 `t` 是那个**没订阅**的版本（首帧画的是兜底语言，之后再没人通知
  // 它重画），而且 `tools/i18n-check.sh` 数的是源码里字面写出来的 `t("…")`——
  // 存成模块级常量就等于把这几句中文当数据，那些键会算"没被调用"。同
  // `ui/PluginDock.tsx` 里那三张表。
  // `label` 里 `Aa` / `.*` 是**符号**（两种语言下都一样），所以只有「全词」要翻。
  const 开关组: { key: keyof FindOptions; label: string; title: string }[] = [
    { key: "caseSensitive", label: "Aa", title: t("Match Case") },
    { key: "wholeWord", label: t("Word"), title: t("Match Whole Word: a match cannot be part of a longer word") },
    { key: "regex", label: ".*", title: t("Regular Expression (a broken pattern is not an error — it just finds nothing this time)") },
  ];
  const [query, setQuery] = useState("");
  const [替换成, set替换成] = useState("");
  const [options, setOptions] = useState<FindOptions>(默认查找选项);
  const 查询框 = useRef<HTMLInputElement>(null);

  // ⚠️ 查询上报走**ref 读**，不进下面那个 effect 的依赖：`onQuery` 是
  // `App` 每次重渲染新建的函数，进依赖就等于"每渲染一次重设一次查询"，
  // 而设查询会把光标搬到第一个命中上——那样连点两下别的东西都会跳光标。
  const 上报 = useRef(onQuery);
  上报.current = onQuery;

  // 打开就把光标放进查询框。
  useEffect(() => {
    查询框.current?.focus();
  }, []);

  // 查询或开关一变就报上去。⚠️ 挂载时也报一次（`query` 是空串 = 清空高亮）：
  // 编辑器可能是**刚建出来的**（换文档、切模式），它手里没有任何查找状态，
  // 而条子看起来"已经写着上次那个词"——不报这一次，两边就对不上了。
  useEffect(() => {
    // ⚠️ **正则开着时 `wholeWord` 不参与**（2026-10-06，第 95 项）：那颗按钮在上
    // 面是灰的，值也必须在这里归零——不然界面上"关着"、行为上"开着"，
    // 而用户看不见我们悄悄加的那道边界。⚠️ 归一化只发生在这**一次上报**上，
    // `options` 本身不动：关掉正则之后那颗开关要原样回来。
    上报.current(query, {
      ...options,
      wholeWord: options.regex ? false : options.wholeWord,
    });
  }, [query, options]);

  /**
   * 命中数的说法。⚠️ **三种情况分开写**，因为它们的含义不同：
   * 没查（空查询）/ 查了没有 / 查到了第几个。
   * 合成一句的话，"0 / 0" 会同时表示后两种，而它们对用户的意义相反。
   */
  const 计数 =
    status.query === ""
      ? ""
      : status.total === 0
        ? t("No results")
        : `${status.current} / ${status.total}`;

  /** 组字期间一概不接（理由见文件头）。 */
  const 组字中 = (e: 键盘事件) =>
    e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;

  return (
    <div
      className="find-bar"
      role="search"
      aria-label={t("Find and Replace")}
      // ⚠️ 收在条子自己身上，不绑 `window`：绑了的话，焦点在编辑区里
      // 按 Esc 也会把条子关掉——而那时用户多半是想收输入法的候选框。
      onKeyDown={(e) => {
        if (组字中(e)) return;
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* 替换那一行（2026-10-06，第 95 项）：⚠️ **只由 `显示替换` 管**。
          ⚠️ 第一版把这一层套在了**上一行**上，于是 `Ctrl+F` 开出来跟 `Ctrl+H` 一模一样——`tsc` 照样过（JSX 是平衡的），**只有开窗看一眼才发现**。 */}
      <div className="find-row">
        <input
          ref={查询框}
          className="find-input"
          type="text"
          value={query}
          placeholder={t("Find")}
          spellCheck={false}
          aria-label={t("Search text")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (组字中(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();
              // Shift+Enter 往回走，和大多数编辑器一致。
              onStep(e.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className="find-count" aria-live="polite">
          {计数}
        </span>
        {开关组.map((s) => (
          // ⚠️ **正则开着时「全词」灰掉**（2026-10-06，第 95 项）：正则自己就有
          //   `\b`，再叠一层"命中两侧不许是词字符"是**两把尺子量一件事**——
          //   用户在正则里写的边界会被我们悄悄改掉，而屏幕上什么都看不出来。
          //   ⚠️ 光灰掉不够：**值也必须真的不参与**（否则它仍留在 `options` 里
          //   被上报上去，界面上"关着"、行为上"开着"，那就是撒谎）。
          //   所以下面那个 `onClick` 与上报那一趟都用 `算得出` 归一化过。
          (() => {
            const 失灵 = s.key === "wholeWord" && options.regex;
            return (
          <button
            key={s.key}
            type="button"
            className="find-toggle"
            data-on={!失灵 && options[s.key]}
            data-off={失灵 || undefined}
            aria-pressed={!失灵 && options[s.key]}
            disabled={失灵}
            title={失灵 ? t("Not used while Regular Expression is on — \\b does the same job") : s.title}
            // 同 `FormatBar`：不拦的话按钮会把焦点从输入框抢走，
            // 用户点完开关得再点一次输入框才能接着打字。
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOptions((p) => ({ ...p, [s.key]: !p[s.key] }))}
          >
            {s.label}
          </button>
            );
          })()
        ))}
        <button
          type="button"
          className="find-btn"
          title={t("Previous")}
          aria-label={t("Previous")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onStep(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-btn"
          title={t("Next")}
          aria-label={t("Next")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onStep(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-btn"
          title={t("Close (Esc)")}
          aria-label={t("Close Find")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
        >
          <Icon name="folio-close-symbolic" />
        </button>
      </div>
      {显示替换 && (

      <div className="find-row">
        <input
          className="find-input"
          type="text"
          value={替换成}
          placeholder={t("Replace with")}
          spellCheck={false}
          aria-label={t("Replacement text")}
          onChange={(e) => set替换成(e.target.value)}
        />
        <button
          type="button"
          className="find-btn find-btn-wide"
          // ⚠️ 不拦的话，"替换"会把焦点抢走，而"替换"最常用的姿势是
          // **连点好几下**——第二下之后就换成替换输入框里的字了。
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onReplace(替换成)}
        >
          {t("Replace")}
        </button>
        <button
          type="button"
          className="find-btn find-btn-wide"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onReplaceAll(替换成)}
        >
          {t("Replace All")}
        </button>
      </div>
      )}
    </div>
  );
}
