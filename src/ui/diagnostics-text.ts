import type { Diagnostics } from "@/bridge/ipc";

/** 调试日志窗口里的系统诊断文本。固定英文，不进入翻译表。 */
export function formatDiagnosticText(
  diagnostics: Diagnostics,
  userAgent: string,
  generatedAt = new Date(),
): string {
  const windows = /Windows/i.test(userAgent);
  const linux = /Linux|X11/i.test(userAgent) && !windows;
  const webView2 = /(?:Edg|WebView2)\/([\d.]+)/i.exec(userAgent)?.[1] ?? "";
  const rows: [string, string][] = [
    ["Generated", generatedAt.toISOString()],
    ["Version", diagnostics.version],
    ["Build time", new Date(diagnostics.build_time * 1000).toISOString()],
    ["Build host", diagnostics.build_host],
    ["Build platform", diagnostics.build_platform],
    ["Target", diagnostics.target],
    ["Profile", diagnostics.profile],
    ["rustc", diagnostics.rustc],
    ["cargo", diagnostics.cargo],
    ["node", diagnostics.node],
    ["npm", diagnostics.npm],
    ["tauri", diagnostics.tauri],
    ["mlua", diagnostics.mlua],
    ["OS", diagnostics.os_pretty],
    ["Kernel", diagnostics.kernel],
    ["Architecture", diagnostics.arch],
    ...(linux
      ? ([
          ["GTK runtime", diagnostics.gtk_runtime],
          ["WebKitGTK runtime", diagnostics.webkit_runtime],
          ["GTK crate", diagnostics.gtk_crate],
          ["WebKitGTK crate", diagnostics.webkit_crate],
        ] as [string, string][])
      : []),
    ...(windows ? ([["WebView2", webView2]] as [string, string][]) : []),
    ["User agent", userAgent],
  ];
  return [
    "NOTA DIAGNOSTICS",
    "================",
    ...rows.map(([name, value]) => `${name.padEnd(22)} ${value || "—"}`),
    "",
  ].join("\n");
}
