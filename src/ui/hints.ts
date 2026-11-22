







































import { t } from "@/i18n";


export type NoticeType = "immediate" | "first";

export interface NoticeSoundClear {

  readonly id: string;
  readonly type: NoticeType;






  readonly condition: string;

  readonly default: boolean;

  readonly copy2: () => string;
}







export const noticeTable: readonly NoticeSoundClear[] = [
  {
    id: "linkCtrlClick",
    type: "immediate",
    condition: "collapsed caret inside a link whose source is not being edited",
    default: true,
    copy2: () => t("Hold Ctrl and click to open the link."),
  },
  {
    id: "codeBlockExit",
    type: "immediate",
    condition: "caret is on the final empty line of a non-empty code block",
    default: true,
    copy2: () => t("To leave a code block, press Enter twice or click somewhere else."),
  },
  {
    id: "tableTabLastRow",
    type: "immediate",
    condition: "caret is in the last table row; Tab adds a row",
    default: true,
    copy2: () => t("Tab moves to the next cell — on the last row it adds a new one."),
  },
  {
    id: "tableShiftTabFirstRow",
    type: "immediate",
    condition: "caret is in the first table row; Shift+Tab cannot move backward",
    default: true,
    copy2: () => t("Shift+Tab goes back to the previous cell."),
  },
  {
    id: "headingEnter",
    type: "first",
    condition: "after typing “# ” but before pressing Enter",
    default: true,
    copy2: () => t("Press Enter to turn this into a heading."),
  },
  {
    id: "autosave",
    type: "first",
    condition: "after the first autosave triggered by switching documents",
    default: true,
    copy2: () => t("The file was saved automatically when you switched documents. Auto Save can be disabled in Settings."),
  },
  {
    id: "findKey",
    type: "first",
    condition: "after pressing Ctrl+F in the document",
    default: true,
    copy2: () => t("Ctrl+F finds text, Ctrl+H also replaces it."),
  },
  {
    id: "exportPdf",
    type: "first",
    condition: "when File → Export → PDF… is used for the first time",
    default: true,
    copy2: () => t("PDF export uses the system installation of Pandoc. Nota does not include Pandoc."),
  },
];


export function noticeidPlural(): string[] {
  return noticeTable.map((item4) => item4.id);
}


export function findNotice(id: string): NoticeSoundClear | undefined {
  return noticeTable.find((item4) => item4.id === id);
}








export function shouldShow(parameter: {
  id: string;

  staticSound: ReadonlySet<string>;

  seePass2: ReadonlySet<string>;

  contextMatches: boolean;
}): boolean {
  const item4 = findNotice(parameter.id);
  if (!item4) return false;
  if (!parameter.contextMatches) return false;
  if (parameter.staticSound.has(parameter.id)) return false;
  if (item4.type === "first" && parameter.seePass2.has(parameter.id)) return false;
  return true;
}
