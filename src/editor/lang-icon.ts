





































import {
  ensureLanguageIcons,
  hasDedicatedBelongIcon as hasLoadedLanguageIcon,
  realLanguageIconURI,
} from "./lang-icon-registry";


const NO_LANGUAGE = "";







const shrinkWriteTable: Record<string, string> = {
  python: "Py",
  perl: "Pl",
  php: "Ph",
  javascript: "JS",
  typescript: "TS",
  jsx: "JSX",
  tsx: "TSX",
  csharp: "C#",
  fsharp: "F#",
  cpp: "C+",
  objectivec: "OC",
  coffeescript: "CS",
  visualbasic: "VB",
  vbnet: "VB",
  powershell: "PS",
  postscript: "PS",
  graphql: "GQ",
  markdown: "MD",
  makefile: "MK",
  cmake: "CM",
  docker: "DK",
  dockerfile: "DK",
  nginx: "NG",
  apacheconf: "AC",
  protobuf: "PB",
  sql: "SQ",
  plsql: "SQ",
  scala: "Sc",
  scheme: "Sm",
  smalltalk: "ST",
  solidity: "So",
  haskell: "Hs",
  clojure: "Cl",
  elixir: "Ex",
  erlang: "Er",
  kotlin: "Kt",
  groovy: "Gr",
  julia: "Jl",
  matlab: "ML",
  latex: "Tx",
  tex: "Tx",
  r: "R",
};







const colorTable: Record<string, string> = {
  rust: "#CE422B",
  python: "#3776AB",
  javascript: "#F7DF1E",
  typescript: "#3178C6",
  jsx: "#61DAFB",
  tsx: "#3178C6",
  go: "#00ADD8",
  ruby: "#CC342D",
  java: "#E76F00",
  c: "#5C6BC0",
  cpp: "#00599C",
  csharp: "#68217A",
  fsharp: "#378BBA",
  php: "#777BB4",
  swift: "#FA7343",
  kotlin: "#7F52FF",
  scala: "#DC322F",
  haskell: "#5D4F85",
  lua: "#2C2D72",
  perl: "#39457E",
  r: "#276DC3",
  dart: "#0175C2",
  elixir: "#6E4A7E",
  erlang: "#A90533",
  clojure: "#5881D8",
  julia: "#9558B2",
  matlab: "#E16737",
  sql: "#E38C00",
  plsql: "#E38C00",
  bash: "#4EAA25",
  shell: "#4EAA25",
  sh: "#4EAA25",
  powershell: "#5391FE",
  yaml: "#CB171E",
  markdown: "#083FA1",
  css: "#663399",
  markup: "#E34F26",
  xml: "#005FAD",
  json: "#8A8A8A",
  docker: "#2496ED",
  dockerfile: "#2496ED",
  makefile: "#427819",
  cmake: "#064F8C",
  vim: "#019833",
  latex: "#008080",
  tex: "#008080",
  graphql: "#E10098",
  fortran: "#734F96",
  cobol: "#005CA9",
  nim: "#C8A200",
  zig: "#F7A41D",
  ocaml: "#EC6813",
  elm: "#60B5CC",
  crystal: "#333333",
  lisp: "#3FB68B",
  scheme: "#3FB68B",
  prolog: "#74283C",
  ada: "#02A95C",
  solidity: "#5C5C5C",
  toml: "#9C4121",
  sass: "#CC6699",
  scss: "#CC6699",
  less: "#1D365D",
  git: "#F05032",
  nginx: "#009639",
  protobuf: "#4285F4",
  awk: "#8B0000",
  groovy: "#4298B8",
  smalltalk: "#5C6BC0",
  vhdl: "#543978",
  verilog: "#B2A100",
  wasm: "#654FF0",
  ini: "#8A8A8A",
  diff: "#8A8A8A",
  http: "#8A8A8A",
  regex: "#8A8A8A",
  bnf: "#8A8A8A",
};








const middlePropertyColor = "#8A8A8A";


const brightBottomAboveOfCharacter = "#1A1A1A";
const darkBottomAboveOfCharacter = "#FFFFFF";












function correctCompareColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? brightBottomAboveOfCharacter : darkBottomAboveOfCharacter;
}


function shrinkWrite(lang: string): string {
  if (lang === NO_LANGUAGE) return "—";
  const writeDead = shrinkWriteTable[lang];
  if (writeDead) return writeDead;
  return lang.charAt(0).toUpperCase();
}













export function languageIcon(lang: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "nota-lang-icon";

  el.setAttribute("aria-hidden", "true");

  const drawBadge = () => {
    el.classList.remove("nota-lang-icon--logo");
    el.style.backgroundImage = "";
    el.textContent = shrinkWrite(lang);
    const color = colorTable[lang] ?? middlePropertyColor;
    el.style.setProperty("--nota-lang-color", color);
    el.style.setProperty("--nota-lang-on", correctCompareColor(color));
  };
  const drawLogo = (image: string) => {
    el.classList.add("nota-lang-icon--logo");
    el.style.backgroundImage = image;
    el.textContent = "";
  };

  const image = realLanguageIconURI(lang);
  if (image !== null) drawLogo(image);
  else {
    drawBadge();
    void ensureLanguageIcons()
      .then(() => {
        const later = realLanguageIconURI(lang);
        if (later !== null) drawLogo(later);
      })
      .catch((error: unknown) => {
        console.warn("[nota] language icons failed to load; using badges", error);
      });
  }
  return el;
}










export function hasDedicatedBelongIcon(lang: string): boolean {
  return hasLoadedLanguageIcon(lang);
}
