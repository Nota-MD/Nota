import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(repo, "e2e", "dist");
const sizes = (process.env.PERF_SIZES || "50000,200000,1000000")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const focusMode = process.env.PERF_FOCUS !== "0";
const profile = process.env.PERF_PROFILE === "rich" ? "rich" : "mixed";
const markdownFile = process.env.PERF_MARKDOWN_FILE || "";
const openOnly = process.env.PERF_OPEN_ONLY === "1";
const cpuProfile = process.env.PERF_CPU_PROFILE === "1";
const diagnostics = process.env.PERF_DIAGNOSTICS === "1";
const viewportObservers = process.env.PERF_VIEWPORT_OBSERVERS !== "0";
const skippedObservers = process.env.PERF_SKIP_OBSERVERS || "";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function findChrome() {
  const requested = process.env.CHROME_BIN;
  const candidates = requested
    ? [requested]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const candidate of candidates) {
    const found = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (found.status === 0) return candidate;
  }
  throw new Error("Chrome/Chromium was not found; set CHROME_BIN");
}

function build() {
  const tsc = join(repo, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const checked = spawnSync(tsc, ["--noEmit", "-p", "e2e/tsconfig.json"], {
    cwd: repo,
    stdio: "inherit",
  });
  if (checked.status !== 0) process.exit(checked.status ?? 1);

  const vite = join(repo, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const built = spawnSync(
    vite,
    ["build", "--config", "e2e/vite.config.ts", "--logLevel", "warn"],
    { cwd: repo, stdio: "inherit" },
  );
  if (built.status !== 0) process.exit(built.status ?? 1);
}

async function staticFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0] || "/");
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const candidate = resolve(dist, normalize(relative));
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) return null;
  try {
    return (await stat(candidate)).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

async function serve() {
  const server = createServer(async (request, response) => {
    if (markdownFile && request.url === "/__perf-markdown") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/markdown; charset=utf-8",
      });
      response.end(await readFile(markdownFile));
      return;
    }
    const path = await staticFile(request.url ?? "/");
    if (!path) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
    });
    response.end(await readFile(path));
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("static server failed");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  if (!address || typeof address === "string") throw new Error("free port failed");
  return address.port;
}

async function pageSocket(port) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json(),
      );
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Browser is starting.
    }
    if (Date.now() > deadline) throw new Error("DevTools endpoint did not become ready");
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

async function cdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed")), {
      once: true,
    });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolveSend, reject) => {
        pending.set(id, { resolve: resolveSend, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function waitForReport(client) {
  const deadline = Date.now() + 600_000;
  for (;;) {
    const evaluated = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const node = document.querySelector("#nota-perf-result");
        return node ? {
          status: node.dataset.status || "",
          report: node.dataset.report || "",
          text: node.textContent || ""
        } : null;
      })()`,
      returnByValue: true,
    });
    const state = evaluated.result?.value;
    if (state?.status === "passed") return JSON.parse(state.report);
    if (state?.status === "failed") throw new Error(state.text);
    if (Date.now() > deadline) throw new Error(`benchmark timed out: ${state?.text ?? ""}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

async function main() {
  build();
  const chrome = findChrome();
  const profileDir = await mkdtemp(join(tmpdir(), "nota-perf-chrome."));
  const { server, url } = await serve();
  const port = await freePort();
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--window-size=1200,900",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    { cwd: repo, stdio: "ignore" },
  );
  let client;
  const reports = [];
  try {
    client = await cdpClient(await pageSocket(port));
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    if (cpuProfile) {
      await client.send("Profiler.enable");
      await client.send("Profiler.start");
    }
    for (const size of sizes) {
      const target = `${url}perf.html?size=${size}&focus=${focusMode ? 1 : 0}&profile=${profile}${markdownFile ? "&fixture=1" : ""}${openOnly ? "&openOnly=1" : ""}${diagnostics ? "&diag=1" : ""}${viewportObservers ? "" : "&observers=0"}${skippedObservers ? `&skip=${encodeURIComponent(skippedObservers)}` : ""}`;
      await client.send("Page.navigate", { url: target });
      const report = await waitForReport(client);
      if (cpuProfile) {
        const profile = await client.send("Profiler.stop");
        const profilePath =
          process.env.PERF_CPU_OUT ||
          join(tmpdir(), `nota-cpu-${Date.now()}.cpuprofile`);
        await writeFile(profilePath, JSON.stringify(profile.profile));
        console.log(`CPU profile: ${profilePath}`);
        if (size !== sizes.at(-1)) await client.send("Profiler.start");
      }
      reports.push(report);
      if (report.diagnostics) {
        const diag = report.diagnostics;
        console.log(
          [
            `mutation callbacks=${diag.mutationCallbacks}`,
            `records=${diag.mutationRecords}`,
            `first=${diag.firstMutationMs?.toFixed(1) ?? "n/a"}ms`,
            `last=${diag.lastMutationMs?.toFixed(1) ?? "n/a"}ms`,
            `intersection callbacks=${diag.intersectionCallbacks}`,
            `entries=${diag.intersectionEntries}`,
            `intersecting=${diag.intersectingEntries}`,
          ].join("  "),
        );
        for (const target of diag.mutationTargets.slice(0, 8)) {
          console.log(`  mutations ${target.records} ${target.target}`);
        }
      }
      for (const item of report.nodeBreakdown?.slice(0, 12) ?? []) {
        console.log(`  nodes ${String(item.count).padStart(6)} ${item.name}`);
      }
      console.log(
        [
          `size=${size}`,
          `profile=${report.profile}`,
          `open=${report.openMs.toFixed(1)}ms`,
          `start typing p50=${percentile(report.typingStartMs, 0.5).toFixed(2)}ms`,
          `typing p50=${percentile(report.typingMs, 0.5).toFixed(2)}ms`,
          `typing p95=${percentile(report.typingMs, 0.95).toFixed(2)}ms`,
          `typing frame p95=${percentile(report.typingFrameMs, 0.95).toFixed(2)}ms`,
          `scroll p95=${percentile(report.scrollFrameMs, 0.95).toFixed(1)}ms`,
          `scroll median=${percentile(report.scrollSweepFrameMs, 0.5).toFixed(1)}ms`,
          `formulas=${report.formulas}`,
          `rendered formulas=${report.renderedFormulas}`,
          `body formulas=${report.renderedBodyFormulas}`,
          `virtual=${report.virtualFormulas}`,
          `diagram SVG=${report.renderedDiagrams}`,
          `code editors=${report.codeEditors}`,
          `html ready=${report.renderedHtmlBlocks}/${report.htmlBlocks}`,
          `images=${report.loadedImages} loaded, ${report.pendingImages} pending`,
          `mermaid fences=${report.mermaidFences}`,
          `heap=${report.heapMb?.toFixed(1) ?? "n/a"}MB`,
        ].join("  "),
      );
      for (const stat of report.pluginMs.slice(0, 5)) {
        console.log(
          `  ${stat.name}: ${stat.totalMs.toFixed(2)}ms across ${stat.calls} calls`,
        );
      }
    }
    const output = process.env.PERF_OUT || join(tmpdir(), "nota-perf-report.json");
    await writeFile(output, `${JSON.stringify({ focusMode, profile, reports }, null, 2)}\n`);
    console.log(`Saved ${output}`);
  } finally {
    client?.close();
    browser.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (browser.exitCode !== null) return resolveExit();
      browser.once("exit", () => resolveExit());
      setTimeout(resolveExit, 3000);
    });
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
