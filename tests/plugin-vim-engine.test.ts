import {
  configureVim,
  handleVimKey,
  recordVimInsertText,
  type VimEngineHost,
} from "@/editor/plugin-vim-engine";
import type { EditorOp } from "@/editor/plugin-vim-ops";
import {
  initialVimStatus,
  type VimInputConfig,
  type VimInputStatus,
} from "@/editor/plugin-vim-types";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (Object.is(actual, expected)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const profile: VimInputConfig = {
  kind: "vim",
  enabled: true,
  plugin: "nota-md.vim",
  profile: {
    id: "modern-vim",
    label: "Modern Vim",
    features: {
      arrowKeys: true,
      redo: true,
      macroRecording: true,
      textObjects: true,
      modes: { visual: true, visualLine: true },
    },
  },
};

equal(
  initialVimStatus(profile)?.label,
  "-- NORMAL --",
  "a newly spawned window shows Normal before the first engine callback",
);
equal(
  initialVimStatus({ ...profile, enabled: false }),
  null,
  "disabled Vim has no indicator",
);

const vimCss = readFileSync("src/styles/vim.css", "utf8");
equal(
  /\.nota-vim-status\s*\{[\s\S]*?position:\s*fixed;/.test(vimCss),
  true,
  "the mode indicator stays fixed instead of scrolling with the editor",
);
equal(
  /\.nota-vim-status\s*\{[\s\S]*?z-index:\s*190;/.test(vimCss),
  true,
  "the mode indicator remains above editor overlays",
);
const vimOverlay = readFileSync("src/ui/VimStatusOverlay.tsx", "utf8");
equal(
  vimOverlay.includes("rect.left + 16") &&
    vimOverlay.includes("window.innerHeight - rect.bottom"),
  true,
  "the mode indicator anchors to the editor pane's lower-left corner",
);
equal(
  readFileSync("src/ui/EditorPane.tsx", "utf8").includes(
    "<VimStatusOverlay status={displayedVimStatus} anchor={paneRef} />",
  ),
  true,
  "the editor pane supplies the viewport anchor",
);

const ops: EditorOp[] = [];
let status: VimInputStatus | null = null;
let mappingsText = "";
const host: VimEngineHost = {
  exec(op) {
    ops.push(op);
    if (op.op === "copyLines" || op.op === "deleteLines") {
      return { empty: false, text: "one\n" };
    }
    if (op.op === "copy") return { empty: true, text: "one" };
    return { empty: true };
  },
  capture() {},
  status(next) {
    status = next;
  },
  command() {},
  mappings() {
    return mappingsText;
  },
};

configureVim(host, profile);
equal(status?.mode, "normal", "the adapter starts in normal mode");
handleVimKey("i");
for (const key of ["o", "n", "e"]) handleVimKey(key);
handleVimKey("Escape");
handleVimKey("d");
handleVimKey("d");
await new Promise((resolve) => setTimeout(resolve, 0));
equal(
  ops.some((op) => op.op === "deleteLines" && op.count === 1),
  true,
  "dd deletes one line",
);
handleVimKey("p");
await new Promise((resolve) => setTimeout(resolve, 0));
equal(
  ops.some((op) => op.op === "pasteLines" && op.text === "one\n"),
  true,
  "p pastes the linewise register",
);
handleVimKey("0");
handleVimKey("d");
handleVimKey("w");
await new Promise((resolve) => setTimeout(resolve, 0));
equal(
  ops.some(
    (op) =>
      op.op === "move" &&
      op.unit === "wordStartInLine" &&
      op.select === true,
  ),
  true,
  "dw is expressed as a selected motion before deletion",
);
handleVimKey("u");
await new Promise((resolve) => setTimeout(resolve, 0));
equal(ops.some((op) => op.op === "undo"), true, "u reaches editor history");

configureVim(host, profile);
handleVimKey("i");
await new Promise((resolve) => setTimeout(resolve, 0));
recordVimInsertText("z");
handleVimKey("Escape");
handleVimKey(".");
await new Promise((resolve) => setTimeout(resolve, 10));
equal(
  ops.filter((op) => op.op === "insertText" && op.text === "z").length,
  1,
  "dot repeats an insert change",
);

configureVim(host, profile);
handleVimKey("q");
handleVimKey("a");
handleVimKey("i");
await new Promise((resolve) => setTimeout(resolve, 0));
recordVimInsertText("m");
handleVimKey("Escape");
handleVimKey("q");
handleVimKey("@");
handleVimKey("a");
await new Promise((resolve) => setTimeout(resolve, 10));
equal(
  ops.filter((op) => op.op === "insertText" && op.text === "m").length,
  1,
  "a recorded insert macro replays its text",
);

configureVim(host, profile);
handleVimKey('"');
handleVimKey("a");
handleVimKey("d");
handleVimKey("d");
handleVimKey("p");
await new Promise((resolve) => setTimeout(resolve, 0));
equal(
  ops.some((op) => op.op === "pasteLines" && op.text === "one\n"),
  true,
  "named registers can be selected for a linewise yank",
);

mappingsText = "inoremap jj <Esc>";
configureVim(host, profile);
handleVimKey("i");
await new Promise((resolve) => setTimeout(resolve, 0));
handleVimKey("j");
handleVimKey("j");
await new Promise((resolve) => setTimeout(resolve, 10));
equal(status?.mode, "normal", "insert-mode jj mapping leaves insert mode");
equal(
  ops.some((op) => op.op === "deleteChars" && op.back === true),
  true,
  "the insert mapping removes the pending j before leaving insert mode",
);

mappingsText = "";
configureVim(host, {
  ...profile,
  profile: {
    id: "classic-bsd-vi",
    label: "Classic BSD vi",
    features: {
      arrowKeys: false,
      redo: false,
      macroRecording: false,
      textObjects: false,
      modes: { visual: false, visualLine: false },
    },
  },
});
handleVimKey("v");
await new Promise((resolve) => setTimeout(resolve, 10));
equal(status?.mode, "normal", "Classic vi does not enter visual mode");

if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
