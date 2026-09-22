/**
 * 全局错误兜底。
 *
 * 前端崩掉的默认表现是**白屏**——用户看到一片白，既不知道出了什么事，
 * 也没法把信息交给我们。这里做两件事：
 * 1. React 渲染期抛错 → 显示一屏能读的错误，而不是白屏；
 * 2. 未捕获的 Promise 拒绝 / 全局错误 → 打到控制台（打包后仍走 journal，
 *    用户可以 `journalctl` 捞到）。
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

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
        <h1>界面出了点问题</h1>
        <p className="crash-lead">
          你正在编辑的内容还在后端存着，没有丢。可以先把下面这段信息记下来，
          然后重启 Nota。
        </p>
        <pre className="crash-detail">
          {error.message}
          {info?.componentStack ? `\n\n组件栈：${info.componentStack}` : ""}
        </pre>
        <button
          type="button"
          className="btn"
          onClick={() => this.setState({ error: null, info: null })}
        >
          试着继续
        </button>
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
