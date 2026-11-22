








































export const extensionExtendNameTable: Readonly<Record<string, string>> = {

  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  py: "python",
  pyw: "python",
  pyi: "python",
  rb: "ruby",
  rake: "ruby",
  gemfile: "ruby",
  php: "php",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  r: "r",
  jl: "julia",
  tcl: "tcl",
  awk: "awk",
  groovy: "groovy",
  gradle: "gradle",
  dart: "dart",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  hs: "haskell",
  elm: "elm",
  ml: "ocaml",
  mli: "ocaml",
  fs: "fsharp",
  fsx: "fsharp",
  nim: "nim",
  zig: "zig",
  odin: "odin",
  cr: "crystal",
  sol: "solidity",
  cypher: "cypher",
  gd: "gdscript",


  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cxxm: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ipp: "cpp",
  ino: "arduino",
  cs: "csharp",
  java: "java",
  go: "go",
  rs: "rust",
  m: "objectivec",
  mm: "objectivec",
  pas: "pascal",
  pp: "pascal",
  f: "fortran",
  f90: "fortran",
  f95: "fortran",
  cob: "cobol",
  bas: "basic",
  vb: "vbnet",
  vba: "vbnet",
  asm: "nasm",
  s: "nasm",


  vhd: "vhdl",
  vhdl: "vhdl",
  v: "verilog",
  sv: "verilog",
  svh: "verilog",
  glsl: "glsl",
  frag: "glsl",
  vert: "glsl",
  hlsl: "hlsl",
  wgsl: "wgsl",


  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "markup",
  svelte: "markup",
  xml: "xml",
  xsl: "xml",
  xslt: "xml",
  rss: "xml",
  atom: "xml",
  plist: "xml",
  svg: "svg",
  mathml: "mathml",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  styl: "stylus",
  cshtml: "cshtml",
  razor: "cshtml",
  ejs: "ejs",
  erb: "erb",
  hbs: "handlebars",
  handlebars: "handlebars",
  mustache: "mustache",
  twig: "twig",
  jinja: "jinja2",
  jinja2: "jinja2",
  j2: "jinja2",
  liquid: "liquid",
  pug: "pug",
  jade: "pug",
  haml: "haml",
  njk: "jinja2",


  json: "json",
  jsonc: "json",
  json5: "json5",
  webmanifest: "webmanifest",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "properties",
  env: "bash",
  csv: "csv",
  tsv: "csv",
  hcl: "hcl",
  tf: "hcl",
  tfvars: "hcl",
  nix: "nix",


  sql: "sql",
  pgsql: "sql",
  mysql: "sql",
  plsql: "plsql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  promql: "promql",


  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  mkd: "markdown",
  rst: "rest",
  adoc: "asciidoc",
  asciidoc: "asciidoc",
  tex: "latex",
  latex: "latex",
  sty: "latex",
  cls: "latex",
  bib: "latex",
  wiki: "wiki",
  org: "markdown",


  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ksh: "bash",
  fish: "bash",
  bashrc: "bash",
  zshrc: "bash",
  ps1: "powershell",
  psm1: "powershell",
  bat: "batch",
  cmd: "batch",
  mk: "makefile",
  makefile: "makefile",
  cmake: "cmake",
  dockerfile: "dockerfile",
  dockerignore: "ignore",
  gitignore: "gitignore",
  npmignore: "ignore",
  editorconfig: "editorconfig",
  vim: "vim",
  vimrc: "vim",
  nginx: "nginx",
  service: "systemd",
  timer: "systemd",
  diff: "diff",
  patch: "diff",
  regex: "regex",
  mermaid: "mermaid",
  mmd: "mermaid",
  puml: "plantuml",
  plantuml: "plantuml",
  sln: "solution-file",
  ipynb: "json",
  log: "log",
};















export function LanguageFromExtension(path: string): string | null {

  const name3 = path.trim().split(/[/\\]/).pop() ?? "";
  if (name3 === "") return null;
  const smallWriteName = name3.toLowerCase();

  const whole = extensionExtendNameTable[smallWriteName];
  if (whole) return whole;


  const point = smallWriteName.lastIndexOf(".");
  if (point < 0) return null;
  return extensionExtendNameTable[smallWriteName.slice(point + 1)] ?? null;
}





















