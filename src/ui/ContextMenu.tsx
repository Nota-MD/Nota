























































import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { writeClipboard } from "@/editor/code-block";
import type { CommandState } from "@/editor/command-state";
import { useT } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { getItem } from "@/ui/commands";
import { popupSelfSelfAtRoll } from "@/ui/popup-scroll";
import { api } from "@/bridge/ipc";
import {
  currentLanguageLabel,
} from "@/editor/spell-check";
import {
  buildRows,
  tableActionPrefix,
  inlineBelowValueCell,
  determineDropPoint,
  wholeLineDisabled,
  disabledForLocation,
  type line3,
  type DropPoint,
} from "@/ui/context-menu";
import {
  dropToCombineWrite,
  type CombineWriteScene,
} from "@/ui/context-menu-spell";
import { pressButtonTable, isButtonActive, notice, characterShapeClass } from "@/ui/FormatBar";
import { Icon, type iconName } from "@/ui/Icon";
import { SubMenu } from "@/ui/MenuPopup";
import type { Toast } from "@/ui/Toasts";
import { findEdgeEnabled, useMenuRovingFocus } from "@/ui/useMenuRovingFocus";


type FlipTranslate = ReturnType<typeof useT>;








const cutPasteBoardIcon: Record<string, iconName> = {
  "edit.cut": "folio-edit-cut-symbolic",
  "edit.copy": "folio-edit-copy-symbolic",
  "edit.paste": "folio-edit-paste-symbolic",



  "edit.delete": "folio-delete-symbolic",
};








function getIcon(id: string): iconName | undefined {
  return pressButtonTable.get(id)?.icon ?? cutPasteBoardIcon[id];
}








function getCharacterShape(id: string): string {
  return pressButtonTable.get(id)?.label ?? getItem(id)?.label ?? "?";
}




interface InputBoxScene {
  element: HTMLInputElement | HTMLTextAreaElement;









  start5: number | null;
  end2: number | null;
}
















function returnFocus(scene2: InputBoxScene): boolean {
  if (!scene2.element.isConnected) return false;
  if (document.activeElement !== scene2.element) scene2.element.focus();


  if (scene2.start5 !== null && scene2.end2 !== null) {
    try {
      scene2.element.setSelectionRange(scene2.start5, scene2.end2);
    } catch {


    }
  }
  return document.activeElement === scene2.element;
}


function selectedDone(scene2: InputBoxScene): { text4: string; start5: number; end2: number } | null {
  const a = scene2.element.selectionStart;
  const b = scene2.element.selectionEnd;
  if (a === null || b === null || a === b) return null;
  return { text4: scene2.element.value.slice(a, b), start5: a, end2: b };
}








function replaceRemove(scene2: InputBoxScene, text4: string, start5: number, end2: number): void {



  if (!returnFocus(scene2)) return;
  scene2.element.setRangeText(text4, start5, end2, "end");
  scene2.element.dispatchEvent(new Event("input", { bubbles: true }));
}













async function dropToInputBox(id: string, scene2: InputBoxScene, t: FlipTranslate, toast: notice): Promise<void> {
  switch (id) {
    case "edit.undo":
    case "edit.redo":
    case "edit.select": {


      if (!returnFocus(scene2)) return;
      const command = id === "edit.undo" ? "undo" : id === "edit.redo" ? "redo" : "selectAll";




      document.execCommand(command);
      return;
    }
    case "edit.copy": {
      const s = selectedDone(scene2);
      if (!s) {
        toast(t("Select some text first."), "info");
        return;
      }
      const become = await writeClipboard(s.text4);
      toast(become ? t("Copied to clipboard") : t("Could not copy: the system refused to write to the clipboard."), become ? "success" : "error");
      return;
    }
    case "edit.cut": {
      const s = selectedDone(scene2);
      if (!s) {
        toast(t("Select some text first."), "info");
        return;
      }


      const become = await writeClipboard(s.text4);
      if (!become) {
        toast(t("Could not copy: the system refused to write to the clipboard."), "error");
        return;
      }
      replaceRemove(scene2, "", s.start5, s.end2);
      return;
    }
    case "edit.paste": {
      if (!returnFocus(scene2)) return;
      let text4: string;


      try {
        text4 = await navigator.clipboard.readText();
      } catch {
        toast(t("The system does not allow reading the clipboard from the menu — press Ctrl+V to paste."), "warn");
        return;
      }
      if (!text4) {
        toast(t("There is no text in the clipboard."), "info");
        return;
      }
      replaceRemove(scene2, text4, scene2.element.selectionStart ?? 0, scene2.element.selectionEnd ?? 0);
      return;
    }
    default:
      return;
  }
}


