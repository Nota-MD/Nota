import {
  inlineTextSegments,
  parseInlineDelimiters,
  type InlineMarkName,
} from "../src/editor/inline-delimiter";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function shape(source: string) {
  const parsed = parseInlineDelimiters(source);
  return {
    text: parsed.text,
    ranges: parsed.ranges.map((range) => ({
      from: range.from,
      to: range.to,
      marks: range.marks,
    })),
  };
}

console.log("\n【行内分隔符解析】");

testCase("外层同宽标记优先，内部单星保持字面", () => {
  equal(shape("**Tauri 2*. Approach **Typora** spiritually."), {
    text: "Tauri 2*. Approach Typora** spiritually.",
    ranges: [{ from: 0, to: 19, marks: ["strong"] }],
  }, "outer strong");
});

testCase("强标记缺一颗闭符号时只保留最外层合法结构", () => {
  equal(shape("**1*"), {
    text: "*1",
    ranges: [{ from: 0, to: 2, marks: ["emphasis"] }],
  }, "strong fallback");
  equal(shape("*1**"), {
    text: "*1**",
    ranges: [],
  }, "unmatched trailing strong");
});

testCase("高亮必须有两个闭等号", () => {
  equal(shape("==1="), {
    text: "==1=",
    ranges: [],
  }, "invalid highlight");
  equal(shape("==1=="), {
    text: "1",
    ranges: [{ from: 0, to: 1, marks: ["highlight"] }],
  }, "valid highlight");
});

testCase("三星号生成粗体与斜体嵌套", () => {
  const parsed = parseInlineDelimiters("***1***");
  equal(parsed.text, "1", "text");
  equal(
    inlineTextSegments(parsed),
    [{ text: "1", marks: ["emphasis", "strong"] } as {
      text: string;
      marks: readonly InlineMarkName[];
    }],
    "segments",
  );
});

testCase("转义符号保持字面且不参与配对", () => {
  equal(shape("\\*x*"), {
    text: "*x*",
    ranges: [],
  }, "escaped opener");
  equal(shape("*\\*Typora**"), {
    text: "**Typora**",
    ranges: [],
  }, "escaped star does not close with the following run");
});

testCase("禁用某类标记时对应分隔符原样保留", () => {
  const parsed = parseInlineDelimiters("**1** ==2==", new Set<InlineMarkName>(["strong"]));
  equal(parsed.text, "1 ==2==", "disabled highlight remains literal");
  equal(parsed.ranges, [{ from: 0, to: 1, marks: ["strong"] }], "only strong parsed");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
