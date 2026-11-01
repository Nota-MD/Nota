import { readFileSync } from "node:fs";
import { normalise } from "@/ui/panel-nodes";

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): void {
  if (condition) {
    passed++;
    return;
  }
  failed++;
  console.log(`  FAIL ${message}`);
}

const nodes = normalise([
  {
    kind: "toggle",
    label: "Vim mode",
    value: true,
    command: "set_enabled",
    arg: "enabled",
  },
  {
    kind: "select",
    label: "Profile",
    value: "modern-vim",
    command: "select_profile",
    arg: "profile",
    options: [
      { label: "Classic BSD vi", value: "classic-bsd-vi" },
      { label: "Modern Vim", value: "modern-vim" },
      { label: "No value", value: "" },
    ],
  },
  {
    kind: "file",
    label: "Profile file",
    buttonLabel: "Import…",
    command: "import_profile",
    arg: "file",
  },
]);

check(nodes.map((node) => node.kind).join(",") === "toggle,select,file", "three generic controls");
check((nodes[0] as any).value === true, "toggle keeps its state");
check((nodes[0] as any).arg === "enabled", "toggle names its command argument");
check((nodes[1] as any).options.length === 2, "select drops options without values");
check((nodes[1] as any).arg === "profile", "select names its command argument");
check((nodes[2] as any).accept === ".json,application/json", "file defaults to JSON");
check((nodes[2] as any).buttonLabel === "Import…", "file keeps its action label");

const panelBody = readFileSync("src/ui/PanelBody.tsx", "utf8");
const dockCss = readFileSync("src/styles/dock.css", "utf8");
check(panelBody.includes("allowFullScreen"), "embedded frames allow native fullscreen");
check(panelBody.includes('allow="fullscreen; autoplay"'), "frame permission policy includes fullscreen");
check(dockCss.includes("contain: layout paint style"), "embedded presentation is paint-isolated");

console.log(`\n面板通用控件：${passed} 条通过、${failed} 条失败`);
if (failed > 0) process.exit(1);
