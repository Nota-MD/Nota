











































import type { Settings, UiMode, UiStyle } from "@/bridge/ipc";
import { accentVars } from "./accent";


function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveMode(mode: UiMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function resolveStyle(style: UiStyle): string {

  return style === "auto" ? "adwaita" : style;
}


export function applyTheme(settings: Settings): () => void {
  const root = document.documentElement;

  const paint = () => {
    root.dataset.uiStyle = resolveStyle(settings.ui_style);
    root.dataset.uiMode = resolveMode(settings.ui_mode);




    const customEditorFont = settings.appearance.custom_font_size;



    root.dataset.editorFontSize = customEditorFont ? "custom" : "auto";
    if (customEditorFont) {
      root.style.setProperty("--editor-font-size", `${settings.ui_font_size}px`);
    } else {
      root.style.removeProperty("--editor-font-size");
    }





    //


    //





    const strongConfigure = accentVars(settings.appearance.accent);
    if (strongConfigure) {
      // Imported UI themes load after the built-in sheet. Keep the user's accent
      // above their root declarations, including themes that mark tokens important.
      for (const [changeMeasure, value2] of Object.entries(strongConfigure)) {
        root.style.setProperty(changeMeasure, value2, "important");
      }
    } else {



      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-fg");
      root.style.removeProperty("--switch-on");
    }




    //


    //


    if (settings.editor.paragraph_indent) {
      const width = Math.min(8, Math.max(1, Math.round(settings.editor.paragraph_indent_chars)));
      root.style.setProperty("--para-indent", `${width}em`);
    } else {
      root.style.removeProperty("--para-indent");
    }



    //



    //



    //







    const originalWidth = settings.appearance.sidebar_width;
    const sideBarWidth = Number.isFinite(originalWidth)
      ? Math.min(480, Math.max(180, Math.round(originalWidth)))
      : 240;
    root.style.setProperty("--sidebar-width", `${sideBarWidth}px`);



    const originalRight = settings.appearance.dock_width;
    const rightBarWidth = Number.isFinite(originalRight)
      ? Math.min(560, Math.max(200, Math.round(originalRight)))
      : 260;
    root.style.setProperty("--dock-width", `${rightBarWidth}px`);
  };

  paint();


  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (settings.ui_mode === "auto" && mq) {
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }

  return () => {};
}
