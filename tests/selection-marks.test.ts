/**
 * 选中文字后输入 Markdown 标记：包住选区、保留选区，连续输入自然叠成强标记。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  EditorState,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  建选区标记插件,
  包裹选区事务,
  应包裹选区,
  选区标记,
  选区标记补全,
  选区标记键,
} from "../src/editor/selection-marks";

let 过 = 0;
let 败 = 0;

function 测(名: string, 体: () => void): void {
  try {
    体();
    过 += 1;
    console.log(`  ✔ ${名}`);
  } catch (错误) {
    败 += 1;
    console.log(`  ✘ ${名}`);
    console.log(`      ${错误 instanceof Error ? 错误.message : String(错误)}`);
    if (错误 instanceof Error && 错误.stack) console.log(错误.stack);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", code: true },
    text: { group: "inline" },
  },
  marks: {
    inlineCode: { code: true },
  },
});

const 段 = (文: string): PMNode =>
  schema.nodes.paragraph.create(null, 文 ? schema.text(文) : null);

function 状态(文: string, 从 = 0, 到 = 从): EditorState {
  const doc = schema.nodes.doc.create(null, 段(文));
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1 + 从, 1 + 到),
  });
}

console.log("\n【选区标记】");

测("标记表覆盖常用行内写法，未知字符不接管", () => {
  for (const 字 of ["*", "_", "~", "^", "=", "`"]) {
    等(选区标记(字), 字 === "=" ? "==" : 字, `${字} 该有包裹`);
  }
  等(选区标记("a"), null, "普通字符");
});

测("选中文字按 `*`：两侧各一颗，选区仍是原文", () => {
  const 前 = 状态("甲乙", 0, 2);
  const tr = 包裹选区事务(前, 1, 3, "*");
  真(tr, "应当包裹");
  const 后 = 前.apply(tr);
  等(后.doc.textContent, "*甲乙*", "文档");
  等(后.selection.from, 2, "选区起点");
  等(后.selection.to, 4, "选区终点");
});

测("连续按两次 `*`：第二次继续包住原选区，得到粗体", () => {
  const 前 = 状态("甲乙", 0, 2);
  const 第一笔 = 包裹选区事务(前, 1, 3, "*");
  真(第一笔, "第一笔");
  const 中 = 前.apply(第一笔);
  const 第二笔 = 包裹选区事务(中, 中.selection.from, 中.selection.to, "*");
  真(第二笔, "第二笔");
  const 后 = 中.apply(第二笔);
  等(后.doc.textContent, "**甲乙**", "粗体标记");
});

测("`=` 第一次就包成高亮的双等号", () => {
  const 前 = 状态("重点", 0, 2);
  const tr = 包裹选区事务(前, 1, 3, "=");
  真(tr, "应当包裹");
  等(前.apply(tr).doc.textContent, "==重点==", "双等号");
});

测("跨段选区、代码块和行内代码都放行给原编辑器", () => {
  const 跨段doc = schema.nodes.doc.create(null, [段("甲"), 段("乙")]);
  const 跨段 = EditorState.create({
    schema,
    doc: 跨段doc,
    selection: TextSelection.create(跨段doc, 2, 5),
  });
  等(应包裹选区(跨段, 2, 5, "*"), false, "跨段");

  const 代码doc = schema.nodes.doc.create(
    null,
    [schema.nodes.code_block.create(null, schema.text("甲乙"))],
  );
  const 代码 = EditorState.create({
    schema,
    doc: 代码doc,
    selection: TextSelection.create(代码doc, 1, 3),
  });
  等(包裹选区事务(代码, 1, 3, "*"), null, "代码块");

  const 行内doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, schema.text("甲乙", [schema.marks.inlineCode.create()])),
  );
  const 行内 = EditorState.create({
    schema,
    doc: 行内doc,
    selection: TextSelection.create(行内doc, 1, 3),
  });
  等(包裹选区事务(行内, 1, 3, "*"), null, "行内代码");
});

测("插件入口真的把事务派进视图", () => {
  let 前 = 状态("甲乙", 0, 2);
  const 插件 = 建选区标记插件();
  等(插件.spec.key, 选区标记键, "插件键");
  const view = {
    composing: false,
    get state() {
      return 前;
    },
    dispatch(tr: Transaction) {
      前 = 前.apply(tr);
    },
  } as EditorView;
  const 接 = 插件.props.handleTextInput?.(view, 1, 3, "*") ?? false;
  等(接, true, "应当接管");
  等(前.doc.textContent, "*甲乙*", "派发结果");
});

测("智能符号关闭时不安装", () => {
  const 关 = 选区标记补全(false) as unknown[];
  等(Array.isArray(关) && 关.length === 0, true, "关闭");
  等(Array.isArray(选区标记补全(true)), false, "开启");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
