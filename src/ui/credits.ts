










































export interface SendThanksItem {
  name3: string;
  purpose: string;
  link: string;
  license: string;
}








export function sendThanksNameSingle(t: (key: string) => string): SendThanksItem[] {
  return [

    {
      name3: "Tauri",
      purpose: t("Desktop shell and windows"),
      link: "https://github.com/tauri-apps/tauri",
      license: "Apache-2.0 OR MIT",
    },
    {
      name3: "React",
      purpose: t("Interface"),
      link: "https://github.com/facebook/react",
      license: "MIT",
    },

    {
      name3: "Milkdown / ProseMirror",
      purpose: t("Editor core"),
      link: "https://github.com/Milkdown/milkdown",
      license: "MIT",
    },
    {


      name3: "CodeMirror",
      purpose: t("Code block editor"),
      link: "https://github.com/codemirror/dev",
      license: "MIT",
    },
    {

      name3: "Lezer",
      purpose: t("Syntax trees behind the code editor"),
      link: "https://github.com/lezer-parser/lezer",
      license: "MIT",
    },
    {
      name3: "CodeMirror Vim",
      purpose: t("Vim input in embedded source editors"),
      link: "https://github.com/replit/codemirror-vim",
      license: "MIT",
    },
    {


      name3: "Prism (refractor)",
      purpose: t("Syntax highlighting in the editor"),
      link: "https://github.com/wooorm/refractor",
      license: "MIT",
    },
    {
      name3: "mdast-util-math",
      purpose: t("Serialising math delimiters"),
      link: "https://github.com/syntax-tree/mdast-util-math",
      license: "MIT",
    },
    {
      name3: "KaTeX",
      purpose: t("Math typesetting"),
      link: "https://github.com/KaTeX/KaTeX",
      license: "MIT",
    },
    {





      name3: "Monoton",
      purpose: t("The “Nota” wordmark (vector outlines — no font file is shipped)"),
      link: "https://fonts.google.com/specimen/Monoton",
      license: "OFL-1.1",
    },
    {




      name3: "zspell",
      purpose: t("Spell checking engine"),
      link: "https://github.com/pluots/zspell",
      license: "Apache-2.0",
    },
    {
      name3: "Mermaid",
      purpose: t("Diagrams"),
      link: "https://github.com/mermaid-js/mermaid",
      license: "MIT",
    },
    {
      name3: "qrcode",
      purpose: t("Website QR codes in share images"),
      link: "https://github.com/soldair/node-qrcode",
      license: "MIT",
    },
    {



      name3: "vscode-icons",
      purpose: t("Language icons for code blocks"),
      link: "https://github.com/vscode-icons/vscode-icons",
      license: "MIT",
    },

    {
      name3: "mlua / Lua",
      purpose: t("Extension runtime"),
      link: "https://github.com/mlua-rs/mlua",
      license: "MIT",
    },
    {
      name3: "ureq",
      purpose: t("HTTP requests for extensions"),
      link: "https://github.com/algesten/ureq",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "rustls",
      purpose: t("TLS"),
      link: "https://github.com/rustls/rustls",
      license: "Apache-2.0 OR ISC OR MIT",
    },
    {
      name3: "ring",
      purpose: t("Cryptographic primitives"),
      link: "https://github.com/briansmith/ring",

      license: "Apache-2.0 AND ISC",
    },
    {
      name3: "webpki-roots",
      purpose: t("Trusted root certificates"),
      link: "https://github.com/rustls/webpki-roots",

      license: "CDLA-Permissive-2.0",
    },
    {
      name3: "ed25519-dalek",
      purpose: t("Verifying extension signatures"),
      link: "https://github.com/dalek-cryptography/curve25519-dalek/tree/main/ed25519-dalek",
      license: "BSD-3-Clause",
    },


    {
      name3: "serde / serde_json",
      purpose: t("Reading and writing data"),
      link: "https://github.com/serde-rs/serde",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "toml",
      purpose: t("Settings and extension manifests"),
      link: "https://github.com/toml-rs/toml",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "sha2",
      purpose: t("Hashes"),
      link: "https://github.com/RustCrypto/hashes",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "base64",
      purpose: t("Encoding"),
      link: "https://github.com/marshallpierce/rust-base64",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "chrono",
      purpose: t("Dates and times"),
      link: "https://github.com/chronotope/chrono",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "zip",
      purpose: t("Extension packages"),
      link: "https://github.com/zip-rs/zip2",
      license: "MIT",
    },
    {



      name3: "tauri-plugin-clipboard-manager",
      purpose: t("Reading the clipboard"),
      link: "https://github.com/tauri-apps/plugins-workspace",
      license: "Apache-2.0 OR MIT",
    },
    {
      name3: "dirs",
      purpose: t("Finding the system folders"),
      link: "https://github.com/soc/dirs-rs",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "thiserror",
      purpose: t("Error plumbing"),
      link: "https://github.com/dtolnay/thiserror",
      license: "MIT OR Apache-2.0",
    },


    {
      name3: "Pandoc",
      purpose: t("Export (external, optional)"),
      link: "https://github.com/jgm/pandoc",



      license: t("GPL-2.0-or-later (external program — Nota does not bundle it)"),
    },
    {





      name3: "SCOWL",
      purpose: t("Spell checking word lists"),
      link: "http://wordlist.aspell.net/",
      license: "MIT-like (see THIRD-PARTY.md §7)",
    },
  ];
}
