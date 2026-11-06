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

testCase("按 Typedown 最近闭合规则解析不规则的星号序列", () => {
  equal(shape("**Tauri 2*. Approach **Typora** spiritually."), {
    text: "Tauri 2*. Approach Typora** spiritually.",
    ranges: [
      { from: 0, to: 19, marks: ["strong"] },
    ],
  }, "Typedown nearest strong run");
});

testCase("带前文时仍采用 Typedown 的最近强闭符优先级", () => {
  const parsed = parseInlineDelimiters(
    "Based on **Tauri 2*. Approach **Typora** spiritually.",
  );
  equal(
    inlineTextSegments(parsed),
    [
      { text: "Based on ", marks: [] as InlineMarkName[] },
      { text: "Tauri 2*. Approach ", marks: ["strong"] as InlineMarkName[] },
      { text: "Typora** spiritually.", marks: [] as InlineMarkName[] },
    ],
    "Typedown nearest strong with prefix",
  );
});

testCase("强标记缺一颗闭符号时只保留最外层合法结构", () => {
  equal(shape("**1*"), {
    text: "*1",
    ranges: [{ from: 1, to: 2, marks: ["emphasis"] }],
  }, "strong fallback");
  equal(shape("*1**"), {
    text: "1*",
    ranges: [{ from: 0, to: 1, marks: ["emphasis"] }],
  }, "closing single run leaves the final star literal");
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
    [{ text: "1", marks: ["strong", "emphasis"] } as {
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
    text: "*Typora*",
    ranges: [{ from: 0, to: 7, marks: ["emphasis"] }],
  }, "escaped inner star remains literal inside the GFM emphasis run");
});

testCase("反斜杠只转义 ASCII 标点，LaTeX 命令的反斜杠保留", () => {
  equal(shape("&\\LaTeX$"), {
    text: "&\\LaTeX$",
    ranges: [],
  }, "backslash before a letter");
  equal(shape("\\LaTeX *x*"), {
    text: "\\LaTeX x",
    ranges: [{ from: 7, to: 8, marks: ["emphasis"] }],
  }, "LaTeX command then emphasis");
});

testCase("禁用某类标记时对应分隔符原样保留", () => {
  const parsed = parseInlineDelimiters("**1** ==2==", new Set<InlineMarkName>(["strong"]));
  equal(parsed.text, "1 ==2==", "disabled highlight remains literal");
  equal(parsed.ranges, [{ from: 0, to: 1, marks: ["strong"] }], "only strong parsed");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
