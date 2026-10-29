/** 发行版 CSP 收紧后，运行时注入的主题样式必须继承页面 nonce。 */

import { replaceInlineStyle } from "../src/styles/inline-style";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

class FakeStyle {
  id = "";
  nonce = "";
  textContent = "";
  isConnected = false;

  constructor(private readonly lookup: Map<string, FakeStyle>) {}

  getAttribute(name: string): string | null {
    return name === "nonce" ? this.nonce || null : null;
  }

  remove(): void {
    this.isConnected = false;
    this.lookup.delete(this.id);
  }
}

function fakeDocument(initialNonce = "tauri-nonce") {
  const byId = new Map<string, FakeStyle>();
  const source = new FakeStyle(byId);
  source.nonce = initialNonce;
  source.isConnected = true;
  let created = 0;
  const doc = {
    querySelector: () => (initialNonce ? source : null),
    getElementById: (id: string) => byId.get(id) ?? null,
    createElement: () => {
      created++;
      return new FakeStyle(byId);
    },
    head: {
      appendChild: (el: FakeStyle) => {
        el.isConnected = true;
        byId.set(el.id, el);
        return el;
      },
    },
  };
  return {
    doc: doc as unknown as Document,
    byId,
    created: () => created,
  };
}

console.log("\n【运行时主题样式与 CSP nonce】");

testCase("新样式在插入前带上页面 nonce", () => {
  const { doc, byId, created } = fakeDocument();
  replaceInlineStyle("nota-doc-theme", ".editor-pane { --doc-bg: white; }", doc);
  const style = byId.get("nota-doc-theme");
  assertValue(style, "主题样式没有插入");
  assertValue(style.nonce === "tauri-nonce", "主题样式缺少 CSP nonce");
  assertValue(style.isConnected, "主题样式没有进入 head");
  assertValue(created() === 1, "新样式不应重复创建");
});

testCase("缺少 nonce 的旧样式会重建", () => {
  const { doc, byId, created } = fakeDocument();
  const stale = new FakeStyle(byId);
  stale.id = "nota-user-ui-style";
  stale.textContent = "old";
  stale.isConnected = true;
  byId.set(stale.id, stale);

  replaceInlineStyle(stale.id, "new", doc);
  const style = byId.get(stale.id);
  assertValue(style && style !== stale, "无 nonce 的样式没有被替换");
  assertValue(style.nonce === "tauri-nonce", "重建后的样式仍缺 nonce");
  assertValue(style.textContent === "new", "重建后没有写入新 CSS");
  assertValue(created() === 1, "重建应只创建一个元素");
});

testCase("开发态没有 nonce 时仍可正常注入", () => {
  const { doc, byId } = fakeDocument("");
  replaceInlineStyle("nota-doc-theme", "body {}", doc);
  const style = byId.get("nota-doc-theme");
  assertValue(style?.isConnected, "开发态样式没有插入");
  assertValue(style.nonce === "", "开发态不应伪造 nonce");
});

console.log(`\n通过 ${passed} 条，失败 ${failed} 条`);
if (failed) process.exitCode = 1;
