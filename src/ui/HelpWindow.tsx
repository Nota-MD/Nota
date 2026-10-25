/**
 * 独立帮助窗口。
 *
 * 帮助正文是一份编进应用的 Markdown，由正文同一个只读 Milkdown 实例渲染。
 * 因此标题、表格、代码块、字体与间距都跟随当前文档主题，不走第二套 HTML/CSS
 * 排版。英文原文是 `t()` 键，中文译文与其他界面文字共用 `i18n/zh-ui.ts`。
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { createEditor, type EditorHandle } from "@/editor/create";
import { setLanguage, useT } from "@/i18n";
import { applyTheme } from "@/styles/applyTheme";
import { applyDocTheme } from "@/styles/doc-theme";
import { DocumentTypographyVars } from "@/styles/doc-typography";
import { generateEffectOfDocumentTheme } from "@/ui/useDocTheme";
import { useUiMode } from "@/ui/useUiMode";

export const HELP_SECTIONS = ["start", "pandoc", "printing", "shortcuts"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

export function helpSectionFromHash(hash: string): HelpSection {
  const match = /^#help(?:\/([a-z-]+))?$/.exec(hash);
  const candidate = match?.[1];
  return HELP_SECTIONS.includes(candidate as HelpSection)
    ? (candidate as HelpSection)
    : "start";
}

export function buildHelpMarkdown(t: (text: string) => string): string {
  return `# ${t("Nota Help")}

${t("Essential guidance for writing, export, printing, and common problems.")}

## ${t("Getting started")}

${t("Use File to create, open, and save documents. Opening a folder adds its file tree and the current document outline to the sidebar.")}

- ${t("Interface themes change the application. Document themes change only the editor.")}
- ${t("Markdown supports GitHub Flavored Markdown, tables, task lists, footnotes, alerts, KaTeX, and Mermaid.")}
- ${t("Plugin installation and plugin-specific setup belong to the extension's own documentation.")}

## ${t("Pandoc and TeX")}

${t("Pandoc is not bundled with Nota. It is required for Word, OpenDocument, RTF, LaTeX, EPUB, and OPML import or export, plus Pandoc PDF export. HTML export, built-in PDF, and in-app printing do not need it.")}

\`\`\`text
# Windows
winget install --id JohnMacFarlane.Pandoc -e

# macOS
brew install pandoc

# Debian / Ubuntu
sudo apt install pandoc

# Fedora
sudo dnf install pandoc

# Arch Linux
sudo pacman -S pandoc
\`\`\`

${t("Pandoc PDF also needs a TeX engine such as xelatex. Restart Nota after installation. For a custom location, set NOTA_PANDOC_CMD before starting Nota.")}

## ${t("Printing")}

${t("On Linux, Nota connects directly to CUPS and does not require the lpstat or lp command-line clients.")}

${t("If CUPS is unavailable or no printer is configured, use System Print or export a PDF. Printing and PDF export require a light document theme.")}

## ${t("Keyboard shortcuts")}

| ${t("Action")} | ${t("Shortcut")} |
| --- | --- |
| ${t("Open")} | \`Ctrl+O\` |
| ${t("Save")} | \`Ctrl+S\` |
| ${t("Find")} | \`Ctrl+F\` |
| ${t("Print")} | \`Ctrl+P\` |
| ${t("Settings")} | \`Ctrl+,\` |

${t("The complete list and custom bindings are in Settings → Shortcuts.")}
`;
}

export function HelpWindow() {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section] = useState<HelpSection>(() => helpSectionFromHash(location.hash));
  const mode = useUiMode(settings?.ui_mode ?? "auto");

  useEffect(() => {
    let alive = true;
    void Promise.all([api.appLang(), api.settings.get()])
      .then(([lang, next]) => {
        if (!alive) return;
        setLanguage(lang.effective);
        applyTheme(next);
        setSettings(next);
        document.title = t("Nota Help");
        setReady(true);
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) document.documentElement.dataset.booted = "true";
      });
    return () => {
      alive = false;
    };
  }, [t]);

  useEffect(() => {
    if (!settings) return;
    let alive = true;
    const id = generateEffectOfDocumentTheme(settings, mode);
    void (id ? api.theme.css(id) : Promise.resolve(null))
      .then((css) => {
        if (alive) applyDocTheme(css);
      })
      .catch(() => {
        if (alive) applyDocTheme(null);
      });
    return () => {
      alive = false;
    };
  }, [settings, mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (!ready || error || !root) return;
    let alive = true;
    void createEditor({
      root,
      initialMarkdown: buildHelpMarkdown(t),
      readOnly: true,
    })
      .then((handle) => {
        if (!alive) {
          handle.destroy();
          return;
        }
        editorRef.current = handle;
        requestAnimationFrame(() => {
          const title = t(sectionTitle(section));
          const heading = [...root.querySelectorAll("h1, h2, h3")].find(
            (node) => node.textContent?.trim() === title,
          );
          heading?.scrollIntoView({ block: "start" });
        });
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [error, ready, section, t]);

  return (
    <main className="help-window">
      {error ? (
        <p className="help-window-error">{t("Could not open help: {0}", error)}</p>
      ) : (
        <>
          {!ready && <p className="help-window-loading">{t("Loading…")}</p>}
          <div
            className="editor-pane help-editor-pane"
            style={DocumentTypographyVars(settings?.document) as CSSProperties}
          >
            <div
              ref={rootRef}
              className="editor-mount help-editor-mount"
              aria-readonly="true"
              aria-label={t("Nota Help")}
            />
          </div>
        </>
      )}
    </main>
  );
}

function sectionTitle(id: HelpSection): string {
  switch (id) {
    case "pandoc":
      return "Pandoc and TeX";
    case "printing":
      return "Printing";
    case "shortcuts":
      return "Keyboard shortcuts";
    default:
      return "Nota Help";
  }
}