type notice = (message: string, level?: Toast["level"]) => void;



interface PanelWiring {
  line3: line3[];

  DropPoint: { top: number; left: number };

  disabled2: ReadonlySet<string>;

  check: Record<string, boolean>;

  cursor: CommandState | null;

  onPick: (id: string) => void;

  onDismiss: () => void;

  label: string;
}

function ContextMenuPanel(p: PanelWiring) {
  const { line3: rows, DropPoint, disabled2, check, cursor, onPick, onDismiss, label } = p;
  const t = useT();








  const { item, belowMark } = useMemo(() => {
    const item: line3[] = [];
    const belowMark = new Map<string, number>();
    for (const r of rows) {
      if (r.kind === "sep") continue;
      belowMark.set(r.key, item.length);
      item.push(r);
    }
    return { item, belowMark };
  }, [rows]);


  const [InlinePosition, setInlinePosition] = useState<Record<string, number>>({});

  const [childOpen, setChildOpen] = useState<number | null>(null);
  const [childAnchor, setChildAnchor] = useState<{
    top: number;
    left: number;
    parentLeft: number;
  } | null>(null);

  const panel = useRef<HTMLDivElement>(null);
  const lineButton = useRef(new Map<string, HTMLElement | null>());
  const cellButton = useRef(new Map<string, HTMLButtonElement | null>());







  const focusPoint = useRef(-1);

  const [position2, setPosition] = useState(DropPoint);



  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    setPosition({
      top: Math.max(8, Math.min(DropPoint.top, window.innerHeight - el.offsetHeight - 8)),
      left: Math.max(8, Math.min(DropPoint.left, window.innerWidth - el.offsetWidth - 8)),
    });
  }, [DropPoint]);


  function inlineDropPoint(r: line3): number {
    if (r.kind !== "icons") return -1;
    const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
    const already = InlinePosition[r.key];
    if (already !== undefined && !canUse[already]?.disabled) return already;
    return findEdgeEnabled(canUse, 1);
  }


  function dropCell(r: line3, cell2: number): void {
    if (r.kind !== "icons") return;
    setInlinePosition((m) => ({ ...m, [r.key]: cell2 }));



    cellButton.current.get(`${r.key}:${cell2}`)?.focus();
  }

  function closeChildren(): void {
    setChildOpen(null);
    setChildAnchor(null);
  }


  function openChild(rowIndex: number): void {
    const r = item[rowIndex];
    if (!r || r.kind !== "item" || !r.spec.submenu) return;
    const el = lineButton.current.get(r.key);
    if (!el) return;
    const b = el.getBoundingClientRect();


    setChildAnchor({ top: b.top, left: b.right - 4, parentLeft: b.left });
    setChildOpen(rowIndex);
  }

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: item.map((r) => ({ disabled: wholeLineDisabled(r, disabled2) })),
    onActivate: (_it, i) => {
      const r = item[i];
      if (!r) return;
      if (r.kind === "icons") {
        const id = r.ids[inlineDropPoint(r)];
        if (id && !disabled2.has(id)) onPick(id);
        return;
      }



      if (r.kind !== "item") return;
      if (r.spec.submenu) {

        if (childOpen === i) closeChildren();
        else openChild(i);
        return;
      }
      if (!disabled2.has(r.spec.id)) onPick(r.spec.id);
    },
    onDismiss,
    onRight: (_it, i) => {
      const r = item[i];
      if (!r) return;
      if (r.kind === "icons") {
        const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
        const current = inlineDropPoint(r);
        const belowValueCell = inlineBelowValueCell(canUse, current, 1);
        if (belowValueCell !== current) dropCell(r, belowValueCell);
        return;
      }
      if (r.kind !== "item") return;
      if (r.spec.submenu) openChild(i);
    },
    onLeft: () => {

      const r = item[focusPoint.current];
      if (!r || r.kind !== "icons") return;
      const canUse = r.ids.map((id) => ({ disabled: disabled2.has(id) }));
      const current = inlineDropPoint(r);
      const aboveValueCell = inlineBelowValueCell(canUse, current, -1);
      if (aboveValueCell !== current) dropCell(r, aboveValueCell);
    },
  });
  focusPoint.current = roving.focusedIndex;

  return (
    <div
      ref={panel}








      className="menu-sub context-menu"
      data-context-menu=""
      role="menu"
      aria-label={label}
      style={{ top: position2.top, left: position2.left }}
      onKeyDown={roving.handleKeyDown}
    >
      {rows.map((r) => {
        if (r.kind === "sep") {
          return <div className="menu-sep" key={r.key} role="separator" />;
        }

        const index = belowMark.get(r.key) ?? -1;

        if (r.kind === "icons") {
          const current = inlineDropPoint(r);
          return (
            <div
              className="menu-icon-row"
              key={r.key}
              role="group"
              ref={(n) => {
                lineButton.current.set(r.key, n);
              }}
            >
              {r.ids.map((id, i) => {
                const spec = getItem(id);
                const PressButton = pressButtonTable.get(id);
                const shape = getIcon(id);
                const thisDisabled = disabled2.has(id);
                const isCurrent = i === current;







                const isFocusPointLine = roving.focusedIndex === index;

                const roamNavigate = isCurrent ? roving.itemProps(index) : null;
                const name2 = spec ? t(spec.label) : id;



                const noticeLanguage = notice(id, name2);
                return (
                  <button
                    key={id}
                    type="button"
                    className="format-btn"


                    data-on={PressButton ? isButtonActive(PressButton, cursor) : false}
                    data-current={isFocusPointLine && isCurrent ? true : undefined}
                    disabled={thisDisabled}
                    tabIndex={roamNavigate ? roamNavigate.tabIndex : -1}
                    title={noticeLanguage}


                    aria-label={noticeLanguage}
                    ref={(n) => {
                      cellButton.current.set(`${r.key}:${i}`, n);
                      if (isCurrent) roving.registerItem(index, n);
                    }}
                    onFocus={roamNavigate?.onFocus}
                    onMouseEnter={() => {
                      if (thisDisabled) return;
                      roving.setFocusedIndex(index);
                      setInlinePosition((m) => ({ ...m, [r.key]: i }));
                      cellButton.current.get(`${r.key}:${i}`)?.focus();
                    }}


                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!thisDisabled) onPick(id);
                    }}
                  >
                    {shape ? (
                      <Icon name={shape} />
                    ) : (


                      <span className={characterShapeClass(id)}>{getCharacterShape(id)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        }

        const thisDisabled = wholeLineDisabled(r, disabled2);
        const isChildOpen = childOpen === index;





        const isFocusPoint = roving.focusedIndex === index;
        const roamNavigate = roving.itemProps(index);




        if (r.kind === "spell") {
          return (
            <div className="menu-item-root" key={r.key}>
              <button
                type="button"
                role="menuitem"
                className={`menu-item ${isFocusPoint ? "menu-item-open" : ""}`}
                tabIndex={roamNavigate.tabIndex}
                ref={(n) => {
                  lineButton.current.set(r.key, n);
                  roving.registerItem(index, n);
                }}
                onFocus={roamNavigate.onFocus}
                onMouseEnter={() => {
                  roamNavigate.onMouseEnter();
                  closeChildren();
                }}


                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(r.id)}
              >
                <span className="menu-check" />
                <span className="menu-label">{r.label}</span>
                <span className="menu-arrow" />
              </button>
            </div>
          );
        }



        if (r.kind !== "item") return null;
        return (
          <div className="menu-item-root" key={r.key}>
            <button
              type="button"
              role="menuitem"
              className={`menu-item ${r.spec.danger ? "menu-item-danger" : ""} ${isChildOpen || isFocusPoint ? "menu-item-open" : ""}`}
              disabled={thisDisabled}
              aria-checked={r.spec.checkable ? !!check[r.spec.id] : undefined}
              aria-haspopup={r.spec.submenu ? "menu" : undefined}
              aria-expanded={r.spec.submenu ? isChildOpen : undefined}
              tabIndex={roamNavigate.tabIndex}
              ref={(n) => {
                lineButton.current.set(r.key, n);
                roving.registerItem(index, n);
              }}
              onFocus={roamNavigate.onFocus}
              onMouseEnter={() => {
                roamNavigate.onMouseEnter();

                if (r.spec.submenu) openChild(index);
                else closeChildren();
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (r.spec.submenu) {
                  if (isChildOpen) closeChildren();
                  else openChild(index);
                  return;
                }
                if (!thisDisabled) onPick(r.spec.id);
              }}
            >
              <span className="menu-check">{r.spec.checkable && check[r.spec.id] ? "✓" : ""}</span>
              <span className="menu-label">{t(r.spec.label)}</span>

              {r.spec.accel && !thisDisabled && (
                <span className="menu-accel">{formatAccel(r.spec.accel)}</span>
              )}
              <span className="menu-arrow">{r.spec.submenu ? "▸" : ""}</span>
            </button>

            {r.spec.submenu &&
              isChildOpen &&
              childAnchor &&
              createPortal(
                <div data-context-menu="">
                  <SubMenu
                    entries={r.spec.submenu}
                    disabled={new Set(disabled2) as Set<string>}
                    checks={check}
                    onPick={onPick}
                    onDismiss={onDismiss}
                    onClose={closeChildren}
                    anchor={childAnchor}


                    className="context-sub"
                  />
                </div>,
                document.body,
              )}
          </div>
        );
      })}
    </div>
  );
}



export interface contextMenuWiring {








  commandTable: Record<string, (() => void) | undefined>;

  disabled2: ReadonlySet<string>;

  check: Record<string, boolean>;

  cursor: CommandState | null;

  toast: notice;

  copyImage: (image: HTMLImageElement) => Promise<void>;

  developerMode: boolean;
  tableActions: readonly import("@/bridge/ipc").TableContextAction[];
  onTableAction: (plugin: string, command: string, actionId: string) => void;
}


interface isOpen {
  position2: { top: number; left: number };
  line3: line3[];








  DropPoint: DropPoint;

  scene2: InputBoxScene | null;

  image: HTMLImageElement | null;










  combineWrite: CombineWriteScene | null;
}


















export function ContextMenu(wiring: contextMenuWiring) {
  const {
    commandTable,
    disabled2,
    check,
    cursor,
    toast,
    copyImage,
    developerMode,
    tableActions,
    onTableAction,
  } = wiring;
  const t = useT();
  const [open2, setOpen] = useState<isOpen | null>(null);











  const originalFocusPoint = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const listen = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || typeof el.closest !== "function") return;

      const drop = determineDropPoint({


        alreadyIsRecognizeLead: Boolean(el.closest(".tabbar")),
        isInputBox: Boolean(el.closest("input, textarea")),
        atEditorInside: Boolean(el.closest(".ProseMirror, .cm-editor, .editor-pane")),
      });



      if (drop === "no menu") return;


      e.preventDefault();



      const combineWriteElement = el.closest(".nota-spell-error") as HTMLElement | null;
      const combineWriteWord = combineWriteElement?.textContent?.trim() ?? "";
      const CombineWriteLineSearch =
        combineWriteElement && combineWriteWord !== ""
          ? { createProposalPlural: [] as string[], addWordDictionary: t("Add to dictionary"), ignoreOmit: t("Ignore") }
          : null;

      const contextImage = el.closest("img");
      const onImage = contextImage instanceof HTMLImageElement ? contextImage : null;
      const onTable = Boolean(el.closest(".ProseMirror table"));
      const hasSelection = cursor?.hasSelection ?? Boolean(window.getSelection()?.toString());
      const rows = buildRows(
        drop,
        developerMode,
        CombineWriteLineSearch,
        Boolean(onImage),
        hasSelection,
        tableActions,
        onTable,
      );

      if (rows.length === 0) return setOpen(null);

      let scene2: InputBoxScene | null = null;
      if (drop === "Input") {
        const box2 = el.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;

        scene2 = box2 ? { element: box2, start5: box2.selectionStart, end2: box2.selectionEnd } : null;
      }




      originalFocusPoint.current = scene2
        ? scene2.element
        : ((el.closest(".ProseMirror, .cm-editor") as HTMLElement | null) ?? null);

      const scene: CombineWriteScene | null =
        combineWriteElement && combineWriteWord !== "" ? { element: combineWriteElement, word: combineWriteWord, createProposalPlural: [] } : null;

      setOpen({
        position2: { top: e.clientY, left: e.clientX },
        line3: rows,
        DropPoint: drop,
        scene2,
        image: onImage,
        combineWrite: scene,
      });





      if (scene) {
        void api.spell
          .suggest(currentLanguageLabel(), scene.word)
          .then((createProposalPlural) => {
            setOpen((oldValue) => {
              if (!oldValue?.combineWrite) return oldValue;
              const newValueCombineWrite = { ...oldValue.combineWrite, createProposalPlural };
              return {
                ...oldValue,
                combineWrite: newValueCombineWrite,
                line3: buildRows(
                  oldValue.DropPoint,
                  import.meta.env.DEV,
                  { createProposalPlural, addWordDictionary: t("Add to dictionary"), ignoreOmit: t("Ignore") },
                  false,
                  hasSelection,
                  tableActions,
                  onTable,
                ),
              };
            });
          })
          .catch(() => {

          });
      }
    };
    window.addEventListener("contextmenu", listen, true);
    return () => window.removeEventListener("contextmenu", listen, true);




  }, [developerMode, tableActions]);

  const collapse = useCallback(() => {
    setOpen(null);





    const who = originalFocusPoint.current;
    originalFocusPoint.current = null;
    if (who && who.isConnected && document.activeElement !== who) who.focus();
  }, []);

  const select = useCallback(
    (id: string) => {
      const thisOneDocument = open2;
      collapse();
      if (!thisOneDocument) return;

      if (thisOneDocument.scene2) {
        void dropToInputBox(id, thisOneDocument.scene2, t, toast);
        return;
      }


      if (id.startsWith("spell.")) {
        dropToCombineWrite(id, thisOneDocument.combineWrite, toast);
        return;
      }
      if (id === "edit.copyImage" && thisOneDocument.image) return void copyImage(thisOneDocument.image);
      if (id.startsWith(tableActionPrefix)) {
        const action = tableActions.find(
          (item) => `${tableActionPrefix}${item.plugin}:${item.id}` === id,
        );
        if (action) onTableAction(action.plugin, action.command, action.id);
        return;
      }

      commandTable[id]?.();
    },
    [open2, commandTable, collapse, copyImage, onTableAction, t, tableActions, toast],
  );

  useEffect(() => {
    if (!open2) return;



    const pointDistinguishPlace = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-context-menu]")) return;
      setOpen(null);
    };
    const close4 = () => setOpen(null);









    const closeRoll = (e: Event) => {
      if (popupSelfSelfAtRoll(e.target)) return;
      close4();
    };
    document.addEventListener("mousedown", pointDistinguishPlace);
    window.addEventListener("resize", close4);

    window.addEventListener("scroll", closeRoll, true);
    return () => {
      document.removeEventListener("mousedown", pointDistinguishPlace);
      window.removeEventListener("resize", close4);
      window.removeEventListener("scroll", closeRoll, true);
    };
  }, [open2]);

  if (!open2) return;
  return createPortal(
    <ContextMenuPanel
      line3={open2.line3}
      DropPoint={open2.position2}


      disabled2={disabledForLocation(open2.DropPoint, disabled2)}
      check={check}
      cursor={cursor}
      onPick={select}
      onDismiss={collapse}
      label={t("Context Menu")}
    />,
    document.body,
  );
}
