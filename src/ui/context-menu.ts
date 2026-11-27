


























































import {
  isMenuItem,
  getItem,
  contextInsertItems,
  contextParagraphItems,
  contextTableItems,
  type MenuEntry,
  type MenuItemSpec,
} from "@/ui/commands";


export type DropPoint = "editor" | "Input" | "shell" | "no menu";


export interface DropPointLineSearch {

  isInputBox: boolean;

  atEditorInside: boolean;

  alreadyIsRecognizeLead: boolean;
}




export function determineDropPoint(lineSearch: DropPointLineSearch): DropPoint {
  if (lineSearch.alreadyIsRecognizeLead) return "no menu";
  if (lineSearch.isInputBox) return "Input";
  if (lineSearch.atEditorInside) return "editor";
  return "shell";
}


const noneDisabled: ReadonlySet<string> = new Set<string>();
























export function disabledForLocation(position2: DropPoint, disabled2: ReadonlySet<string>): ReadonlySet<string> {
  return position2 === "Input" ? noneDisabled : disabled2;
}








export const cutPasteIcon: readonly string[] = [
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "edit.delete",
];








export const inlineIcon: readonly string[] = ["fmt.bold", "fmt.italic", "fmt.code", "fmt.link"];


export const blockIcon: readonly string[] = ["para.quote", "para.ul", "para.ol", "para.task"];

const imageZoomLevels = [25, 33, 50, 67, 80, 100, 150, 200] as const;

function imageMenuItems(
  t: (source: string, ...parameter: (string | number)[]) => string,
): readonly MenuItemSpec[] {
  return [
    {
      id: "image.openLocation",
      label: t("Open Image Location"),
      needsDoc: true,
    },
    {
      id: "image.copyTo",
      label: t("Copy Image To..."),
      needsDoc: true,
    },
    {
      id: "image.moveTo",
      label: t("Rename / Move Image To..."),
      needsDoc: true,
    },
    {
      id: "image.upload",
      label: t("Upload Image"),
      needsDoc: true,
    },
    {
      id: "image.zoom",
      label: t("Zoom Image"),
      needsDoc: true,
      submenu: imageZoomLevels.map((level) => ({
        id: `image.zoom.${level}`,
        label: t("{0}%", String(level)),
        needsDoc: true,
        checkable: true,
      })),
    },
    {
      id: "image.syntax",
      label: t("Convert Image Syntax"),
      needsDoc: true,
      submenu: [
        {
          id: "image.syntax.markdown",
          label: t("Markdown"),
          needsDoc: true,
          checkable: true,
        },
        {
          id: "image.syntax.html",
          label: t("HTML"),
          needsDoc: true,
          checkable: true,
        },
      ],
    },
    {
      id: "image.deleteFile",
      label: t("Delete Image File"),
      needsDoc: true,
      danger: true,
    },
  ];
}












export const inputBoxItem: readonly string[] = [
  "edit.undo",
  "edit.redo",
  "sep",
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "sep",
  "edit.select",
];


export type line3 =
  | { kind: "icons"; key: string; ids: readonly string[] }
  | { kind: "item"; key: string; spec: MenuItemSpec }
  | { kind: "spell"; key: string; id: string; label: string }
  | { kind: "sep"; key: string };














export const combineWriteAddWordDictionary = "spell.add";
export const combineWriteIgnoreOmit = "spell.ignore";
export const combineWriteReplaceReplacePrefix = "spell.replace:";











export interface CombineWriteLineSearch {
  createProposalPlural: readonly string[];
  addWordDictionary: string;
  ignoreOmit: string;
}












export function combineWriteLine(lineSearch: CombineWriteLineSearch): line3[] {
  const rows: line3[] = lineSearch.createProposalPlural.map((createProposal, i) => ({
    kind: "spell",
    key: `spell-${i}`,
    id: `${combineWriteReplaceReplacePrefix}${i}`,
    label: createProposal,
  }));
  if (rows.length > 0) rows.push({ kind: "sep", key: "spell-sep-1" });
  rows.push({ kind: "spell", key: "spell-add", id: combineWriteAddWordDictionary, label: lineSearch.addWordDictionary });
  rows.push({ kind: "spell", key: "spell-ignore", id: combineWriteIgnoreOmit, label: lineSearch.ignoreOmit });
  rows.push({ kind: "sep", key: "spell-sep-2" });
  return rows;
}















