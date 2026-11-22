

































import { useEffect, useState, type Ref } from "react";

import type { CommandState } from "@/editor/command-state";
import type { EditorCommand } from "@/editor/create";
import { useT, language } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { getItem, MENUS, walkMenuItems, type MenuEntry, type MenuItemSpec } from "@/ui/commands";
import { Icon, type iconName } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";

interface Props {






  state: CommandState | null;

  onCommand: (name: EditorCommand) => void;

  onMenuCommand: (id: string) => void;

  disabled: ReadonlySet<string>;
  checks: Record<string, boolean>;

  focusEditor: () => void;










  ref?: Ref<HTMLDivElement>;
}


const keyPositionTable = (() => {
  const m = new Map<string, string>();
  walkMenuItems(MENUS, (item) => {
    if (item.accel) m.set(item.id, item.accel);
  });
  return m;
})();













export function notice(menu: string, name2: string): string {
  const a = keyPositionTable.get(menu);
  if (!a) return name2;
  const key = formatAccel(a);
  return language() === "zh-CN" ? `${name2}（${key}）` : `${name2} (${key})`;
}













type InlinePosition =
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "highlight"
  | "superscript"
  | "subscript"
  | "underline";





export interface PressButton {
  cmd: EditorCommand;
  menu: string;
  label: string;












  icon?: iconName;

  block?: CommandState["block"];

  on?: InlinePosition;
}


const inlineGroup: PressButton[] = [
  { cmd: "bold", menu: "fmt.bold", label: "B", icon: "folio-format-text-bold-symbolic", on: "bold" },
  { cmd: "italic", menu: "fmt.italic", label: "I", icon: "folio-format-text-italic-symbolic", on: "italic" },
  { cmd: "strike", menu: "fmt.strike", label: "S", icon: "folio-format-text-strikethrough-symbolic", on: "strike" },
  {
    cmd: "inlineCode",
    menu: "fmt.code",
    label: "</>",
    icon: "nota-inline-code-symbolic",
    on: "inlineCode",
  },



  { cmd: "highlight", menu: "fmt.highlight", label: "==", icon: "folio-marker-symbolic", on: "highlight" },
  { cmd: "superscript", menu: "fmt.superscript", label: "x²", icon: "folio-format-text-superscript-symbolic", on: "superscript" },
  { cmd: "subscript", menu: "fmt.subscript", label: "x₂", icon: "folio-format-text-subscript-symbolic", on: "subscript" },
  { cmd: "underline", menu: "fmt.underline", label: "U", icon: "folio-format-text-underline-symbolic", on: "underline" },
];


const linkGroup: PressButton[] = [
  { cmd: "link", menu: "fmt.link", label: "Link", icon: "folio-insert-link-symbolic" },
  { cmd: "image", menu: "fmt.image", label: "Image", icon: "folio-insert-image-symbolic" },
];









const blockGroup: PressButton[] = [
  { cmd: "text", menu: "para.text", label: "Paragraph", block: "text" },
  { cmd: "h1", menu: "para.h1", label: "H1", icon: "nota-heading-1-symbolic", block: "h1" },
  { cmd: "h2", menu: "para.h2", label: "H2", icon: "nota-heading-2-symbolic", block: "h2" },
  { cmd: "h3", menu: "para.h3", label: "H3", icon: "nota-heading-3-symbolic", block: "h3" },
  { cmd: "h4", menu: "para.h4", label: "H4", block: "h4" },
  { cmd: "h5", menu: "para.h5", label: "H5", block: "h5" },
  { cmd: "h6", menu: "para.h6", label: "H6", block: "h6" },
  { cmd: "quote", menu: "para.quote", label: "Quote", icon: "nota-quote-symbolic", block: "quote" },
  { cmd: "ul", menu: "para.ul", label: "•", icon: "folio-view-list-bullet-symbolic", block: "ul" },
  { cmd: "ol", menu: "para.ol", label: "1.", icon: "folio-view-list-ordered-symbolic", block: "ol" },
  { cmd: "task", menu: "para.task", label: "Task", icon: "nota-task-symbolic", block: "task" },
  {
    cmd: "codeBlock",
    menu: "para.codeBlock",
    label: "{ }",
    icon: "nota-code-block-symbolic",
    block: "codeBlock",
  },
  { cmd: "clearFormat", menu: "fmt.clear", label: "Clear", icon: "folio-eraser-symbolic" },
];


