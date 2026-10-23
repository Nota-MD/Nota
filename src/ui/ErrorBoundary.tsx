/**
 * 全局错误兜底。
 *
 * 前端崩掉的默认表现是**白屏**——用户看到一片白，既不知道出了什么事，
 * 也没法把信息交出来。这里做两件事：
 * 1. React 渲染期抛错 → 显示一屏能读的错误，而不是白屏；
 * 2. 未捕获的 Promise 拒绝 / 全局错误 → 打到控制台（打包后仍走 journal，
 *    用户可以 `journalctl` 捞到）。
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { api } from "@/bridge/ipc";
import { t } from "@/i18n";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * ⚠️ 下面用的是**模块级**那个 `t`（`import { t } from "@/i18n"`），不是 `useT()`：
 * 这是个**类组件**，拿不到 hook（`useT` 是 hook，只能在函数组件/hook 里调）。
 * 模块级那个读的是"此刻在说哪种语言"，所以宿主报来语言之后画的这一屏是对的；
 * 它**不订阅**，语言变了不会自己重画——而这份界面上换语言本来就要重启
 * （见 `i18n/index.ts` 顶上那段），这一屏又是崩溃时才出现的，所以不算缺口。
 * 同一个写法在先例里也有：`ui/nativeMenu.ts`、`ui/panel-nodes.ts` 那几处纯函数。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台那一份也要有，方便开发时直接看栈。
    console.error("[nota] 渲染出错：", error, info.componentStack);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h1>{t("Something went wrong in the interface")}</h1>
        <p className="crash-lead">
          {/* ⚠️ 这一条的键里**中间有一个空格**（「记下来，」与「然后重启」之间）——
              那是最初 JSX 换行渲染出来的那一个空格，原样带进键里，别在 `en.ts` 里
              抹掉（抹掉就成了废键）。 */}
          {t("What you were editing is still stored in the backend, so nothing is lost. Note down the information below, then restart Nota.")}
        </p>
        <pre className="crash-detail">
          {error.message}
          {info?.componentStack ? `\n\n${t("Component stack: {0}", info.componentStack)}` : ""}
        </pre>
        <div className="crash-actions">
          <button
            type="button"
            className="btn"
            onClick={() => this.setState({ error: null, info: null })}
          >
            {t("Try to Continue")}
          </button>
          <button type="button" className="btn" onClick={() => void api.window.quit()}>
            {t("Quit Nota")}
          </button>
        </div>
      </div>
    );
  }
}

/** 装上全局钩子。`main.tsx` 启动时调一次。 */
export function installErrorHooks() {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[nota] 未处理的 Promise 拒绝：", e.reason);
  });
  window.addEventListener("error", (e) => {
    console.error("[nota] 全局错误：", e.error ?? e.message);
  });
}
