/**
 * 正文上方那条 **YAML front matter 横幅**（`docs/07` 第 64 项，2026-10-04 加；
 * 2026-10-07 从 `ui/EditorPane.tsx` 拆成本文件，同一天那次拆分见 `docs/07` 第 89 项）。
 *
 * front matter 不在文档树里（切法见 `editor/front-matter.ts`），所见即所得的
 * 正文里看不见它——这一条横幅就是它的落点：既**如实说明**开头那几行没丢，
 * 也让人就地能读能改。
 *
 * # 一件事只归一边管
 *
 * | 谁 | 管什么 |
 * |---|---|
 * | 这个组件 | 横幅长什么样、输入框里**正在打**的那几个字、两击确认 |
 * | `EditorPane` | 编辑器实例、`最新文本Ref`（"编辑器最后报来的那份文本"） |
 * | `editor/front-matter.ts` | 切、拼、判据、模板（**纯函数，唯一的判据**） |
 *
 * **改的路只有一条**：`runCommand("frontMatter", …)` —— 那段文本归编辑器那一侧
 * 持有（`create.ts` 里那个 `前置块` 变量），这里绝不自己拼一份存起来：两处各存
 * 一份的话，插件整篇替换文本之后横幅里那份就成了旧的。
 *
 * # ⚠️ 为什么由外面**推**文本进来（`同步`），而不是在这里读
 *
 * 编辑器每敲一个字都会报一份全文（`onChange`）。那份文本**不进 React 状态**
 * （每敲一下重渲染一次整棵树，而且会让"编辑器报来的"与"React 记着的"两份
 * 文本互相追）。所以外面用命令式的那一下 `同步(markdown)` 把文本递进来，
 * 这个组件**只在真正有变化时**才 setState。
 *
 * ⚠️ 也因此它**在外面的模式切成源码时也照样收**（`显示=false` 那一档）：状态
 * 得一直跟着，不然切回所见即所得时横幅里是切走之前那一刻的旧内容。
 * **不要**改成"源码模式下不渲染这个组件"——那会把它的状态一起扔掉。
 *
 * # ⚠️ 输入框是**受控**的，但**不跟着文档走**
 *
 * 编辑框里的字归用户所有。编辑器每次报文本都无脑覆盖它的话，我们**自己提交
 * 出去的那一笔回声**会把用户正在打的字顶掉——他打第三个字母的时候光标会当场
 * 跳一下（见 [`提交`]）。区分"回声"与"真的变了"靠 `基准Ref`。
 */

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { useT } from "@/i18n";
// 开头那段 front matter（上面这条横幅，`docs/07` 第 64 项）。⚠️ 切片、拼回、
// 判据、模板都在 `front-matter.ts` 那一份里——这里只**读**它、**改**它，
// 绝不自己再切一刀（判据两处各写一份的话，编辑器藏起来的那几行与横幅里
// 显示的那几行迟早不是同一段）。
import { 拆前置块, 拆前置块内文, 换前置块, 新建前置块模板 } from "@/editor/front-matter";

/**
 * 横幅里那颗「删除」等第二下的时间窗（`docs/07` 第 64 项）。
 *
 * ⚠️ 它是**两击确认**，不是弹窗：那一段是文档内容、而且这份文档是自动保存的，
 * 误点一下就没了太容易。为一行 YAML 把 `useDialogs` 那一套从 `App` 一路传进来
 * 不值当，而"按钮自己变成『确认删除』、过几秒再变回去"这条路不需要任何新通道。
 *
 * ⚠️ 4 秒是**猜的**：短到不会让人对着一个已经变了意思的按钮发呆，长到够看清
 * 那行字再点第二下。它与 `EditorPane` 里 `SYNC_DEBOUNCE_MS` 那几档没有关系
 *（不是同一类时间）。
 */
const 删除确认毫秒 = 4000;

/** 外面（`EditorPane`）递进来的三样东西。 */
export interface FrontMatterBannerProps {
  /**
   * 现在是不是**所见即所得**那一档。⚠️ 这是"要不要**露面**"，不是"要不要
   * 挂载"——组件一直挂在那儿（理由见文件头），源码模式下它渲染 `null`。
   */
  显示: boolean;
  /** 读"编辑器最后报来的那份文本"（那几个动作要现取那段内文）。 */
  读文本: () => string;
  /** 把输入框里那段 YAML 交给编辑器。`null` = **删掉**那一段。 */
  写前置块: (内文: string | null) => void;
}

