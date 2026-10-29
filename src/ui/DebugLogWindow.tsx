/**
 * 原始终端式调试日志窗口。
 *
 * 这是有意与产品界面割裂的诊断页面：固定英文、固定黑底等宽样式，不跟随界面
 * 或文档主题，也不进入翻译表。它约每 400ms 拉一次后端日志增量并跟随滚动。
 */

import { useEffect, useRef, useState } from "react";

import { api } from "@/bridge/ipc";
import { formatDiagnosticText } from "@/ui/diagnostics-text";

export function DebugLogWindow() {
  const [text, setText] = useState("Connecting to debug log…\n");
  const [status, setStatus] = useState("");
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [view, setView] = useState<"log" | "diagnostics">("log");
  const offset = useRef(0);
  const terminal = useRef<HTMLPreElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    let alive = true;
    let running = false;
    const read = async () => {
      if (running) return;
      running = true;
      try {
        const chunk = await api.debugLog.read(offset.current);
        if (!alive) return;
        offset.current = chunk.offset;
        if (chunk.text) {
          setText((current) =>
            (chunk.reset ? "" : current === "Connecting to debug log…\n" ? "" : current) + chunk.text,
          );
        } else if (chunk.reset && offset.current === 0) {
          setText("");
        }
      } catch (e) {
        if (alive) setStatus(String(e));
      } finally {
        running = false;
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 400);
    document.documentElement.dataset.booted = "true";
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const pre = terminal.current;
    if (pre && follow.current) pre.scrollTop = pre.scrollHeight;
  }, [text]);

  const copy = async () => {
    try {
      await copyText(text);
      setStatus("Copied complete log.");
    } catch (e) {
      setStatus(String(e));
    }
  };

  const exportLog = async () => {
    try {
      const { save: saveDialog } = await import("@/ui/file-picker");
      const path = await saveDialog({
        title: "Export debug log",
        defaultPath: `nota-debug-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        filters: [{ name: "Log", extensions: ["log"] }],
      });
      if (!path) return;
      const written = await api.export.write(path, text);
      setStatus(`Saved ${written}`);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const showDiagnostics = async () => {
    if (view === "diagnostics") {
      setView("log");
      requestAnimationFrame(() => {
        const pre = terminal.current;
        if (pre) pre.scrollTop = pre.scrollHeight;
      });
      return;
    }
    setView("diagnostics");
    setDiagnosticsError(null);
    setStatus("Collecting diagnostics…");
    try {
      const info = await api.diagnostics.collect();
      setDiagnostics(formatDiagnosticText(info, navigator.userAgent));
      setStatus("Diagnostics snapshot captured.");
    } catch (e) {
      setDiagnosticsError(String(e));
      setStatus("Could not collect diagnostics.");
    }
  };

  return (
    <main className="raw-debug-log">
      <header className="raw-debug-bar">
        <strong>RAW DEBUG LOG</strong>
        <button type="button" onClick={() => void showDiagnostics()}>
          {view === "log" ? "SHOW DIAGNOSTICS" : "SHOW LOG"}
        </button>
        <span className="raw-debug-actions">
          <button type="button" onClick={() => void copy()}>
            COPY ALL
          </button>
          <button type="button" onClick={() => void exportLog()}>
            EXPORT .LOG
          </button>
        </span>
      </header>
      {view === "log" ? (
        <pre
          ref={terminal}
          onScroll={(event) => {
            const el = event.currentTarget;
            follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
          }}
        >
          {text || "No debug log entries yet. Reproduce the issue and keep this window open.\n"}
        </pre>
      ) : (
        <section className="raw-debug-diagnostics" aria-label="System diagnostics">
          <pre>
            {diagnosticsError
              ? `DIAGNOSTICS ERROR\n\n${diagnosticsError}\n`
              : diagnostics ?? "Collecting diagnostics…\n"}
          </pre>
        </section>
      )}
      <footer className="raw-debug-status">{status || "Following log…"}</footer>
    </main>
  );
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Auxiliary WebViews may reject the async API; use the selection fallback.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("clipboard write was rejected");
}
