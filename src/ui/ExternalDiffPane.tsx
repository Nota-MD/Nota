/**
 * **磁盘上的改动**：外部改动提示条上点「查看修改」之后，在编辑区里摊开的那份对照。
 *
 * 用户 2026-09-26 点的那一条（「查看修改（用 diff）」）。摊开的**位置**不是新
 * 挑的——用户 2026-09-25 已经把"diff 要摊在哪儿"说过一遍了：「要求允许直接在
 * Markdown 编辑区域进行预览」；同一天 git 插件那块也说过「是直接在预览区域
 * 提供预览…在编辑区域预览」。所以这里跟插件面板走**同一块地方**
 *（`.review-pane`，样式在 `styles/review.css`），不是另开一个界面。
 *
 * # ⚠️ 它是**只读**的，而且**故意不画按钮**
 *
 * 插件那份改动预览（`nota.ui.review_diff`）带「接受 / 放弃」，因为那是
 * **AI 提的改动**、要用户拍板。这一份不是：磁盘上那份文件**已经改完了**，
 * 没有人等着用户批准。他能做的只有两件事，都在上面那条提示条上——
 * 「忽略」（继续编辑，下次保存覆盖）和「重新载入」（改成磁盘那份）。
 * 所以这块对照里**一个可点的东西都没有**，看完点「回到正文」就完了。
 *
 * ⚠️ 这条分工不是洁癖：把「接受」摆在这儿，用户会以为点了就能把磁盘那份
 * 拉进来——而"拉进来"就是「重新载入」，那条路上有未保存确认；从这里再走一遍
 * 就是**绕过那道确认框**。两个入口、一个带保险一个不带，迟早有人走错那个。
 *
 * # 内容块的渲染**复用** `PanelBody`
 *
 * `kind = "diff"` 那一种块的画法（行首 `+/-/空格`、三种颜色、删除线/下划线）
 * 只有一份实现，右边栏的插件面板、编辑区里的插件面板、这里用的都是它。
 * 自己再画一遍的话，两处迟早不一样，而不一样的那个是"红绿色觉障碍的用户
 * 读不出这行是删的还是加的"。
 */

import { useT } from "@/i18n";
import { PanelBody } from "@/ui/PanelBody";
import type { PanelNode } from "@/ui/panel-nodes";
import type { ExternalPartCorrectAccording } from "@/ui/useExternalChanges";

interface Props {
  correctAccording: ExternalPartCorrectAccording;
  /** 用户按了「回到正文」。**只收这一块，不碰文档**。 */
  onClose: () => void;
}

/** 这份对照里唯一的一种内容块。**写死**：它的形状由这个组件决定，不来自插件。 */
const onlyHasDifferenceExceptionBlock = (
  line3: ExternalPartCorrectAccording["line3"],
): PanelNode[] => [{ kind: "diff", items: line3 }];

export function ExternalDiffPane({ correctAccording, onClose }: Props) {
  // ⚠️ 这一行不只是取值：它订阅了语言（宿主报来语言之后这一块要重画）。
  const t = useT();

  return (
    <div className="review-pane external-diff-pane">
      <div className="review-bar">
        <span className="review-title" title={correctAccording.title}>
          {t("Changes on disk")} · {correctAccording.title}
        </span>
        <span className="review-spacer" />
        <button
          type="button"
          className="btn review-back"
          onClick={onClose}
          title={t("Hide the comparison and go back to the document (the file on disk is left alone)")}
        >
          {t("Back to the document")}
        </button>
      </div>

      <div className="review-body">
        {correctAccording.line3.length === 0 ? (
          // ⚠️ 空差异**不是错误**，而且它是真会发生的：别人存了一份内容和我们
          // 手上一模一样的文件（或者我们刚存过、那边又原样写回）。这时候画一个
          // 空框子会让人以为界面上少了点东西，所以如实说一句。
          <p className="panel-empty">
            {t("The file on disk and the editor match.")}
          </p>
        ) : (
          <PanelBody
            // ⚠️ 下面这三个 props 对这份内容**到不了任何地方**：`PanelBody` 只在
            // 按钮（`kind = "buttons"`）和输入框（`kind = "input"`）上用到它们，
            // 而上面 `只有差异块` 写死了只给 `kind = "diff"`——那一种块是
            // **只画不点**的（见 `panel-nodes.ts` 里 `PanelNode` 那段）。
            //
            // 传空串而不是编一个插件 id（比如 `"nota.core"`）：真有个假 id 反而
            // 会让人以为"核心也是一个插件"（不是，见 `AGENTS.md` §1），也会让
            // 排查插件问题时多出这样一条查不到的东西。
            plugin=""
            nodes={onlyHasDifferenceExceptionBlock(correctAccording.line3)}
            onCall={async () => {}}
            askPrompt={async () => null}
            busy={null}
          />
        )}
      </div>
    </div>
  );
}
