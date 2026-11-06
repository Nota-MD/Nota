import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(repo, "e2e", "dist");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
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
  throw new Error("Chrome/Chromium was not found; set CHROME_BIN to run browser E2E tests");
}

function build() {
  const tsc = join(repo, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const checked = spawnSync(tsc, ["--noEmit", "-p", "e2e/tsconfig.json"], {
    cwd: repo,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (checked.status !== 0) process.exit(checked.status ?? 1);

  const vite = join(repo, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const result = spawnSync(vite, ["build", "--config", "e2e/vite.config.ts", "--logLevel", "warn"], {
    cwd: repo,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function staticFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0] || "/");
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const candidate = resolve(dist, normalize(relative));
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) return null;
  try {
    if (!(await stat(candidate)).isFile()) return null;
    return candidate;
  } catch {
    return null;
  }
}

async function serve() {
  const server = createServer(async (request, response) => {
    const path = await staticFile(request.url ?? "/");
    if (!path) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
    });
    response.end(body);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("static server did not return a TCP port");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function freePort() {
  const server = createTcpServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not allocate a debug port");
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  return address.port;
}

async function pageSocket(port) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome has not opened its debugging endpoint yet.
    }
    if (Date.now() > deadline) throw new Error("Chrome DevTools endpoint did not become ready");
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

async function cdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed to open")), { once: true });
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
  const deadline = Date.now() + 90_000;
  let handledNativeKey = "";
  for (;;) {
    const evaluated = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const report = document.querySelector("#nota-e2e-report");
        if (!report) return null;
        return {
          status: report.dataset.status || "",
          count: Number(report.dataset.count || "0"),
          report: report.dataset.report || "",
          text: report.textContent || "",
          nativeKey: document.documentElement.dataset.e2eNativeKey || ""
        };
      })()`,
      returnByValue: true,
    });
    const state = evaluated.result?.value;
    if (state?.nativeKey && state.nativeKey !== handledNativeKey) {
      handledNativeKey = state.nativeKey;
      const isSpace = state.nativeKey.startsWith("space");
      const isTab = state.nativeKey.startsWith("tab");
      const isText = state.nativeKey.startsWith("text-");
      const isArrowLeft = state.nativeKey.startsWith("arrow-left");
      const isArrowRight = state.nativeKey.startsWith("arrow-right");
      const isArrowUp = state.nativeKey.startsWith("arrow-up");
      const isArrowDown = state.nativeKey.startsWith("arrow-down");
      const isBackspace = state.nativeKey.startsWith("backspace");
      const isDelete = state.nativeKey === "delete";
      const isCtrlA = state.nativeKey === "ctrl-a";
      const isCtrlB = state.nativeKey === "ctrl-b";
      const parameters =
        isSpace
          ? {
              type: "keyDown",
              key: " ",
              code: "Space",
              text: " ",
              unmodifiedText: " ",
              windowsVirtualKeyCode: 32,
              nativeVirtualKeyCode: 32,
            }
          : isTab
            ? {
                type: "rawKeyDown",
                key: "Tab",
                code: "Tab",
                windowsVirtualKeyCode: 9,
                nativeVirtualKeyCode: 9,
              }
            : isText
              ? {
                  type: "keyDown",
                  key: state.nativeKey.slice(5),
                  code:
                    state.nativeKey.slice(5) === "\\"
                      ? "Backslash"
                      : `Key${state.nativeKey.slice(5).toUpperCase()}`,
                  text: state.nativeKey.slice(5),
                  unmodifiedText: state.nativeKey.slice(5),
                }
              : isArrowLeft
                ? {
                    type: "rawKeyDown",
                    key: "ArrowLeft",
                    code: "ArrowLeft",
                    windowsVirtualKeyCode: 37,
                    nativeVirtualKeyCode: 37,
                  }
                : isArrowRight
                  ? {
                      type: "rawKeyDown",
                      key: "ArrowRight",
                      code: "ArrowRight",
                      windowsVirtualKeyCode: 39,
                      nativeVirtualKeyCode: 39,
                    }
                  : isArrowUp
                    ? {
                        type: "rawKeyDown",
                        key: "ArrowUp",
                        code: "ArrowUp",
                        windowsVirtualKeyCode: 38,
                        nativeVirtualKeyCode: 38,
                      }
                    : isArrowDown
                      ? {
                          type: "rawKeyDown",
                          key: "ArrowDown",
                          code: "ArrowDown",
                          windowsVirtualKeyCode: 40,
                          nativeVirtualKeyCode: 40,
                        }
                  : isBackspace
                    ? {
                        type: "rawKeyDown",
                        key: "Backspace",
                        code: "Backspace",
                        windowsVirtualKeyCode: 8,
                        nativeVirtualKeyCode: 8,
                      }
                    : isDelete
                      ? {
                          type: "rawKeyDown",
                          key: "Delete",
                          code: "Delete",
                          windowsVirtualKeyCode: 46,
                          nativeVirtualKeyCode: 46,
                        }
                      : isCtrlA
                        ? {
                            type: "rawKeyDown",
                            key: "a",
                            code: "KeyA",
                            windowsVirtualKeyCode: 65,
                            nativeVirtualKeyCode: 65,
                            modifiers: 2,
                          }
                      : isCtrlB
                        ? {
                            type: "rawKeyDown",
                            key: "b",
                            code: "KeyB",
                            windowsVirtualKeyCode: 66,
                            nativeVirtualKeyCode: 66,
                            modifiers: 2,
                          }
              : null;
      if (!parameters) throw new Error(`Unknown native E2E key request: ${state.nativeKey}`);
      await client.send("Input.dispatchKeyEvent", parameters);
      await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: parameters.key,
        code: parameters.code,
        windowsVirtualKeyCode: parameters.windowsVirtualKeyCode,
        nativeVirtualKeyCode: parameters.nativeVirtualKeyCode,
      });
      await client.send("Runtime.evaluate", {
        expression: `window.__notaE2E?.signalNativeKey(${JSON.stringify(state.nativeKey)})`,
      });
    } else if (!state?.nativeKey) {
      handledNativeKey = "";
    }
    if (state?.status === "passed" || state?.status === "failed") {
      if (!state.report) throw new Error(`E2E page failed before producing structured results: ${state.text}`);
      return {
        status: state.status,
        count: state.count,
        results: JSON.parse(Buffer.from(state.report, "base64").toString("utf8")),
      };
    }
    if (Date.now() > deadline) throw new Error(`E2E page did not finish: ${state?.text ?? "no report node"}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
}

async function main() {
  build();
  const chrome = findChrome();
  const profile = await mkdtemp(join(tmpdir(), "nota-e2e-chrome."));
  const { server, url } = await serve();
  const targetUrl = process.env.NOTA_E2E_ONLY
    ? `${url}?only=${encodeURIComponent(process.env.NOTA_E2E_ONLY)}`
    : url;
  const debugPort = await freePort();
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      `--remote-debugging-port=${debugPort}`,
      "--remote-debugging-address=127.0.0.1",
      "--window-size=1200,900",
      `--user-data-dir=${profile}`,
      targetUrl,
    ],
    { cwd: repo, stdio: "ignore" },
  );
  let client;
  try {
    client = await cdpClient(await pageSocket(debugPort));
    await client.send("Runtime.enable");
    const report = await waitForReport(client);
    for (const result of report.results) {
      console.log(`${result.passed ? "✔" : "✘"} ${result.name}`);
      if (!result.passed) console.log(`  ${result.detail.replace(/\n/g, "\n  ")}`);
    }
    console.log(`Browser E2E: ${report.count - report.results.filter((item) => !item.passed).length}/${report.count} passed`);
    if (report.status !== "passed") process.exitCode = 1;
  } finally {
    client?.close();
    browser.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (browser.exitCode !== null) return resolveExit();
      browser.once("exit", () => resolveExit());
      setTimeout(resolveExit, 3000);
    });
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
