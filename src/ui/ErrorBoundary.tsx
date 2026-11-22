









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









export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {

    console.error("[nota] Render failed:", error, info.componentStack);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <h1>{t("Something went wrong in the interface")}</h1>
        <p className="crash-lead">
          {

                             }
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


export function installErrorHooks() {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[nota] Unhandled promise rejection:", e.reason);
  });
  window.addEventListener("error", (e) => {
    console.error("[nota] Unhandled error:", e.error ?? e.message);
  });
}
