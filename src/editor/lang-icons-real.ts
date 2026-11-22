




























































export const iconGroup: readonly { icon: string; language: readonly string[] }[] = [

  { icon: "js", language: ["javascript", "js"] },
  { icon: "typescript", language: ["typescript", "ts"] },
  { icon: "reactjs", language: ["jsx"] },
  { icon: "reactts", language: ["tsx"] },
  { icon: "html", language: ["html", "markup"] },
  { icon: "css", language: ["css"] },
  { icon: "scss", language: ["scss"] },
  { icon: "sass", language: ["sass"] },
  { icon: "less", language: ["less"] },
  { icon: "stylus", language: ["stylus"] },
  { icon: "ejs", language: ["ejs"] },
  { icon: "erb", language: ["erb"] },
  { icon: "handlebars", language: ["handlebars", "hbs"] },
  { icon: "mustache", language: ["mustache"] },
  { icon: "jinja", language: ["jinja2", "django"] },
  { icon: "twig", language: ["twig", "tt2"] },
  { icon: "pug", language: ["pug"] },
  { icon: "haml", language: ["haml"] },


  { icon: "json", language: ["json", "json5", "jsonp", "tsconfig"] },
  { icon: "yaml", language: ["yaml", "yml"] },
  { icon: "toml", language: ["toml"] },
  { icon: "ini", language: ["ini", "editorconfig"] },
  { icon: "xml", language: ["xml"] },
  { icon: "svg", language: ["svg"] },
  { icon: "excel", language: ["xls", "xlsx", "excel-formula"] },
  { icon: "sql", language: ["sql", "plsql"] },
  { icon: "graphql", language: ["graphql"] },
  { icon: "protobuf", language: ["protobuf"] },
  { icon: "diff", language: ["diff"] },
  { icon: "http", language: ["http"] },
  { icon: "rest", language: ["rest"] },


  { icon: "c", language: ["c"] },
  { icon: "cpp", language: ["cpp"] },
  { icon: "csharp", language: ["csharp", "cs"] },
  { icon: "java", language: ["java"] },
  { icon: "kotlin", language: ["kotlin", "kt", "kts"] },
  { icon: "scala", language: ["scala"] },
  { icon: "groovy", language: ["groovy"] },
  { icon: "gradle", language: ["gradle"] },
  { icon: "go", language: ["go", "go-mod", "go-module"] },
  { icon: "rust", language: ["rust"] },
  { icon: "swift", language: ["swift"] },
  { icon: "objectivec", language: ["objectivec", "objc"] },
  { icon: "zig", language: ["zig"] },
  { icon: "nim", language: ["nim"] },
  { icon: "crystal", language: ["crystal"] },
  { icon: "dartlang", language: ["dart"] },
  { icon: "vb", language: ["vb", "vbnet", "visual-basic"] },
  { icon: "fsharp", language: ["fsharp"] },
  { icon: "qsharp", language: ["qsharp"] },
  { icon: "wasm", language: ["wasm"] },


  { icon: "python", language: ["python", "py"] },
  { icon: "ruby", language: ["ruby", "rb"] },
  { icon: "php", language: ["php"] },
  { icon: "perl", language: ["perl"] },
  { icon: "lua", language: ["lua"] },
  { icon: "r", language: ["r"] },
  { icon: "julia", language: ["julia"] },
  { icon: "matlab", language: ["matlab"] },
  { icon: "awk", language: ["awk", "gawk"] },
  { icon: "tcl", language: ["tcl"] },
  { icon: "vim", language: ["vim"] },



  { icon: "shell", language: ["bash", "sh", "shell", "shellsession", "shell-session", "sh-session"] },
  { icon: "powershell", language: ["powershell"] },



  { icon: "bat", language: ["batch"] },


  { icon: "haskell", language: ["haskell", "hs"] },
  { icon: "clojure", language: ["clojure"] },
  { icon: "lisp", language: ["lisp", "emacs", "emacs-lisp", "elisp"] },
  { icon: "ocaml", language: ["ocaml"] },
  { icon: "elm", language: ["elm"] },
  { icon: "erlang", language: ["erlang"] },
  { icon: "elixir", language: ["elixir"] },
  { icon: "racket", language: ["racket", "rkt"] },
  { icon: "prolog", language: ["prolog"] },
  { icon: "ada", language: ["ada"] },


  { icon: "fortran", language: ["fortran"] },
  { icon: "cobol", language: ["cobol"] },



  { icon: "assembly", language: ["nasm", "armasm", "asm6502", "arm-asm"] },
  { icon: "vhdl", language: ["vhdl"] },
  { icon: "verilog", language: ["verilog"] },
  { icon: "solidity", language: ["solidity"] },
  { icon: "glsl", language: ["glsl"] },
  { icon: "hlsl", language: ["hlsl"] },


  { icon: "markdown", language: ["markdown", "md"] },
  { icon: "asciidoc", language: ["asciidoc", "adoc"] },
  { icon: "tex", language: ["math", "latex", "tex"] },
  { icon: "text", language: ["plaintext", "plain", "text", "txt"] },
  { icon: "mermaid", language: ["mermaid"] },
  { icon: "plantuml", language: ["plantuml", "plant-uml"] },


  { icon: "git", language: ["git", "gitignore"] },
  { icon: "docker", language: ["docker", "dockerfile"] },
  { icon: "nginx", language: ["nginx"] },
  { icon: "cmake", language: ["cmake"] },
];


const languageToIcon = new Map<string, string>();
for (const { icon, language } of iconGroup) {
  for (const id of language) languageToIcon.set(id, icon);
}















export function representTableLanguage(id: string): string {
  const group = iconGroup.find((g) => g.language.includes(id));
  return group ? group.language[0]! : id;
}







export function iconName(language: string): string | null {
  return languageToIcon.get(language) ?? null;
}


export function allIconNames(): string[] {
  return [...new Set(iconGroup.map(({ icon }) => icon))];
}
















let sourceBufferSave: Record<string, string> | null = null;
function allSource(): Record<string, string> {
  if (sourceBufferSave === null) {
    sourceBufferSave = import.meta.glob("../assets/lang-icons/file_type_*.svg", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
  }
  return sourceBufferSave;
}




let reportPassMissingTextItem = false;








export function assertValueIconURI(language: string): string | null {
  const name3 = iconName(language);
  if (name3 === null) return null;

  const source = allSource();
  let image = source[`../assets/lang-icons/file_type_${name3}.svg`];

  if (image === undefined && !reportPassMissingTextItem) {




    reportPassMissingTextItem = true;
    console.warn(
      `[nota] Language icon entry \`${name3}\` (id: ${findLanguage(name3) ?? "?"}) has no ` +
        `src/assets/lang-icons/file_type_${name3}.svg; using the letter badge fallback. ` +
        "The table lives in src/editor/lang-icons-real.ts; tools/fetch-lang-icons.sh captures its icons.",
    );
    return null;
  }
  if (image === undefined) return null;






  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}")`;
}


function findLanguage(icon: string): string | null {
  for (const [id, name3] of languageToIcon) if (name3 === icon) return id;
  return null;
}
