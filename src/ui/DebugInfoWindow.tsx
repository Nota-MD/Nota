/**
 * 独立窗口里的运行诊断信息。
 *
 * 它只服务「高级设置 → 在新窗口显示调试信息」这一条，不挂编辑器、插件面板
 * 或应用主状态。窗口属于同一个进程，所以拿到的 `nota_diagnostics` 与主窗口
 * 一致。
 */

import { useEffect, useState } from "react";

import { api, type Diagnostics } from "@/bridge/ipc";
import { applyTheme } from "@/styles/applyTheme";

export function DebugInfoWindow() {
  const [诊断, 设诊断] = useState<Diagnostics | null>(null);
  const [错误, 设错误] = useState<string | null>(null);

  useEffect(() => {
    let 还在 = true;
    void (async () => {
      try {
        const [设置, 信息] = await Promise.all([api.settings.get(), api.diagnostics.collect()]);
        if (!还在) return;
        applyTheme(设置);
        设诊断(信息);
        document.documentElement.dataset.booted = "true";
      } catch (e) {
        if (还在) {
          设错误(String(e));
          document.documentElement.dataset.booted = "true";
        }
      }
    })();
    return () => {
      还在 = false;
    };
  }, []);

  if (错误) return <main className="debug-window"><p className="about-err">{错误}</p></main>;

  const 行: readonly (readonly [string, string])[] = 诊断
    ? [
        ["Package version", 诊断.version],
        ["Build time", new Date(诊断.build_time * 1000).toLocaleString("en-GB")],
        ["Build host", 诊断.build_host],
        ["Build platform", 诊断.build_platform],
        ["Target triple", 诊断.target],
        ["Build profile", 诊断.profile],
        ["rustc", 诊断.rustc],
        ["cargo", 诊断.cargo],
        ["node", 诊断.node],
        ["npm", 诊断.npm],
        ["tauri", 诊断.tauri],
        ["webkit2gtk", 诊断.webkit_crate],
        ["gtk", 诊断.gtk_crate],
        ["mlua", 诊断.mlua],
        ["Operating system", 诊断.os_pretty],
        ["Kernel", 诊断.kernel],
        ["Architecture", 诊断.arch],
        ["GTK version", 诊断.gtk_runtime],
        ["WebKitGTK version", 诊断.webkit_runtime],
      ]
    : [];

  return (
    <main className="debug-window">
      <h1>Debug information</h1>
      {!诊断 ? (
        <p>Collecting diagnostics…</p>
      ) : (
        <table className="about-table debug-table">
          <tbody>
            {行.map(([名称, 值]) => (
              <tr key={名称}>
                <th scope="row">{名称}</th>
                <td>{值 || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
