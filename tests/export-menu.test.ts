/** 自定义导出器进入设置页与「文件 → 导出」菜单的契约。 */

import { readFileSync } from "node:fs";

import { MENUS } from "../src/ui/commands";
import { injectExporter } from "../src/ui/export-menu";
import {
  customExportCommand,
  defaultCustomExporter,
  exportTemplateInfo,
  styleStyleTextItemParameter,
} from "../src/ui/export-templates";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}：期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

console.log("\n【自定义导出器】");

testCase("默认模板覆盖 Word 到 OPML 九种", () => {
  const list = defaultCustomExporter();
  equal(list.length, 9, "模板数量");
  equal(list[0]?.format, "docx", "首项");
  equal(list.at(-1)?.format, "opml", "末项");
});

testCase("添加模板里的 PDF 也能查到定义", () => {
  equal(exportTemplateInfo("pdf")?.extension, "pdf", "PDF 模板");
});

testCase("导出菜单固定项在前，自定义项按设置顺序跟随", () => {
  const list = [
    {
      id: "b",
      name: "Second",
      format: "epub",
      args: "",
      style_file: "",
      open_after_export: false,
    },
    {
      id: "a",
      name: "First",
      format: "docx",
      args: "",
      style_file: "",
      open_after_export: false,
    },
  ];
  const file = injectExporter(MENUS, list).find((menu) => menu.id === "file");
  const exp = file?.items.find((item) => item !== "sep" && item.id === "file.export");
  assertValue(exp && exp !== "sep" && exp.submenu, "没有导出子菜单");
  const ids = exp.submenu.map((item) => (item === "sep" ? "sep" : item.id));
  equal(
    ids.join(","),
    [
      "file.exportPdf",
      "file.exportHtmlStyled",
      "file.exportHtmlPlain",
      "file.exportImage",
      "sep",
      customExportCommand("b"),
      customExportCommand("a"),
    ].join(","),
    "菜单次序",
  );
});

testCase("样式文件转成对应 pandoc 参数", () => {
  equal(
    styleStyleTextItemParameter("docx", "C:\\我的 模板.docx"),
    '--reference-doc="C:/我的 模板.docx"',
    "Word 参数",
  );
  equal(styleStyleTextItemParameter("epub", "/tmp/a b.css"), '--css="/tmp/a b.css"', "EPUB 参数");
  assertValue(styleStyleTextItemParameter("rtf", "/tmp/a.rtf") === "", "RTF 不应接受样式文件");
});

testCase("设置页固定项有分隔线，自定义工具栏包含增删排序与改名", () => {
  const source = readFileSync(
    `${process.cwd()}/src/ui/settings/panes/ExportPane.tsx`,
    "utf8",
  );
  assertValue(
    source.includes(
      'const fixedFixedGuideNavigation: ReadonlyArray<{ id: FixedFixedPage; label: string }>',
    ),
    "固定项不对",
  );
  assertValue(source.includes('className="export-nav-sep"'), "缺少中间分隔线");
  for (const kind of ["add", "remove", "up", "down", "edit"]) {
    assertValue(source.includes(`kind="${kind}"`), `缺少 ${kind}`);
  }
  assertValue(source.includes('data-modal-layer="true"'), "添加模板弹窗没有加入嵌套模态层");
});

testCase("命令表为每个自定义导出器生成处理器", () => {
  const source = readFileSync(`${process.cwd()}/src/ui/useCommandTable.ts`, "utf8");
  assertValue(source.includes("customExporter.map"), "没有生成动态处理器");
  assertValue(source.includes("exportCustom(exporter.id)"), "处理器没有接线");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
