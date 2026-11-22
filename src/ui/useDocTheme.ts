



















import { useCallback, useEffect } from "react";

import { api, events, on, type DocThemeInfo, type Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  characterBodyCanUse,
  canSelectCharacterBody,
  declaredThemeFamilies,
} from "@/ui/font-check";
import type { Dialogs } from "@/ui/useDialogs";
import {
  applyDocTheme,
  scheduleAdaptiveSelectionTheme,
} from "@/styles/doc-theme";
import type { Toast } from "@/ui/Toasts";
import { useUiMode } from "@/ui/useUiMode";
import { debugError, debugEvent } from "@/ui/debug-log";
import { markDocumentThemeReady } from "@/ui/useBootReveal";



















export interface themeSlot {

  id: string;

  write: (newValueid: string) => void;
}

export function useDocThemeSlot(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): themeSlot {
  const mode = useUiMode(settings?.ui_mode ?? "auto");
  const darkThatValueSetAtGenerateEffect = darkDedicatedUseAtGenerateEffect(settings, mode);

  const id = generateEffectOfDocumentTheme(settings, mode);
  const a = settings?.appearance ?? null;

  const write = useCallback(
    (newValueid: string) => {
      if (darkThatValueSetAtGenerateEffect && a) {
        void updateSettings({ appearance: { ...a, dark_document_theme: newValueid } });
      } else {
        void updateSettings({ document_theme: newValueid });
      }
    },
    [darkThatValueSetAtGenerateEffect, a, updateSettings],
  );

  return { id, write };
}









export function darkDedicatedUseAtGenerateEffect(settings: Settings | null, mode: "light" | "dark"): boolean {
  const a = settings?.appearance;
  return !!a && a.dark_theme_separate && a.dark_document_theme !== "" && mode === "dark";
}








export function generateEffectOfDocumentTheme(settings: Settings | null, _Mode: "light" | "dark"): string {
  if (darkDedicatedUseAtGenerateEffect(settings, _Mode)) return settings?.appearance.dark_document_theme ?? "";
  return settings?.document_theme ?? "";
}

export interface themeWiring {

  themeId: string;

  writeTheme: (id: string) => void;







  themes: DocThemeInfo[];






  heavyScan: () => void;
  toast: (message: string, level?: Toast["level"]) => void;




  askConfirm: Dialogs["askConfirm"];
}

export interface themeApi {

  pickTheme: (id: string) => void;

  openThemesDir: () => Promise<void>;
}






const sayPassOfMissingCharacterBody = new Set<string>();

function deferUntilWindowIdle(task: () => void): () => void {
  let cancelled = false;
  let timer = 0;
  let idle = 0;
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const run = () => {
    if (cancelled) return;
    if (idleWindow.requestIdleCallback) {
      idle = idleWindow.requestIdleCallback(() => {
        if (!cancelled) task();
      }, { timeout: 500 });
      return;
    }
    timer = window.setTimeout(() => {
      if (!cancelled) task();
    }, 120);
  };
  const onShown = () => run();

  if (document.documentElement.dataset.windowShown === "true") {
    run();
  } else {
    window.addEventListener("nota-window-shown", onShown, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener("nota-window-shown", onShown);
    if (timer) window.clearTimeout(timer);
    if (idle) idleWindow.cancelIdleCallback?.(idle);
  };
}

export function useDocTheme(w: themeWiring): themeApi {


  const t = useT();
  const { themeId, writeTheme, themes, heavyScan, toast, askConfirm } = w;

  useEffect(() => {
    scheduleAdaptiveSelectionTheme();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => scheduleAdaptiveSelectionTheme();
    media.addEventListener("change", refresh);
    const appearance = new MutationObserver(refresh);
    appearance.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-mode", "data-ui-style"],
    });
    return () => {
      media.removeEventListener("change", refresh);
      appearance.disconnect();
    };
  }, []);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    void on<{ css: string }>(events.devBridgeTheme, (payload) => {
      applyDocTheme(payload.css);
      debugEvent("theme", "developer bridge theme applied", {
        css_bytes: payload.css.length,
      });
    }).then((unlisten) => {
      dispose = unlisten;
    });
    return () => {
      dispose?.();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let stopFontAudit: (() => void) | null = null;

    (async () => {
      try {

        const css = themeId ? await api.theme.css(themeId) : null;
        const declaredFamilies = css ? declaredThemeFamilies(css) : [];
        if (alive) {
          applyDocTheme(css);
          debugEvent("theme", "document theme applied", {
            theme: themeId || "none",
            css_bytes: css?.length ?? 0,
          });
          // Font diagnostics must not compete with editor construction before reveal.
          stopFontAudit = deferUntilWindowIdle(() => {
            if (!alive) return;
            void Promise.allSettled(
              declaredFamilies.map((family) => document.fonts.load(`16px "${family}"`)),
            ).then(() => document.fonts.ready).then(() => {
              if (!alive) return;
              const body = document.querySelector<HTMLElement>(".ProseMirror");
              const families = Array.from(document.fonts)
                .map((font) => font.family.replace(/^["']|["']$/g, ""))
                .filter((family, index, all) => all.indexOf(family) === index);
              const fontStatuses = Array.from(document.fonts)
                .filter((font) => !font.family.startsWith("KaTeX_"))
                .map((font) => `${font.family}:${font.status}`)
                .join(",");
              debugEvent("theme", "document theme font state", {
                theme: themeId || "none",
                computed_family: body ? getComputedStyle(body).fontFamily : "",
                font_faces: document.fonts.size,
                font_statuses: fontStatuses,
                available_families: families
                  .filter((family) => document.fonts.check(`16px "${family}"`))
                  .join(","),
              });
            });
          });
        }








        const declared = new Set(declaredFamilies);
        const candidate = css
          ? canSelectCharacterBody(css).filter((family) => !declared.has(family))
          : [];
        const first = candidate[0] ?? null;
        if (alive && first && !candidate.some(characterBodyCanUse)) {
          const key = `${themeId}|${first}`;
          if (!sayPassOfMissingCharacterBody.has(key)) {
            sayPassOfMissingCharacterBody.add(key);
            const name3 = themes.find((x) => x.id === themeId)?.name ?? themeId;
            void askConfirm({
              title: t("Missing font"),
              message: t(
                "The “{0}” theme prefers “{1}”, which is not installed on this machine. The editor is using a fallback font.",
                name3,
                first,
              ),
              confirmLabel: t("OK"),
              hideCancel: true,
            });
          }
        }
      } catch (e) {



        if (alive) {
          debugError("theme", "document theme failed", e, { theme: themeId || "none" });
        }
      } finally {
        // CSS injection is synchronous. This signal means the window no longer
        // has to guess whether it would flash an unstyled document.
        if (alive) markDocumentThemeReady();
      }
    })();



    return () => {
      alive = false;
      stopFontAudit?.();
    };
  }, [themeId, themes, askConfirm, t]);

  const pickTheme = useCallback(
    (id: string) => {



      writeTheme(id);


      const name = id ? (themes.find((x) => x.id === id)?.name ?? id) : "";
      toast(name ? t("Document theme switched to “{0}”", name) : t("Document theme turned off."), "success");
    },
    [writeTheme, toast, themes],
  );

  const openThemesDir = useCallback(async () => {
    try {




      await api.theme.openDir();



      heavyScan();
    } catch (e) {
      toast(t("Could not open the themes folder: {0}", String(e)), "error");
    }
  }, [toast, heavyScan]);

  return { pickTheme, openThemesDir };
}
