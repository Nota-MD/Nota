





















































import { LanguageFromExtension } from "./lang-guess";


export interface ClearManageResult {

  html: string;

  languageClue: string | null;
}











const wholeBlockRemove = new Set([
  "script",
  "style",
  "head",
  "title",
  "meta",
  "link",
  "base",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "canvas",
  "select",
  "option",
  "optgroup",
  "textarea",
  "button",
  "input",
]);








const loseShell = new Set([
  "html",
  "body",
  "span",
  "font",
  "small",
  "big",
  "abbr",
  "cite",
  "q",
  "time",
  "label",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "nav",
  "main",
  "form",
  "fieldset",
  "legend",
  "address",
  "hgroup",
  "center",
  "wbr",
]);













const attributeWhiteNameSingle: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
  pre: ["data-language"],
};


const emptyElement = new Set([
  "br",
  "img",
  "hr",
  "wbr",
  "input",
  "meta",
  "link",
  "area",
  "col",
  "source",
  "track",
  "base",
]);







const notPackageWrap = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "hr",
  "br",
  "details",
  "summary",
  "figure",
  "figcaption",
  "caption",
  "dl",
  "dt",
  "dd",
]);






const packageValueContainer = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "dt",
  "dd",
]);








const replaceName: Readonly<Record<string, string>> = {
  ins: "u",
  strike: "s",
  b: "strong",
  i: "em",
};








const styleStyleLanguageMeaning: readonly (readonly [RegExp, string])[] = [
  [/font-weight\s*:\s*(?:bold|bolder|[6-9]\d0)\b/i, "strong"],
  [/font-style\s*:\s*italic\b/i, "em"],
  [/text-decoration(?:-line)?\s*:[^;]*\bunderline\b/i, "u"],
  [/text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i, "s"],
  [/vertical-align\s*:\s*super\b/i, "sup"],
  [/vertical-align\s*:\s*sub\b/i, "sub"],
  [/background(?:-color)?\s*:\s*(?!transparent|none|inherit|initial|unset)[^;]+/i, "mark"],
];




interface label {
  name3: string;
  closeCombine: boolean;
  selfCloseCombine: boolean;
  attributeString: string;
}


interface StackItem {
  name3: string;









  outputLabel2: boolean;
  packageValue: string[];
}





export function clearManagePastePasteHTML(html: string): ClearManageResult {
  const fullTextLineSearch = findLanguageClue(html);
  let output2 = "";
  let i = 0;
  const stack: StackItem[] = [];

  let loseDarkDegree = 0;
  let loseName = "";
  const n = html.length;

  while (i < n) {
    const left = html.indexOf("<", i);
    if (left < 0) {
      if (loseDarkDegree === 0) output2 += text2(html.slice(i));
      break;
    }


    if (!/[a-zA-Z!/?]/.test(html[left + 1] ?? "")) {
      if (loseDarkDegree === 0) output2 += text2(html.slice(i, left + 1));
      i = left + 1;
      continue;
    }
    if (loseDarkDegree === 0) output2 += text2(html.slice(i, left));

    if (html.startsWith("<!--", left)) {
      const complete = html.indexOf("-->", left + 4);
      i = complete < 0 ? n : complete + 3;
      continue;
    }
    if (html[left + 1] === "!" || html[left + 1] === "?") {
      const complete = html.indexOf(">", left);
      i = complete < 0 ? n : complete + 1;
      continue;
    }

    const tail = findLabelTail(html, left);
    if (tail < 0) {

      if (loseDarkDegree === 0) output2 += text2(html.slice(left));
      break;
    }
    const parse2 = parseLabel(html.slice(left, tail + 1));
    i = tail + 1;
    if (!parse2) continue;


    if (loseDarkDegree > 0) {
      if (parse2.name3 === loseName) {
        if (parse2.closeCombine) loseDarkDegree--;
        else if (!parse2.selfCloseCombine) loseDarkDegree++;
      }
      continue;
    }
    if (wholeBlockRemove.has(parse2.name3)) {
      if (!parse2.closeCombine && !parse2.selfCloseCombine) {
        loseDarkDegree = 1;
        loseName = parse2.name3;
      }
      continue;
    }


    const isCommandNameEmptyInterval = parse2.name3.includes(":");

    if (parse2.closeCombine) {
      const receive = receiveStack(stack, parse2.name3, output2);
      output2 = receive.output2;
      if (receive.configureAbove && receive.outputLabel2) output2 += `</${parse2.name3}>`;
      continue;
    }


    const isEmpty = emptyElement.has(parse2.name3) || parse2.selfCloseCombine;


    const outputLabel2 = !isCommandNameEmptyInterval && !loseShell.has(parse2.name3);
    const packageValue = readLanguageMeaningPackageWrap(parse2, isCommandNameEmptyInterval);
    if (outputLabel2) output2 += outputLabel(parse2, fullTextLineSearch);
    for (const t of packageValue) output2 += `<${t}>`;
    if (!isEmpty) stack.push({ name3: parse2.name3, outputLabel2, packageValue });
  }



  while (stack.length > 0) {
    const item5 = stack.pop()!;
    for (let k = item5.packageValue.length - 1; k >= 0; k--) output2 += `</${item5.packageValue[k]}>`;
    if (item5.outputLabel2) output2 += `</${item5.name3}>`;
  }
  return { html: output2, languageClue: fullTextLineSearch };
}










