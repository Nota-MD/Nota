import { readFileSync } from "node:fs";
import { join } from "node:path";

const color = readFileSync(join(process.cwd(), "src/styles/theme/color.css"), "utf8");

function assertBlock(mode: "light" | "dark", expected: Record<string, string>): void {
  const pattern = new RegExp(
    `\\[data-ui-style="yaru"\\]\\[data-ui-mode="${mode}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
  );
  const block = pattern.exec(color)?.[1];
  if (!block) throw new Error(`missing Yaru ${mode} token block`);
  for (const [name, value] of Object.entries(expected)) {
    if (!new RegExp(`${name}:\\s*${value};`).test(block)) {
      throw new Error(`Yaru ${mode} ${name} must be ${value}`);
    }
  }
}

assertBlock("light", {
  "--bg": "#fafafa",
  "--bg-subtle": "#ebebeb",
  "--bg-raised": "#ffffff",
  "--fg": "#3d3d3d",
  "--border": "#cccccc",
  "--accent": "#e95420",
  "--toolbar-surface": "#ebebeb",
  "--doc-bg": "#ffffff",
});

assertBlock("dark", {
  "--bg": "#2c2c2c",
  "--bg-subtle": "#222222",
  "--bg-raised": "#1d1d1d",
  "--fg": "#f7f7f7",
  "--border": "#131313",
  "--accent": "#e95420",
  "--toolbar-surface": "#222222",
  "--doc-bg": "#272727",
});

console.log("Yaru GTK 4 palette: 16 checks passed");