export function buildRows(
  position2: DropPoint,
  openSendMode: boolean,





  combineWrite: CombineWriteLineSearch | null = null,

  onImage = false,

  hasSelection = true,

  t: (source: string, ...parameter: (string | number)[]) => string = (source) =>
    source,
): line3[] {
  if (position2 === "Input") {






    return itemLine(inputBoxItem, "Input", true);
  }
  if (position2 !== "editor") return [];

  const rows: line3[] = [
    ...(combineWrite ? combineWriteLine(combineWrite) : []),
    ...(onImage
      ? [
          ...imageMenuItems(t).map((spec) => ({
            kind: "item" as const,
            key: `image-${spec.id}`,
            spec,
          })),
          { kind: "sep" as const, key: "image-sep-1" },
          ...itemLine(["edit.copyImage"], "image"),
          {
            kind: "item" as const,
            key: "image-copyAs",
            spec: {
              id: "image.copyAs",
              label: t("Copy As"),
              needsDoc: true,
              submenu: [
                {
                  id: "image.copyAs.markdown",
                  label: t("Markdown"),
                  needsDoc: true,
                },
                {
                  id: "image.copyAs.html",
                  label: t("HTML"),
                  needsDoc: true,
                },
              ],
            },
          },
          {
            kind: "item" as const,
            key: "image-saveAs",
            spec: {
              id: "image.saveAs",
              label: t("Save Image As..."),
              needsDoc: true,
            },
          },
          { kind: "sep" as const, key: "image-sep-2" },
        ]
      : []),
    { kind: "icons", key: "icons-clip", ids: cutPasteIcon },
    ...(hasSelection && !onImage ? itemLine(["edit.copyAs"], "copy as") : []),
    { kind: "sep", key: "sep-1" },
    { kind: "icons", key: "icons-inline", ids: inlineIcon },
    { kind: "icons", key: "icons-block", ids: blockIcon },
    { kind: "sep", key: "sep-2" },
    { kind: "item", key: "ctx.paragraph", spec: contextParagraphItems },
    { kind: "item", key: "ctx.table", spec: contextTableItems },
    { kind: "item", key: "ctx.insert", spec: contextInsertItems },
  ];
  if (openSendMode) rows.push({ kind: "sep", key: "sep-3" }, ...itemLine(["view.devtools"], "tool"));
  return rows;
}












function itemLine(ids: readonly string[], name2: string, flattenFlat = false): line3[] {
  const out: line3[] = [];
  ids.forEach((id, i) => {
    if (id === "sep") {
      out.push({ kind: "sep", key: `${name2}-sep-${i}` });
      return;
    }
    const spec = getItem(id);
    if (!spec) return;


    const oneItem = flattenFlat && spec.submenu
      ? {
          id: spec.id,
          label: spec.label,
          accel: spec.accel,
          needsDoc: spec.needsDoc,
          checkable: spec.checkable,
          danger: spec.danger,
        }
      : spec;
    out.push({ kind: "item", key: `${name2}-${id}`, spec: oneItem });
  });
  return out;
}














export function wholeLineDisabled(r: line3, disabled2: ReadonlySet<string>): boolean {
  if (r.kind === "sep") return true;
  if (r.kind === "icons") return r.ids.every((id) => disabled2.has(id));



  if (r.kind === "spell") return false;
  const child3 = r.spec.submenu;
  if (child3) {
    const assertValueItem = child3.filter(isMenuItem);
    return assertValueItem.length === 0 || assertValueItem.every((c) => disabled2.has(c.id));
  }
  return disabled2.has(r.spec.id);
}












export function inlineBelowValueCell(
  canUse: readonly { disabled?: boolean }[],
  current: number,
  direction: 1 | -1,
): number {
  for (let i = current + direction; i >= 0 && i < canUse.length; i += direction) {
    if (!canUse[i]?.disabled) return i;
  }
  return current;
}








export function allTableIds(): string[] {
  const receive: string[] = [];
  const flatten = (ids: readonly string[]) => {
    for (const id of ids) if (id !== "sep") receive.push(id);
  };
  for (const level of ["editor", "Input"] as const) {

    for (const item5 of buildRows(level, true)) {
      if (item5.kind === "icons") flatten(item5.ids);
      else if (item5.kind === "item") receive.push(item5.spec.id);
    }
  }

  flattenChild(contextParagraphItems.submenu, receive);
  flattenChild(contextTableItems.submenu, receive);
  flattenChild(contextInsertItems.submenu, receive);
  return receive;
}

function flattenChild(entries: readonly MenuEntry[] | undefined, receive: string[]): void {
  for (const e of entries ?? []) {
    if (e === "sep") continue;
    receive.push(e.id);

    flattenChild(e.submenu, receive);
  }
}