export function looksLikeCode(text4: string): boolean {
  const line3 = text4.split(/\r\n?|\n/).filter((l) => l.trim() !== "");
  if (line3.length < 2) return false;

  const nonWhitespace = text4.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return false;
  const chineseCharacter = (nonWhitespace.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  if (chineseCharacter / nonWhitespace.length >= 0.2) return false;
  if (/[。，！？；：、「」『』（）]/.test(text4)) return false;

  return countShare(text4) >= codeThreshold;
}









function countShare(text4: string): number {
  let share = 0;
  for (const [determineEvidence, add] of codeSignal) {
    if (!determineEvidence.global) {
      if (determineEvidence.test(text4)) share += add;
      continue;
    }
    const count2 = text4.match(determineEvidence)?.length ?? 0;
    share += add * Math.min(count2, heavyRestoreCountShareLimit);
  }
  return share;
}






const codeSignal: readonly (readonly [RegExp, number])[] = [
  [/^#![^\n]*\/(?:ba|z|k)?sh/, 90],
  [/^#![^\n]*python/, 90],
  [/<\?php/, 90],
  [/^#\s*include\s*[<"]/m, 80], // C preprocessor include
  [/^using\s+namespace\s+\w+;/m, 70],
  [/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b[\s\S]*\bFROM\b/im, 70],
  [/<!DOCTYPE\s+html/i, 70],
  [/<\/[a-z][\w-]*>\s*$/m, 45],
  [/^(?:package|module)\s+[\w.]+$/m, 45],
  [/^pub\s+(?:fn|struct|enum)\s/m, 60],
  [/^fn\s+\w+\s*\(/m, 55],
  [/^(?:def|class)\s+\w+[^\n]*:\s*$/m, 55],
  [/^\s*(?:function|const|let|var|import|export)\s/m, 40],
  [/^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\]]+\s+\w+\s*\(/m, 55],
  [/^\s*(?:if|for|while|switch|return|try|catch)\b[^\n]*[{(:]/m, 30],
  [/^\s{2,}\S/m, 30],
  [/\t\S/, 20],
  [/=>|->|::|\?\?|&&|\|\||!==|===/, 25],
  [/[{}];?\s*$/m, 30],
  [/(?:console\.log|fmt\.|System\.out\.|println!|printf|echo)\s*\(/m, 40],
  [/^\s*(?:import|from|require|use)\s+[\w{*]/m, 35],
  [/^\s*[\w-]+\s*:\s*[^\s]/m, 15],
  [/\$\w+|\w+\s*=\s*[^=]/, 20],





  [/^\s*(?:npm|npx|yarn|pnpm|cargo|pip|pip3|docker|kubectl|systemctl|git|brew|apt-get|apt|curl|wget|cmake|gradle|mvn)\s+\S+/gm, 20],
  [/^\s*\$\s+\S/m, 25],
];







const heavyRestoreCountShareLimit = 3;

















const codeThreshold = 60;








export function GuessLanguageFromContent(text4: string): string | null {
  const sample = text4.split(/\r\n?|\n/).slice(0, getStyleRowCount).join("\n");
  for (const [determineEvidence, language] of contentDetermineEvidence) if (determineEvidence.test(sample)) return language;
  return null;
}


const getStyleRowCount = 40;







const contentDetermineEvidence: readonly (readonly [RegExp, string])[] = [
  [/^#![^\n]*\b(?:python[23]?)\b/m, "python"],
  [/^#![^\n]*\b(?:ba|z|k)?sh\b/m, "bash"],
  [/^#![^\n]*\bnode\b/m, "javascript"],
  [/^#![^\n]*\bruby\b/m, "ruby"],
  [/^#![^\n]*\bperl\b/m, "perl"],
  [/^#![^\n]*\b(?:deno|bun)\b/m, "typescript"],
  [/<\?php/, "php"],
  [/<!DOCTYPE\s+html/i, "html"],
  [/^#\s*include\s*[<"]/m, "c"],
  [/^\s*(?:template\s*<|std::|using\s+namespace)/m, "cpp"],
  [/^\s*(?:public\s+)?(?:static\s+)?class\s+\w+[\s\S]*?\{/m, "java"],
  [/^\s*(?:using\s+System;|namespace\s+[\w.]+)/m, "csharp"],
  [/^\s*fn\s+\w+|^\s*(?:pub\s+)?(?:fn|struct|enum|impl)\s/m, "rust"],
  [/^\s*package\s+main\b|^\s*func\s+\w+\s*\(/m, "go"],
  [/^\s*(?:def|class)\s+\w+[\s\S]*?:\s*$/m, "python"],
  [/^\s*from\s+[\w.]+\s+import\s|^\s*import\s+(?:os|sys|re|json)\b/m, "python"],
  [/^\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b/im, "sql"],
  [/^\s*\[(?:server|database|mysqld|nginx)\]/m, "ini"],
  [/^\s*\{\s*"(?:name|version|dependencies|scripts)"\s*:/m, "json"],
  [/^\s*(?:apiVersion|kind):\s/m, "yaml"],
  [/^\s*---\s*$[\s\S]*?^\s*[\w-]+:\s/m, "yaml"],
  [/^\s*package\s+[\w.]+\s*;?\s*$/m, "java"],
  [/^\s*(?:<html|<div|<span|<table|<p\b)/i, "html"],
  [/^\s*[:.#][\w-]+\s*\{[^}]*\}/m, "css"],
  [/^\s*(?:export|import)\s+[\s\S]*?\bfrom\s+['"]/m, "javascript"],
  [/^\s*(?:const|let|var)\s+\w+\s*=\s*(?:require|function|\(|async|\[|\{)/m, "javascript"],
  [/^\s*interface\s+\w+\s*\{|^\s*type\s+\w+\s*=/m, "typescript"],
  [/^\s*(?:#include|module)\b/m, "ruby"],
  [/\bputs\s+['"]|^\s*end\s*$/m, "ruby"],
  [/^\s*\$[a-zA-Z_]\w*\s*=/m, "php"],
  [/^\s*use\s+strict;|^\s*my\s+[$@%]\w+/m, "perl"],
  [/^\s*local\s+\w+\s*=|^\s*function\s+\w+\s*\(\s*\)\s*$/m, "lua"],
  [/^\s*\(defun\s|^\s*\(ns\s/m, "lisp"],
  [/^\s*\(ns\s|^\s*\(defn\s/m, "clojure"],
  [/^\s*\(define\s|^\s*\(lambda\s/m, "scheme"],
  [/^(?:module\s+\w+\s+where|import\s+Data\.)/m, "haskell"],
  [/^\s*Imports\s+\w+|^\s*Sub\s+\w+/m, "vbnet"],
  [/^\\documentclass|^\\begin\{document\}/m, "latex"],
  [/^\.PHONY:|^\t\$\(|\t@echo\s/m, "makefile"],
  [/^FROM\s+\S+|^RUN\s+/m, "dockerfile"],
  [/^\s*graph\s+(?:TD|LR|TB)\b|^\s*sequenceDiagram\b/m, "mermaid"],
  [/^\s*@startuml\b|^\s*class\s+\w+\s*\{/m, "plantuml"],
  [/\bdiff --git\b|^@@\s[-\d,]+ \+[-\d,]+ @@/m, "diff"],
];













export function LanguageFromFilename(text4: string): string | null {
  for (const line3 of text4.split(/\r\n?|\n/).slice(0, lineSearchRowCount)) {
    const find = /^\s*(?:\/\/+|#+|--+|;+|\/\*+|<!--+)\s*([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,8})\b/.exec(line3);
    if (!find) continue;
    const language = LanguageFromExtension(find[1]!);
    if (language) return language;
  }
  return null;
}


const lineSearchRowCount = 5;










export function guessCodeLanguage(text4: string): string {
  return LanguageFromFilename(text4) ?? GuessLanguageFromContent(text4) ?? "";
}