function pickMenuEntries(items: ReadonlyArray<string | MenuItemSpec>): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const id of items) {
    if (typeof id !== "string") {
      entries.push(id);
      continue;
    }
    if (id === "sep") {
      entries.push("sep");
      continue;
    }
    const item = getItem(id);
    if (item) entries.push(item);
  }
  return entries;
}

const paragraphMenuEntries = pickMenuEntries([
  "para.h1",
  "para.h2",
  "para.h3",
  "para.h4",
  "para.h5",
  "para.h6",
  "para.text",
  "sep",
  { ...(getItem("para.table") ?? { id: "para.table", label: "Table" }), label: "Table" } as MenuItemSpec,
  "para.codeBlock",
  "para.mathBlock",
  "para.hr",
]);

const listMenuEntries = pickMenuEntries(["para.ul", "para.ol", "para.task"]);

const hideToolbarItem: MenuItemSpec = {
  id: "view.toolbarNever",
  label: "Hide the formatting toolbar",
};

const moreMenuEntries = pickMenuEntries([
  "fmt.strike",
  "fmt.highlight",
  "fmt.superscript",
  "fmt.subscript",
  "fmt.underline",
  "sep",
  "view.modeSource",
  "sep",
  "edit.copy",
  "edit.paste",
  "edit.copyAs",
  "fmt.clear",
  "sep",
  "edit.delete",
  "sep",
]).concat(hideToolbarItem);










export function isButtonActive(b: PressButton, state: CommandState | null): boolean {
  if (!state) return false;
  return b.on ? state[b.on] === true : b.block ? state.block === b.block : false;
}


export const pressButtonTable: ReadonlyMap<string, PressButton> = (() => {
  const m = new Map<string, PressButton>();
  for (const b of [...inlineGroup, ...linkGroup, ...blockGroup]) m.set(b.menu, b);
  return m;
})();













export function characterShapeClass(menu: string): string {
  const b = pressButtonTable.get(menu);
  return b ? `format-glyph format-glyph-${b.cmd}` : "format-glyph";
}


