/** 外面用它把编辑器报来的文本推给横幅，见文件头。 */
export interface FrontMatterBannerHandle {
  /**
   * @param markdown 编辑器手里那份全文
   * @param 允许摊开
   *   `true`（默认）：这一段**从没有到有**、而且内容正是菜单里那条模板时，
   *   顺手把输入框摊开（用户下一步准是去填它）。
   *   ⚠️ 建实例那一刻要传 `false`——那一份本来就在盘上，用户没点过任何东西。
   *   不挡的话，开头正好写着 `title: ` 的文档一打开就会弹出一个输入框，
   *   看着像编辑器自己动了他的文件。
   */
  同步: (markdown: string, 允许摊开?: boolean) => void;
}

export function FrontMatterBanner({
  显示,
  读文本,
  写前置块,
  ref,
}: FrontMatterBannerProps & { ref?: Ref<FrontMatterBannerHandle> }) {
  const t = useT();
  /**
   * 这份文档开头有没有 YAML front matter（有 = 正文上方要挂那条横幅）。
   *
   * ⚠️ 它**不是建实例那一刻算一次**的（2026-10-04 第 64 项起）：菜单里那条
   * 「YAML Front Matter」能在文档开着的时候把这一段建出来、横幅里那颗「删除」
   * 又能把它删掉——那是两个中途翻转的时刻，只算一次的话横幅要么不出现、
   * 要么删完了还挂在那儿。现在它跟着**每一次报来的文本**重算（同值不引起重画）。
   */
  const [有前置块, set有前置块] = useState(false);
  /**
   * 横幅里那个 YAML 输入框的**内容**。
   *
   * ⚠️ 它是**受控**的，但**不跟着文档走**：编辑框里的字归用户所有。编辑器每次
   * 报文本都无脑覆盖它的话，我们**自己提交出去的那一笔回声**会把用户正在打的
   * 字顶掉——他打第三个字母的时候光标会当场跳一下（见 [`提交`]）。
   */
  const [前置块内文, set前置块内文] = useState("");
  const [前置块展开, set前置块展开] = useState(false);
  /** 「删除」按了第一下，正等着第二下。4 秒后自己变回去，见 [`删除`]。 */
  const [删前置块待确认, set删前置块待确认] = useState(false);
  const 前置块框Ref = useRef<HTMLTextAreaElement>(null);
  /** 两击确认那个定时器。 */
  const 待确认定时Ref = useRef<number | null>(null);
  /**
   * **文档里**那段 front matter 的内文（`null` = 没有这一段）。
   *
   * 它只有一个用处：认出"刚报回来的这一份就是我刚才写进去的那一笔"。不做这个
   * 区分的话，每次提交都会绕回来覆盖一遍输入框——而规范化（内文末尾的空行）
   * 会让那份覆盖**与用户手里那份差一个字节**，症状就是他正打着字、光标跳回行尾。
   */
  const 前置块基准Ref = useRef<string | null>(null);
  /**
   * 上一次**见到**的内文（含建实例那一刻那一份）。
   *
   * 用处也只有一个：认出"这一次是**从没有到有**"——那一定是菜单里刚点出来的
   * 那一条，用户下一步准是去填它，所以顺手把输入框摊开。
   */
  const 上一次内文Ref = useRef<string | null>(null);

  /**
   * 把"编辑器手里这份文本"里那段 front matter 反映到横幅上
   * （`docs/07` 第 64 项；两种模式共用，源码那一侧不画横幅但也得记着，
   * 不然切回来时状态是旧的）。
   *
   * ⚠️ **它不管编辑框里正在打的那几个字**：底下那一段变了才覆盖输入框，
   * 而我们自己提交出去的那一笔回声**不算变**（判据是 `前置块基准Ref`）。
   * 不区分这两件事的话，用户每打一个字母都会被自己那一笔写回来的规范化结果
   * 覆盖一次，光标当场跳到末尾。
   */
  const 同步 = (markdown: string, 允许摊开 = true) => {
    const 块 = 拆前置块(markdown).前置块;
    const 内文 = 块 === null ? null : 拆前置块内文(块);
    // "从没有到有"＝这一段是刚冒出来的。会这么干的只有两处：菜单里那条
    //「YAML Front Matter」（建的是模板）和插件整篇替换文本。
    const 刚冒出来 = 内文 !== null && 上一次内文Ref.current === null;
    上一次内文Ref.current = 内文;
    set有前置块(内文 !== null);
    if (内文 === null) set前置块展开(false); // 删掉了（或插件拿掉了）就合上
    if (内文 === 前置块基准Ref.current && !刚冒出来) return; // 自己那一笔回声
    前置块基准Ref.current = 内文;
    set前置块内文(内文 ?? "");
    // 刚建出来的那一段是用户点"插入 YAML Front Matter"点出来的，下一步准是
    // 去填它——顺手摊开（省掉一次"再点一下编辑"）。⚠️ 只认模板：插件塞进来的
    // 那一段内容多半是它自己管的，把输入框弹出来只是噪声。
    // ⚠️ 建实例那一次**不算**（`允许摊开` 传 `false`），理由见句柄那一条。
    if (允许摊开 && 刚冒出来 && 内文 === 新建前置块模板) set前置块展开(true);
  };

  // ⚠️ 空依赖：它只碰 ref 与 setState（`同步` 这份闭包不读任何 prop）。
  useImperativeHandle(ref, () => ({ 同步 }), []);

  /** 从"最后一次知道的文本"里现取那段内文（`null` = 这份没有 front matter）。 */
  const 现取内文 = (): string | null => {
    const 块 = 拆前置块(读文本()).前置块;
    return 块 === null ? null : 拆前置块内文(块);
  };

  /**
   * 摊开输入框（「编辑」那一颗，以及刚建出那一段时自动摊开）。
   *
   * ⚠️ 读的是外面那个"编辑器最后报来的那一份"，不是属性传进来的初值：
   * 编辑器自己规范化过的结果不在后者里。
   */
  const 打开框 = () => {
    const 内文 = 现取内文() ?? "";
    // ⚠️ 基准**先摆好**：这一刻起输入框里那份就是"文档里那份"，接下来任何一次
    // 报回来的相同内文都算回声，不会再把框重填一遍。
    前置块基准Ref.current = 内文;
    set前置块内文(内文);
    set删前置块待确认(false);
    set前置块展开(true);
  };

  /** 合上输入框。**不提交任何东西**——每一次按键都已经提交过了（见下）。 */
  const 合上框 = () => {
    if (待确认定时Ref.current !== null) {
      window.clearTimeout(待确认定时Ref.current);
      待确认定时Ref.current = null;
    }
    set删前置块待确认(false);
    set前置块展开(false);
  };

  /**
   * 把输入框里那段 YAML 交给编辑器。**每一次按键都交，不做去抖。**
   *
   * ⚠️ 不去抖的理由有两条：① 这条路改的是文档树**之外**的一段文本，不重新
   * 解析正文（见 `create.ts::写前置块`），比在正文里打一个字还便宜；② 底下推给
   * 后端那一跳本来就有 300ms 去抖。少一层去抖也就少一个坑——"打完最后一个字
   * 就关标签页，那一笔还在定时器里"。
   */
  const 提交 = (内文: string) => {
    // ⚠️ **清空不等于删除**：清掉一个输入框是极容易误触的动作，而这份文档是
    // 自动保存的。空的就一个字都不写；要删那一段走「删除」（它还要按两下）。
    if (内文.trim() === "") return;
    const 原块 = 拆前置块(读文本()).前置块;
    const 新块 = 换前置块(原块, 内文);
    if (新块 === null || 新块 === 原块) return; // 一个字都不会变，别惊动编辑器
    // 基准挪到**规范化之后**的那一份（内文末尾的空行会被收掉一个）：等会儿
    // 编辑器报回来的回声要与它逐字相同，才认得出"这是我自己刚写的那一笔"。
    前置块基准Ref.current = 拆前置块内文(新块);
    写前置块(内文);
  };

  /**
   * 删掉那一段。**两击确认**（第一下只是把按钮上的字换成「确认删除」）。
   *
   * ⚠️ 为什么不弹窗：那一段是文档内容、而且会自动存回盘上，一次误点不该就没了
   * ——但为一行 YAML 把 `useDialogs` 那一套从 `App` 一路传进来也不值当。
   * 两击确认不需要任何新通道，代价是那行小字要写清楚（见下面那个 `title`）。
   */
  const 删除 = () => {
    if (!删前置块待确认) {
      if (待确认定时Ref.current !== null) window.clearTimeout(待确认定时Ref.current);
      set删前置块待确认(true);
      待确认定时Ref.current = window.setTimeout(() => {
        待确认定时Ref.current = null;
        set删前置块待确认(false);
      }, 删除确认毫秒);
      return;
    }
    合上框();
    // 基准**先**挪到 `null`：等会儿报回来的是"没有这一段"，与它相等 ⇒ 输入框
    // 不会被重新填上（否则那一段刚删掉又出现在框里，看着像没删掉）。
    前置块基准Ref.current = null;
    写前置块(null);
  };

  // 输入框摊开之后把焦点交进去、插入点落到末尾：这一段是用户刚点出来要填的
  //（「编辑」或者菜单里那条「YAML Front Matter」），不接焦点的话他得再点一下；
  // 光标落在末尾是因为新建出来的模板就一句 `title: `，紧接着要打的是值。
  useEffect(() => {
    if (!前置块展开) return;
    const 框 = 前置块框Ref.current;
    if (!框) return;
    框.focus();
    框.setSelectionRange(框.value.length, 框.value.length);
  }, [前置块展开]);

  // ⚠️ 走的时候把那个定时器按掉：它只是把按钮上的字变回去，但留着的话那一下
  // 会打在**下一份文档**的横幅上（换文档 = 这个组件跟着 `key={doc.id}` 重挂）。
  useEffect(
    () => () => {
      if (待确认定时Ref.current !== null) window.clearTimeout(待确认定时Ref.current);
    },
    [],
  );

  // ⚠️ 两个条件缺一不可，而且**都在这里判**（不在外面）：
  // - `显示`：源码模式与分屏的左侧都是 CodeMirror，那边没有"文档树外的那一段"
  //   这回事，横幅不露面。⚠️ 但组件**照样收** `同步`（见文件头）；
  // - `有前置块`：没有这一段的时候不摆一条空横幅——那会变成一块常驻的装饰，
  //   而"这里本来没有东西"不该占一行。要**加**那一段走菜单里那条
  //   「YAML Front Matter」（`create.ts::写前置块` 里 `payload` 缺省的那一支）。
  if (!显示 || !有前置块) return null;

  return (
    <div className="editor-frontmatter" role="region" aria-label={t("Front matter")}>
      <div className="editor-frontmatter-head">
        <span className="editor-frontmatter-title">{t("Front matter")}</span>
        {前置块展开 ? (
          <button type="button" className="editor-frontmatter-btn" onClick={合上框}>
            {t("Done")}
          </button>
        ) : (
          <button type="button" className="editor-frontmatter-btn" onClick={打开框}>
            {t("Edit")}
          </button>
        )}
        {/* ⚠️ 两击确认（见 [`删除`]）。第二下之前那行字要**先说清楚
            再按哪一下**，不然"确认删除"看着像已经删了。 */}
        <button
          type="button"
          className="editor-frontmatter-btn editor-frontmatter-del"
          data-arming={删前置块待确认 ? "true" : undefined}
          title={t("The line itself goes away too — this one takes two clicks.")}
          onClick={删除}
        >
          {删前置块待确认 ? t("Confirm delete") : t("Delete")}
        </button>
      </div>
      {前置块展开 && (
        // ⚠️ **受控**输入框（`value` 绑在 `前置块内文` 上）：编辑器规范化过
        // 的结果（末尾空行收掉一个）要能回填到框里，否则用户看到的与盘上的
        // 差一行。回声识别在 [`提交`] 与那个基准 ref 里。
        // ⚠️ 打字**当场**提交，不按回车也不失焦才提交：关了标签页/切了文档
        // 就跑掉的那一笔，是最难查的一类丢字。
        <textarea
          ref={前置块框Ref}
          className="editor-frontmatter-text"
          value={前置块内文}
          spellCheck={false}
          rows={Math.min(12, Math.max(2, 前置块内文.split("\n").length + 1))}
          onChange={(e) => {
            set前置块内文(e.target.value);
            提交(e.target.value);
          }}
          onKeyDown={(e) => {
            // Esc 合上（不撤销——每一笔都已经进去了）。⚠️ 只在这里拦 Esc：
            // 这个框是 `textarea`，别指望外层的快捷键还会轮到它。
            if (e.key === "Escape") {
              e.preventDefault();
              合上框();
            }
          }}
        />
      )}
      <div className="editor-frontmatter-hint">
        {前置块展开
          ? t(
              "Kept as-is at the very top of the file, outside the text you edit below — clearing this box will not delete it.",
            )
          : t(
              "The lines wrapped in `---` at the top of the file. They are not part of the text below, and they are kept as-is when you save.",
            )}
      </div>
    </div>
  );
}
