/**
 * Theme icon override-chain regression tests.
 *
 * These tests inspect source contracts because the repository has no jsdom.
 * Real-window icon switching still requires visual verification.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

let pass = 0;
let fail = 0;
const failure: string[] = [];

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name3}`);
  } catch (e) {
    fail++;
    failure.push(name3);
    console.log(`  ✘ ${name3}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(condition: boolean, description: string): void {
  if (!condition) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

const Icon = read("src", "ui", "Icon.tsx");
const iconsCss = read("src", "styles", "icons.css");
const marksCss = read("src", "styles", "marks.css");
const editorBlocksCss = read("src", "styles", "editor-blocks.css");
const cdeCss = read("src", "styles", "external-themes", "cde", "theme.css");
const mainTsx = read("src", "main.tsx");
const assetsRs = read("src-tauri", "src", "theme_assets.rs");
const uiStylesRs = read("src-tauri", "src", "ui_styles.rs");

testCase("Icon maps logical names to --icon-<id> with a default fallback", () => {
  assertValue(Icon.includes("data-icon={name}"), "Icon does not render data-icon");
  assertValue(
    Icon.includes("`var(--icon-${name}, var(--icon-base))`"),
    "logical names are not mapped to --icon-<id>, or the default fallback is missing",
  );
  assertValue(
    Icon.includes("WebkitMaskImage: override") && Icon.includes("maskImage: override"),
    "WebView2 still requires a second custom-property replacement layer",
  );
  assertValue(iconsCss.includes("var(--icon-override, var(--icon-base))"), "the mask does not consume the override variable");
});

testCase("CDE declares icon IDs to URL mappings without per-icon component rules", () => {
  assertValue(
    cdeCss.includes(
      '--icon-nota-close-symbolic: url("./assets/icons/close.svg")',
    ),
    "the CDE close mapping is missing",
  );
  assertValue(cdeCss.includes("--icon-nota-format-text-bold-symbolic"), "the bold icon mapping is missing");
  assertValue(cdeCss.includes("--icon-nota-heading-1-symbolic"), "the CDE heading-1 icon mapping is missing");
  assertValue(cdeCss.includes("--nota-source-quote-icon"), "the CDE quote-source icon mapping is missing");
  assertValue(!cdeCss.includes('.icon[data-icon="nota-close-symbolic"]'), "the theme regressed to hard-coded selectors");
});

testCase("editor block marks use custom SVG and list markers remain stable", () => {
  assertValue(marksCss.includes('--nota-source-quote-icon'), "the quote-source icon variable is missing");
  assertValue(marksCss.includes('data-srcmark=">"'), "quote blocks are not connected to the SVG");
  assertValue(!marksCss.includes('data-srcmark="-"]'), "list markers still switch source glyphs while editing");
  assertValue(marksCss.includes('data-srcmark="```"'), "code fences are not connected to the SVG");
  assertValue(
    editorBlocksCss.includes('ul > li:not([data-item-type="task"])::before'),
    "unordered lists do not draw a stable bullet",
  );
  assertValue(
    editorBlocksCss.includes("--nota-source-bullet-icon"),
    "unordered-list bullets do not use the theme icon",
  );
  assertValue(
    marksCss.includes("top: 50%") && marksCss.includes("transform: translateY(-50%)"),
    "block marks are not vertically centered within the block",
  );
});

testCase("CDE is not a bundled style or a static stylesheet import", () => {
  assertValue(!uiStylesRs.includes('"cde"'), "ui_styles.rs still lists cde as bundled");
  assertValue(!mainTsx.includes('"./styles/external-themes/cde/theme.css"'), "main.tsx imports CDE directly");
  assertValue(!mainTsx.includes('"./styles/cde.css"'), "main.tsx imports the legacy CDE stylesheet");
});

testCase("core CSS contains no CDE-specific selectors", () => {
  const root = join(process.cwd(), "src", "styles");
  const externalPlace = join(root, "external-themes");
  const cssTextItem = (itemRecord: string): string[] =>
    readdirSync(itemRecord, { withFileTypes: true }).flatMap((item5) => {
      const path = join(itemRecord, item5.name);
      if (item5.isDirectory()) return path === externalPlace ? [] : cssTextItem(path);
      return item5.isFile() && item5.name.endsWith(".css") ? [path] : [];
    });
  for (const path of cssTextItem(root)) {
    assertValue(
      !readFileSync(path, "utf8").includes('data-ui-style="cde"'),
      `${relative(process.cwd(), path)} still contains a CDE-specific selector`,
    );
  }
});

testCase("custom CDE icons exist and use a 16px source grid", () => {
  for (const name3 of [
    "document-open",
    "document-new",
    "document-save",
    "close",
    "configure",
    "plugin",
    "window",
    "image",
    "code",
    "link",
    "columns",
    "spellcheck",
    "format-bold",
    "format-italic",
    "format-underline",
    "list-bullet",
    "list-ordered",
    "quote",
    "task",
    "unfold-more",
    "sidebar-collapse",
    "sidebar-toggle",
    "heading-1",
    "heading-2",
    "heading-3",
    "source-quote",
    "source-bullet",
    "source-code",
  ]) {
    const path = join("src", "styles", "external-themes", "cde", "assets", "icons", `${name3}.svg`);
    assertValue(existsSync(path), `missing ${path}`);
    const source3 = readFileSync(path, "utf8");
    assertValue(source3.includes('width="16"') && source3.includes('height="16"'), `${name3} is not 16x16`);
  }
});

testCase("user assets resolve relative to CSS files without a fixed icon directory", () => {
  assertValue(assetsRs.includes('find("url(")'), "the backend does not parse relative CSS url() values");
  assertValue(assetsRs.includes("font/ttf") && assetsRs.includes("image/svg+xml"), "font or icon MIME types are missing");
  assertValue(!uiStylesRs.includes('join("icons")'), "ui_styles.rs again hard-codes a theme icons directory");
});

if (fail) {
  console.error(`\n${fail} failed`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed`);
}
