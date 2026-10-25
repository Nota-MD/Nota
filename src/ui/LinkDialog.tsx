/**
 * 「链接」那个框（两个字段：**链接显示名称** ＋ **链接内容**）。
 * `docs/07` 第 96 ＋ 102 项，2026-10-07。
 *
 * # 为什么不是 `PromptDialog`（它明明有两个字段）
 *
 * 那个框的"主字段"是**第一个**（清空它 = 取消），而链接的主字段是**第二个**
 * （地址）——「显示名称」空着是**正常**的（会用地址顶上），地址空着才是"这条链接
 * 没有意义"。这一条正好是反的，硬塞进 `PromptDialog` 就得把它的判据翻过来，
 * 而那一份是给"重命名 / 插件密钥"用的，不是一个可以随手改口径的地方。
 *
 * 另外这一份还多一颗**「去掉链接」**（只在"本来就在一条链接上"时画），
 * 那是第三条路（不写新的、也不取消），`PromptDialog` 的返回值放不下。
 *
 * # 规矩与另外三个自绘框逐字一致
 *
 * 遮罩 `mousedown` ＝ 取消、`Esc` ＝ 取消、**第一个框自动聚焦**、
 * **主字段（地址）清空 ＝ 取消**（一个 `[]()` 在正文里看不出坏、也点不开，
 * 而用户会以为是自己哪一步做错了）。两边各写一套的下场是同一个应用里三个长得
 * 一样的框有三套手感。
 *
 * ⚠️ **它自己不碰编辑器**：只把"名称 ＋ 地址"或"去掉"交回去，往哪儿写、怎么写
 * 全在 `editor/link-edit.ts`（与 `ImageDialog` 同一条口径：框只管问）。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { LinkAnswer, LinkRequest } from "@/ui/useDialogs";

export function LinkDialog({
  request,
  onAnswer,
}: {
  request: LinkRequest;
  onAnswer: (answer: LinkAnswer | null) => void;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const [name, setName] = useState(request.label);
  const [address, setAddress] = useState(request.href);
  const nameBox = useRef<HTMLInputElement>(null);

  // ⚠️ 聚焦**第一个**框（「链接显示名称」）而不是主字段：那两个框是照着用户
  // 说的次序摆的（先名字后地址），光标落在第一个才顺——地址那一格按 `Tab`
  // 就过去了。⚠️ 与 `PromptDialog` 那条"全选已有的值"同一条口径：这两个框
  // 打开时里面都是**已有的那一条**，用户多半是想改一个词，全选之后直接打字
  // 就是换掉；不全选得先自己全选一次。
  useEffect(() => {
    nameBox.current?.focus();
    nameBox.current?.select();
  }, []);

  // ⚠️ **主字段为空 = 当作取消**：地址空了，这条链接落下去就是一条点不动的
  // 东西（与 `ImageDialog` / `PromptDialog` 同一条口径）。
  const raiseHandoff = () => {
    const a = address.trim();
    if (a === "") return onAnswer(null);
    onAnswer({ kind: "set", label: name, href: a });
  };

  const returnCarOrBackOutput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      raiseHandoff();
    } else if (e.key === "Escape") {
      // ⚠️ 收在**输入框自己**身上、不绑 `window`：输入框里按 `Esc` 首先是
      // "把输入法候选框收掉"，绑到 window 上抢会把那一下吃掉（同 `PromptDialog`）。
      e.preventDefault();
      onAnswer(null);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Link")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Link")}</h2>

        <label className="prompt-label" htmlFor="nota-link-label">
          {t("Link display name")}
        </label>
        <input
          id="nota-link-label"
          ref={nameBox}
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={name}
          placeholder={t("Shown in the document")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />

        <label className="prompt-label" htmlFor="nota-link-href">
          {t("Link URL")}
        </label>
        <input
          id="nota-link-href"
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={address}
          placeholder={t("https://example.com, or #anchor-on-this-page")}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />

        <div className="confirm-actions">
          {/* 「去掉链接」= **第三条路**（文字留着、标记摘掉）。⚠️ 只在编辑已有
              链接时画：新建那一路没有"去掉"可言（这一条是第 96 项里
              「再点一次＝去掉链接」那条能力的新家）。
              ⚠️ 它排在**最左**（取消与确定都在它的右边）：不是"主按钮"，
              也不该挨着用户按确定的那根手指。⚠️ 配色照旧不设 `btn-danger`
              ——它**不会丢字**（只摘标记），红按钮留给真的会丢东西的那类。 */}
          {request.editing && (
            <button
              type="button"
              className="btn"
              onClick={() => onAnswer({ kind: "remove" })}
            >
              {t("Remove Link")}
            </button>
          )}
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={raiseHandoff}>
            {request.editing ? t("OK") : t("Insert")}
          </button>
        </div>
      </div>
    </div>
  );
}
