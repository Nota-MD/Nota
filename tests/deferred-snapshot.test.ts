/**
 * 大文件源码输入的全文快照节奏。
 *
 * 这里不启动 CodeMirror：被测行为是“连续输入只读一次最新全文”。真实编辑器
 * 的文档保存由 CodeMirror 负责，本层不该在按键时复制它。
 */

import { createDeferredSnapshot } from "../src/editor/deferred-snapshot";
import { readFileSync } from "node:fs";

let failures = 0;
function check(ok: boolean, message: string) {
  if (ok) return;
  failures += 1;
  console.error("FAIL:", message);
}

function fakeClock() {
  let nextId = 1;
  const tasks = new Map<number, () => void>();
  return {
    setTimer(callback: () => void) {
      const id = nextId++;
      tasks.set(id, callback);
      return id;
    },
    clearTimer(id: number) {
      tasks.delete(id);
    },
    pending: () => tasks.size,
    fireAll() {
      const callbacks = [...tasks.values()];
      tasks.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

{
  const clock = fakeClock();
  let current = "v1";
  const delivered: string[] = [];
  const snapshot = createDeferredSnapshot({
    delayMs: 1000,
    read: () => current,
    deliver: (markdown) => delivered.push(markdown),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  current = "v2";
  snapshot.touch();
  current = "v3";
  snapshot.touch();
  current = "v4";
  check(clock.pending() === 1, "连续输入应只保留一个待执行定时器");
  clock.fireAll();
  check(delivered.length === 1 && delivered[0] === "v4", "去抖结束时应只读最新全文一次");
}

{
  const clock = fakeClock();
  let current: string | null = "ready";
  const delivered: string[] = [];
  const snapshot = createDeferredSnapshot({
    delayMs: 300,
    read: () => current,
    deliver: (markdown) => delivered.push(markdown),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  snapshot.touch();
  current = null;
  clock.fireAll();
  check(delivered.length === 0, "实例已拆时不应交付旧快照");

  current = "live";
  snapshot.touch();
  snapshot.cancel();
  clock.fireAll();
  check(delivered.length === 0 && clock.pending() === 0, "取消后必须清掉定时器");

  snapshot.touch();
  current = "flushed";
  snapshot.flush();
  check(delivered[0] === "flushed", "显式 flush 应立即读取当前全文");
}

{
  const source = readFileSync("src/editor/source.ts", "utf8");
  const pane = readFileSync("src/ui/EditorPane.tsx", "utf8");
  check(
    source.includes("if (onDocumentActivity) onDocumentActivity();\n      else onChange?.(u.state.doc.toString());"),
    "源码事务必须优先走轻量活动回调",
  );
  check(
    pane.includes("onDocumentActivity: recognizeSourceActivity"),
    "EditorPane 的源码分支必须接上轻量活动回调",
  );
  check(
    pane.includes("sourceSnapshot.cancel()"),
    "EditorPane 卸载时必须取消待执行全文快照",
  );
  check(
    pane.includes("createDeferredSnapshot") && pane.includes("read: () => handle?.getMarkdown() ?? null"),
    "源码全文必须在定时器到期后从当前实例读取",
  );
}

if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("deferred snapshot: 9 passed, 0 failed");
