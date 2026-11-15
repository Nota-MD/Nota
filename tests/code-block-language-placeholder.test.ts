import { readFileSync } from "node:fs";
import { join } from "node:path";

const picker = readFileSync(join(process.cwd(), "src/editor/lang-picker.ts"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/code-block.css"), "utf8");

if (!picker.includes('field.placeholder = t("Code Language")')) {
  throw new Error("empty code language has no placeholder");
}
if (!picker.includes('field.value = lang === NO_LANGUAGE ? "" : lang')) {
  throw new Error("empty code language still renders as real text");
}
if (!/\.nota-code-lang-input::placeholder\s*\{[^}]*opacity:\s*0\.55/s.test(css)) {
  throw new Error("language placeholder is not translucent");
}

console.log("Code language placeholder: 3 checks passed");
