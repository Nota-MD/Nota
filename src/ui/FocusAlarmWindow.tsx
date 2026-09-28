/**
 * 强制专注的**警报窗**：一整块红屏 + 一句「立刻回来写作」+ 一颗按钮。
 *
 * # 它是另一个窗口，不是主窗里的一层
 *
 * 这个组件跑在一个**独立的、置顶的、全屏的**系统窗口里（宿主建的那个，
 * `focus/alarm.rs::开窗`）。原因写在那边文件头：警报响的时候用户已经切走了，
 * 盖在主窗里的红布他根本看不见。所以这里的样式要按"整块屏幕"来写，
 * 不能借主窗那套 `.app-shell` 的布局。
 *
 * ⚠️ **它不在 `App.tsx` 那棵树里**。`main.tsx` 按 `location.hash` 分叉，
 * `#focus-alarm` 走这里，别的走 `<App />`。所以：
 *
 * - 这里**不要**取任何文档 / 插件 / 设置状态——那个窗口里根本没有编辑器；
 * - 这里**不要**挂 [`useFocusAlarmSound`](useFocusAlarmSound)：
 *   宿主那一枪 `emit` 是发给所有窗口的，两边都订阅就是同一段警报响两遍。
 *
 * # 唯一的出口就是"我回来了"
 *
 * ⚠️ 用户原话是「红色大型弹窗顶置内容为立刻回来写作」。它**故意不留**
 * "稍后再说 / 最小化 / 关闭"——留一个就等于留一个后门，而这个功能要求的是
 * 用户自己认账。窗口连标题栏都没有（`.decorations(false)`），没有叉可点。
 *
 * ⚠️ 但 **Alt+F4 是留着的**，而且是**必须留着**：一个抢焦点、置顶、全屏、
 * 关不掉的窗口是恶意软件的行为，不是自律工具。用户真按了也算数
 * （`lib.rs` 的 `Destroyed` 分派会调 `确认`），代价是他这一轮白专注了。
 * Esc 等价于点那颗按钮——**它不是后门**，它走的是同一条 `ack`。
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n";
import { useForceFocus } from "@/ui/useForceFocus";

export function FocusAlarmWindow() {
  const t = useT();
  const { state, ack } = useForceFocus();
  // ⚠️ 点过之后就把按钮锁住。宿主那边的阶段要**下一拍**才翻过来（最多 1 秒），
  // 这中间按钮还是活的——不锁的话用户会连点，而连点几下就是几条命令。
  const [按过了, set按过了] = useState(false);

  // Esc = 点那颗按钮（同一条 ack，不是绕过）。理由写在文件头。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        set按过了(true);
        void ack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ack]);

  // ⚠️ 阶段已经不是警报了（用户在别处点了停止、或者宿主自己收了）——
  // 这个窗**等着宿主来关**（`alarm.rs::关窗` 由计时线程按阶段对账）。
  // 这里什么都不做，尤其**不要**自己 `close()`：那会让"谁负责关窗"变成两处。
  const 第几次 = state?.alarms ?? 0;

  return (
    <div className="alarm-root">
      <div className="alarm-card">
        {/* ⚠️ 这句的原文就是英语（用户要的就是英文那句，翻译只是"允许"）：
            2026-09-28 翻转**之前**它是先写中文、英文表里给 `Back to Writing`，
            现在英语是原文，所以它的中文在 `zh-ui.ts` 里。这句是全屏上唯一的大字，别加修饰。 */}
        <h1 className="alarm-title">{t("Back to Writing")}</h1>

        <p className="alarm-sub">
          {第几次 > 1
            ? t("This is alarm {0} of this session.", 第几次)
            : t("The account balance has been charged to zero.")}
        </p>

        {/* ⚠️ 这一行说"钱怎么回来"，因为这是用户此刻唯一会问的问题：
            点了按钮余额是不是就补满了？答案是**不补**（`focus::确认` 的文档）。
            不写清楚的话，他点一下发现余额还是 0，会以为这软件算错了。 */}
        <p className="alarm-hint">
          {t("Press the button below to go back to writing; the balance starts again from zero.")}
        </p>

        <button
          type="button"
          className="btn alarm-btn"
          disabled={按过了}
          onClick={() => {
            set按过了(true);
            void ack();
          }}
        >
          {按过了 ? t("Going back…") : t("I'm Back")}
        </button>
      </div>
    </div>
  );
}
