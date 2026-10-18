/**
 * 自己画的**单行输入框**。
 *
 * # 为什么不用 `window.prompt`
 *
 * 和 `ConfirmDialog.tsx` 不用 `window.confirm` 是**同一个理由，而且更硬**：
 * `prompt` 不只是阻塞 WebView，它在 WebKitGTK 上**默认被关掉**
 * （`webkit_settings_set_enable_...`，Tauri 没开），调用的结果是**静默返回 null**。
 * 也就是说，写成 `window.prompt(...)` 的话，「格式 → 超链接」点下去会
 * **什么都不发生**——不报错、不弹框，看起来就是那个菜单项坏了。
 * 这个仓库里"点了没反应"式的失效已经记过好几条（`docs/07`），不再添一条。
 *
 * # 用法
 *
 * 组件只认"现在要不要显示、显示什么"和"用户回答了没有"，**不认识谁在等答案**。
 * 包成 Promise 的活在 `App.tsx` 里做（那边才有状态），和 `ConfirmDialog` 一致。
 *
 * ⚠️ 按钮顺序、Esc = 取消、点遮罩 = 取消，三条都跟确认框**保持一致**：
 * 同一个应用里两个长得一样的框，行为不该有两套。
 */

import { useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";

interface Props {
  title: string;
  /** 输入框**上面**那行说明。写清楚"这个框要的是什么"。 */
  label: string;
  /** 打开时就填好的值（编辑已有链接时用）。 */
  initial?: string;
  placeholder?: string;
  /** 确认按钮上的字。默认「确定」。 */
  confirmLabel?: string;
  /**
   * 主输入框**下面**那行小字。给「图片」用——它有两个字段（地址、替代文字），
   * 第二个字段没法再开一行，就挤在这里当可选的补充。
   */
  hint?: string;
  /** 有第二个字段时，它是这个。给了才显示第二行输入框。 */
  secondLabel?: string;
  secondInitial?: string;
  secondPlaceholder?: string;
  /**
   * 把主输入框画成密码框（圆点）。给插件面板要密钥的场合用。
   *
   * ⚠️ 遮的只是**屏幕**：值本身照旧原样交出去、原样存进插件设置文件
   * （明文，见 `lua/api/settings.rs` 顶上那段）。这一条不是为了"加密"，
   * 是为了避免旁人看到 key。
   */
  secret?: boolean;
  /** 用户回答。取消给 `null`，确定给 `[主值, 次值]`（次值可能是空串）。 */
  onAnswer: (value: string | null, second?: string) => void;
}

export function PromptDialog({
  title,
  label,
  initial = "",
  placeholder,
  confirmLabel,
  hint,
  secondLabel,
  secondInitial = "",
  secondPlaceholder,
  secret = false,
  onAnswer,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  // ⚠️ `title` / `label` / `placeholder` / `hint` 那几样是**调用方翻好传进来的**，
  // 这里一概不碰（它们已经是那句话本身了）。
  const t = useT();
  const [value, setValue] = useState(initial);
  const [second, setSecond] = useState(secondInitial);
  const inputRef = useRef<HTMLInputElement>(null);
  // ⚠️ 第 50 项（2026-10-04）：焦点陷阱的落点。框必须自己能接焦点
  // （`tabIndex={-1}`），`useModalTrap` 的 `focusin` 兜底把跑出去的焦点拉到它上面。
  const dialogRef = useRef<HTMLDivElement>(null);

  // 打开就把光标放进输入框，并且**全选已有的值**——这一条是编辑已有链接时的
  // 关键：用户按 Ctrl+K 多半是想把地址换掉，全选之后直接打字就替换了；
  // 不选中的话得先手动全选一次，那是多余的一步。
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // 焦点陷阱走共用钩子（第 50 项）。⚠️ Esc 在钩子里也有一条（组字期间不接，
  // 见那边文件头），**这不是**把下面"Esc 绑输入框"那条作废：
  // - 组字期间按 Esc：钩子不接、输入法收候选框——这一条正是当初不绑 window 的理由；
  // - 焦点在按钮上按 Esc：输入框的 onKeyDown 接不到（焦点不在它身上），
  //   钩子这条补的就是这个洞。
  // 两处都通到 `onAnswer(null)`，重复调用是幂等的（`useDialogs` 那边就是
  // 一次 `resolve`，第二次是空操作）。
  useModalTrap(dialogRef, { onEscape: () => onAnswer(null) });

  // ⚠️ Enter 用 `onKeyDown` 收在**输入框自己**身上，**不绑 window**。
  // 跟 `ConfirmDialog` 那里不一样：那边没有输入控件，绑 window 是为了兜住
  // "焦点还没落进来"。这里有输入框，而输入框里按 Esc **应该是**
  // "把输入法候选框收掉"——绑到 window 上抢 `keydown` 会把那一下吃掉，
  // 中文用户按 Esc 想取消选字，结果整个框没了。所以只接冒泡到输入框的那次。
  // ⚠️ **主字段为空 = 当作取消**，不是"插一个空地址的链接"。
  // 一个 `[文字]()` 在正文里看不出坏、点上去没反应，而用户会以为是自己
  // 哪一步做错了——不如干脆什么都不做。空地址的链接**没有任何用处**，
  // 而"改主意了、把框清空再点确定"是个很自然的取消方式。
  const submit = () => onAnswer(value.trim() === "" ? null : value, second);

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        ref={dialogRef}
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{title}</h2>
        <label className="prompt-label" htmlFor="nota-prompt-main">
          {label}
        </label>
        <input
          id="nota-prompt-main"
          ref={inputRef}
          className="prompt-input"
          // ⚠️ `type="password"` 只遮屏幕，值不变（见 `secret` 的注释）。
          // `autoComplete="off"` 是必须的：WebView 的密码管理器会跳出来问
          // "要不要记住"，而这里填的是**API key**，不是登录密码——
          // 那个弹窗一出现，用户就得先弄明白"这算不算账号密码"。
          type={secret ? "password" : "text"}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onAnswer(null);
            }
          }}
        />
        {secondLabel && (
          <>
            <label className="prompt-label" htmlFor="nota-prompt-second">
              {secondLabel}
            </label>
            <input
              id="nota-prompt-second"
              className="prompt-input"
              type="text"
              value={second}
              placeholder={secondPlaceholder}
              spellCheck={false}
              onChange={(e) => setSecond(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onAnswer(null);
                }
              }}
            />
          </>
        )}
        {hint && <p className="prompt-hint">{hint}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {confirmLabel ?? t("OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