export function FormatBar({
  state,
  onCommand,
  onMenuCommand,
  disabled,
  checks,
  focusEditor,
  ref,
}: Props) {

  const t = useT();



















  const TITLES: Partial<Record<EditorCommand, string>> = {
    text: t("Normal text"),
    bold: t("Bold"),
    italic: t("Italic"),
    strike: t("Strikethrough"),
    inlineCode: t("Inline Code"),
    highlight: t("Highlight"),
    superscript: t("Superscript"),
    subscript: t("Subscript"),
    underline: t("Underline"),
    link: t("Link"),
    image: t("Image"),
    h1: t("Heading 1"),
    h2: t("Heading 2"),
    h3: t("Heading 3"),
    h4: t("Heading 4"),
    h5: t("Heading 5"),
    h6: t("Heading 6"),
    quote: t("Blockquote"),
    ul: t("Bullet List"),
    ol: t("Ordered List"),
    task: t("Task List"),
    codeBlock: t("Code Block"),
    clearFormat: t("Clear Formatting"),
  };

  const [openMenu, setOpenMenu] = useState<"paragraph" | "list" | "more" | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".format-bar")) return;
      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openMenu]);

  const byCommand = (command: EditorCommand): PressButton => {
    const found = pressButtonTable.get(
      [...pressButtonTable.values()].find((button) => button.cmd === command)?.menu ?? "",
    );
    if (!found) throw new Error(`Formatting toolbar is missing button ${command}`);
    return found;
  };

  const primaryInline = ["bold", "italic", "inlineCode"].map((name) =>
    byCommand(name as EditorCommand),
  );
  const pickFormatMenu = (id: string) => {
    setOpenMenu(null);
    queueMicrotask(focusEditor);
    const direct = pressButtonTable.get(id);
    if (direct) onCommand(direct.cmd);
    else onMenuCommand(id);
  };
  const dismissFormatMenu = () => {
    setOpenMenu(null);
    queueMicrotask(focusEditor);
  };

  const currentBlockLabel = (() => {
    switch (state?.block) {
      case "h1":
        return TITLES.h1!;
      case "h2":
        return TITLES.h2!;
      case "h3":
        return TITLES.h3!;
      case "h4":
        return TITLES.h4!;
      case "h5":
        return TITLES.h5!;
      case "h6":
        return TITLES.h6!;
      case "quote":
        return TITLES.quote!;
      case "ul":
        return TITLES.ul!;
      case "ol":
        return TITLES.ol!;
      case "task":
        return TITLES.task!;
      case "codeBlock":
        return TITLES.codeBlock!;
      default:
        return TITLES.text!;
    }
  })();
  const currentListIcon =
    state?.block === "ol"
      ? "folio-view-list-ordered-symbolic"
      : state?.block === "task"
        ? "nota-task-symbolic"
        : "folio-view-list-bullet-symbolic";
  const hideToolbarLabel = t("Hide the formatting toolbar");
  const moreEntriesWithLabel = moreMenuEntries.map((entry) =>
    typeof entry !== "string" && entry.id === "view.toolbarNever"
      ? { ...entry, label: hideToolbarLabel }
      : entry,
  );
  const formatChecks = state
    ? {
        ...checks,
        "para.h1": state.block === "h1",
        "para.h2": state.block === "h2",
        "para.h3": state.block === "h3",
        "para.h4": state.block === "h4",
        "para.h5": state.block === "h5",
        "para.h6": state.block === "h6",
        "para.text": state.block === "text",
      }
    : checks;


  const draw = (b: PressButton) => {


    const bright = isButtonActive(b, state);
    const canActivate = Boolean(b.on || b.block);

    const noticeLanguage = notice(b.menu, TITLES[b.cmd] ?? b.label);
    return (
      <button
        key={b.cmd}
        type="button"
        className="format-btn"
        data-on={bright}


        aria-pressed={state && canActivate ? bright : undefined}
        title={noticeLanguage}



        aria-label={b.icon ? noticeLanguage : undefined}




        onMouseDown={(e) => e.preventDefault()}











        onClick={() => onCommand(b.cmd)}
      >
        {b.icon ? <Icon name={b.icon} /> : <span className={characterShapeClass(b.menu)}>{b.label}</span>}
      </button>
    );
  };

  return (
    <div className="format-bar" role="toolbar" aria-label={t("Formatting")} ref={ref}>
      <div className="format-group">
        <button
          type="button"
          className="format-selector"
          aria-haspopup="menu"
          aria-expanded={openMenu === "paragraph"}
          title={currentBlockLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpenMenu((current) => (current === "paragraph" ? null : "paragraph"))}
        >
          <span>{currentBlockLabel}</span>
          <span className="format-caret" aria-hidden="true" />
        </button>
        {openMenu === "paragraph" && (
          <MenuPopup
            label={t("Paragraph")}
            entries={paragraphMenuEntries}
            disabled={disabled}
            checks={formatChecks}
            onPick={pickFormatMenu}
            onDismiss={dismissFormatMenu}
            onArrowOut={dismissFormatMenu}
          />
        )}
      </div>

      <span className="format-sep" />

      {primaryInline.map(draw)}
      {draw(byCommand("link"))}

      <span className="format-sep" />

      {draw(byCommand("image"))}
      {draw(byCommand("quote"))}
      <div className="format-group">
        <button
          type="button"
          className="format-btn format-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === "list"}
          title={t("Lists")}
          aria-label={t("Lists")}
          data-on={state?.block === "ul" || state?.block === "ol" || state?.block === "task"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpenMenu((current) => (current === "list" ? null : "list"))}
        >
          <Icon name={currentListIcon} />
          <span className="format-caret" aria-hidden="true" />
        </button>
        {openMenu === "list" && (
          <MenuPopup
            label={t("Lists")}
            entries={listMenuEntries}
            disabled={disabled}
            checks={formatChecks}
            onPick={pickFormatMenu}
            onDismiss={dismissFormatMenu}
            onArrowOut={dismissFormatMenu}
          />
        )}
      </div>

      <span className="format-sep" />

      <div className="format-group format-menu-align-end">
        <button
          type="button"
          className="format-btn format-menu-trigger format-more-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === "more"}
          title={t("More formatting options")}
          aria-label={t("More formatting options")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpenMenu((current) => (current === "more" ? null : "more"))}
        >
          <Icon name="folio-view-more-horizontal-symbolic" />
        </button>
        {openMenu === "more" && (
          <MenuPopup
            label={t("More formatting options")}
            entries={moreEntriesWithLabel}
            disabled={disabled}
            checks={formatChecks}
            onPick={pickFormatMenu}
            onDismiss={dismissFormatMenu}
            onArrowOut={dismissFormatMenu}
          />
        )}
      </div>
    </div>
  );
}
