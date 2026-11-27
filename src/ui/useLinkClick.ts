




























import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { RefObject } from "react";

import { DangerousProtocol, NormalizeBrowserUrl } from "@/editor/url-link";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { Dialogs } from "@/ui/useDialogs";
import type { Toast } from "@/ui/Toasts";
import { useT } from "@/i18n";
import { localLocalImageSliceAbsoluteCorrectPath } from "@/editor/video-view";
import { anchor } from "@/editor/toc";


export interface LinkTarget {
  label: string;
  href: string;
}








export function findLink(node: Node | null): LinkTarget | null {
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const anchor2 = element?.closest("a[href]") ?? null;
  if (!anchor2) return null;

  if (!anchor2.closest('[contenteditable="true"]')) return null;
  return { label: anchor2.textContent ?? "", href: anchor2.getAttribute("href") ?? "" };
}


export function cursorPlaceThatItemLink(): LinkTarget | null {
  return findLink(typeof window === "undefined" ? null : (window.getSelection()?.anchorNode ?? null));
}


export interface PointLinkWiring {

  mainArea: RefObject<HTMLElement | null>;

  askLink: Dialogs["askLink"];

  runCommand: (c: EditorCommand, payload?: CommandPayload) => void;

  toast: (message: string, level?: Toast["level"]) => void;

  openDocument: (path: string) => Promise<boolean>;

  documentPath: string | null;
  /** Let a click place the caret in the link instead of opening the link dialog. */
  keyboardExperience: boolean;
}

function openRawHtmlLink(
  href: string,
  documentPath: string | null,
  openDocument: (path: string) => Promise<boolean>,
  toast: (message: string, level?: Toast["level"]) => void,
  t: (source: string, ...parameter: (string | number)[]) => string,
): void {
  const address = href.trim();
  if (!address || DangerousProtocol(address)) return;
  if (address.startsWith("#")) return;
  const browserUrl = NormalizeBrowserUrl(address);
  if (browserUrl) {
    void openUrl(browserUrl).catch((err: unknown) =>
      toast(t("Could not open the browser: {0}", String(err)), "error"),
    );
    return;
  }

  const localLocal = localLocalImageSliceAbsoluteCorrectPath(address, documentPath);
  if (localLocal) void openDocument(localLocal);
}







export function jumpToInternalAnchor(
  host: HTMLElement | null,
  rawHref: string,
): boolean {
  if (!host || !rawHref.startsWith("#")) return false;
  let id = rawHref.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {

  }
  if (!id) return false;
  const root = host.querySelector(".ProseMirror");
  if (!root) return false;
  let target = Array.from(root.querySelectorAll("[name]")).find(
    (element) => element.getAttribute("name") === id,
  );
  if (!target) {
    const used = new Set<string>();
    for (const heading of Array.from(
      root.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    )) {
      if (anchor(heading.textContent ?? "", used) === id) {
        target = heading;
        break;
      }
    }
  }
  if (!target) return false;
  target.scrollIntoView({ block: "start" });
  target.classList.remove("nota-anchor-flash");
  void target.getBoundingClientRect();
  target.classList.add("nota-anchor-flash");
  window.setTimeout(() => target?.classList.remove("nota-anchor-flash"), 900);
  return true;
}

export function usePointLink({
  mainArea,
  askLink,
  runCommand,
  toast,
  openDocument,
  documentPath,
  keyboardExperience,
}: PointLinkWiring): void {


  const t = useT();




  useEffect(() => {
    const host = mainArea.current;
    if (!host) return;

    const pointHit = (e: MouseEvent) => {
      const chain = findLink(e.target as Node | null);
      if (!chain) return;
      const element =
        (e.target as Node | null)?.nodeType === Node.ELEMENT_NODE
          ? (e.target as Element)
          : (e.target as Node | null)?.parentElement;
      if (chain.href.trim().startsWith("#")) {
        e.preventDefault();
        if (jumpToInternalAnchor(mainArea.current, chain.href.trim())) return;
      }
      if (element?.closest('[data-type="html-block"]')) {
        e.preventDefault();
        openRawHtmlLink(chain.href, documentPath, openDocument, toast, t);
        return;
      }

      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const browserUrl = NormalizeBrowserUrl(chain.href);
        if (!browserUrl) return;
        void openUrl(browserUrl).catch((err: unknown) =>
          toast(t("Could not open the browser: {0}", String(err)), "error"),
        );
        return;
      }

      // In keyboard-optimized mode an ordinary click behaves like placing the
      // caret at the link boundary: the source reveal is driven by the editor
      // selection, so opening a modal here would interrupt that interaction.
      if (keyboardExperience) return;

      void (async () => {
        const answer = await askLink({ label: chain.label, href: chain.href, editing: true });
        if (!answer) return;
        if (answer.kind === "remove") runCommand("linkRemove");
        else runCommand("linkSet", { href: answer.href, label: answer.label });
      })();
    };

    host.addEventListener("click", pointHit);
    return () => host.removeEventListener("click", pointHit);
  }, [mainArea, askLink, runCommand, toast, openDocument, documentPath, keyboardExperience, t]);
}