function text2(s: string): string {
  return s.replace(/</g, "&lt;");
}


function findLabelTail(s: string, start5: number): number {
  let reference = "";
  for (let i = start5 + 1; i < s.length; i++) {
    const c = s[i]!;
    if (reference !== "") {
      if (c === reference) reference = "";
      continue;
    }
    if (c === '"' || c === "'") {
      reference = c;
      continue;
    }
    if (c === ">") return i;
  }
  return -1;
}


function parseLabel(source: string): label | null {
  const m = /^<\s*(\/?)\s*([a-zA-Z][\w:.-]*)([\s\S]*?)(\/?)\s*>$/.exec(source);
  if (!m) return null;
  const smallWrite = m[2]!.toLowerCase();
  return {



    name3: replaceName[smallWrite] ?? smallWrite,
    closeCombine: m[1] === "/",
    selfCloseCombine: m[4] === "/",
    attributeString: m[3] ?? "",
  };
}


function parseAttribute(stringValue: string): [string, string | null][] {
  const output2: [string, string | null][] = [];
  const find = /\s([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  for (let m = find.exec(stringValue); m; m = find.exec(stringValue)) {
    const name3 = m[1]!.toLowerCase();
    let value2 = m[2] ?? null;
    if (value2 !== null && (value2.startsWith('"') || value2.startsWith("'"))) value2 = value2.slice(1, -1);
    output2.push([name3, value2]);
  }
  return output2;
}


function readLanguageMeaningPackageWrap(parse2: label, isCommandNameEmptyInterval: boolean): string[] {





  if (
    !isCommandNameEmptyInterval &&
    notPackageWrap.has(parse2.name3) &&
    !packageValueContainer.has(parse2.name3)
  ) return [];
  const styleStyle = parseAttribute(parse2.attributeString).find(([k]) => k === "style")?.[1];
  if (!styleStyle) return [];
  const output2: string[] = [];
  for (const [determineEvidence, labelName] of styleStyleLanguageMeaning) if (determineEvidence.test(styleStyle)) output2.push(labelName);
  return output2;
}







function outputLabel(parse2: label, fullTextLineSearch: string | null): string {
  const allowAllow = attributeWhiteNameSingle[parse2.name3];
  if (!allowAllow) return `<${parse2.name3}>`;
  const keep: string[] = [];
  for (const [k, v] of parseAttribute(parse2.attributeString)) {
    if (allowAllow.includes(k) && v !== null) keep.push(`${k}="${convertMeaningAttribute(v)}"`);
  }
  if (parse2.name3 === "pre" && !keep.some((a) => a.startsWith("data-language"))) {



    const selfWith = findLanguageClue(parse2.attributeString) ?? fullTextLineSearch;
    if (selfWith) keep.push(`data-language="${convertMeaningAttribute(selfWith)}"`);
  }
  return keep.length > 0 ? `<${parse2.name3} ${keep.join(" ")}>` : `<${parse2.name3}>`;
}


function convertMeaningAttribute(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}












function receiveStack(
  stack: StackItem[],
  name3: string,
  output2: string,
): { output2: string; configureAbove: boolean; outputLabel2: boolean } {
  let k = -1;
  for (let j = stack.length - 1; j >= 0; j--) {
    if (stack[j]!.name3 === name3) {
      k = j;
      break;
    }
  }
  if (k < 0) return { output2, configureAbove: false, outputLabel2: false };
  const outputLabel2 = stack[k]!.outputLabel2;
  for (let j = stack.length - 1; j >= k; j--) {
    const packageValue = stack[j]!.packageValue;
    for (let t = packageValue.length - 1; t >= 0; t--) output2 += `</${packageValue[t]}>`;
  }
  stack.length = k;
  return { output2, configureAbove: true, outputLabel2 };
}






















export const languageNameTable: Readonly<Record<string, string>> = {
  python: "python", python3: "python",
  javascript: "javascript", typescript: "typescript",
  jsx: "jsx", tsx: "tsx",
  rust: "rust", golang: "go", go: "go",
  ruby: "ruby", php: "php", perl: "perl", lua: "lua",
  java: "java", kotlin: "kotlin", scala: "scala", groovy: "groovy",
  c: "c", cpp: "cpp", "c++": "cpp", csharp: "csharp", "c#": "csharp",
  objectivec: "objectivec", "objective-c": "objectivec", objc: "objectivec",
  swift: "swift", pascal: "pascal", fortran: "fortran", cobol: "cobol",
  basic: "basic", vbnet: "vbnet", "vb.net": "vbnet", "visual-basic": "vbnet",
  haskell: "haskell", elixir: "elixir", erlang: "erlang", clojure: "clojure",
  ocaml: "ocaml", fsharp: "fsharp", "f#": "fsharp", dart: "dart", julia: "julia",
  nim: "nim", zig: "zig", crystal: "crystal", solidity: "solidity",
  gdscript: "gdscript", cypher: "cypher", odin: "odin",
  assembly: "nasm", nasm: "nasm",

  verilog: "verilog", vhdl: "vhdl", glsl: "glsl", hlsl: "hlsl", wgsl: "wgsl",

  html: "html", xml: "xml", svg: "svg", mathml: "mathml",
  vue: "markup", svelte: "markup",
  cshtml: "cshtml", jinja: "jinja2", jinja2: "jinja2", handlebars: "handlebars",

  json: "json", json5: "json5", yaml: "yaml", toml: "toml", ini: "ini",
  hcl: "hcl", terraform: "hcl", nix: "nix", dockerfile: "dockerfile",
  docker: "dockerfile", makefile: "makefile", make: "makefile", cmake: "cmake",
  nginx: "nginx", systemd: "systemd", properties: "properties",
  gitignore: "gitignore", editorconfig: "editorconfig",
  protobuf: "protobuf", proto: "protobuf", graphql: "graphql", gql: "graphql",

  sql: "sql", psql: "sql", pgsql: "sql", postgres: "sql", postgresql: "sql",
  mysql: "sql", sqlite: "sql", tsql: "sql", plsql: "plsql", promql: "promql",

  markdown: "markdown", mkd: "markdown", latex: "latex", asciidoc: "asciidoc",
  adoc: "asciidoc", rest: "rest", rst: "rest", wiki: "wiki", csv: "csv",
  log: "log", diff: "diff", patch: "diff", regex: "regex", regexp: "regex",
  mermaid: "mermaid", plantuml: "plantuml", puml: "plantuml",

  shell: "bash", sh: "bash", bash: "bash", zsh: "bash",
  powershell: "powershell", pwsh: "powershell", batch: "batch", bat: "batch",
  vim: "vim", viml: "vim", tcl: "tcl", awk: "awk",
};




















export function findLanguageClue(s: string): string | null {
  const find =
    /(?:highlight-source-|language-|lang-|brush:\s*|data-language\s*=\s*["']|data-lang\s*=\s*["'])([A-Za-z][\w+#.-]*)/i.exec(
      s,
    );
  if (!find) return null;
  const recordNumber = find[1]!;
  return LanguageFromExtension(recordNumber) ?? languageNameTable[recordNumber.toLowerCase()] ?? null;
}
