











































import type { DocThemeInfo } from "@/bridge/ipc";
import { t } from "@/i18n";

export interface MenuItemSpec {

  id: string;
  label: string;












  accel?: string;










  right?: string;

  needsDoc?: boolean;

  checkable?: boolean;

  danger?: boolean;











  submenu?: MenuEntry[];
}

export type MenuEntry = MenuItemSpec | "sep";

export interface MenuSpec {
  id: string;
  label: string;
  items: MenuEntry[];




  dynamic?: "themes";
}


export function isMenuItem(entry: MenuEntry): entry is MenuItemSpec {
  return entry !== "sep";
}










export function walkMenuItems(
  menus: readonly MenuSpec[],
  visit: (item: MenuItemSpec, menu: MenuSpec) => void,
): void {
  const walk = (entries: readonly MenuEntry[], menu: MenuSpec) => {
    for (const entry of entries) {
      if (!isMenuItem(entry)) continue;
      visit(entry, menu);
      if (entry.submenu) walk(entry.submenu, menu);
    }
  };
  for (const menu of menus) walk(menu.items, menu);
}

























export function ApplyKeyOverrides(
  menus: readonly MenuSpec[],
  overrides: Readonly<Record<string, string>>,
): readonly MenuSpec[] {
  if (!Object.keys(overrides).length) return menus;

  const stackValueItem = (item: MenuItemSpec): MenuItemSpec => {
    if (!(item.id in overrides)) return item;
    const value2 = overrides[item.id];
    if (value2 === "") {
      const copy = { ...item };
      delete copy.accel;
      return copy;
    }
    return { ...item, accel: value2 };
  };

  const walkValueLayer = (entries: readonly MenuEntry[]): MenuEntry[] =>
    entries.map((e) =>
      e === "sep" ? e : { ...stackValueItem(e), ...(e.submenu ? { submenu: walkValueLayer(e.submenu) } : {}) },
    );

  return menus.map((m) => ({ ...m, items: walkValueLayer(m.items) }));
}

/** Effective accelerator for one command after user overrides have been applied. */
export function findMenuAccel(
  menus: readonly MenuSpec[],
  id: string,
): string | undefined {
  let accel: string | undefined;
  walkMenuItems(menus, (item) => {
    if (item.id === id) accel = item.accel;
  });
  return accel;
}


export const NO_THEME = "__theme-none";

export const THEME_PREFIX = "__theme:";

export const THEMES_DIR = "__theme-dir";













export function themeEntries(themes: readonly DocThemeInfo[]): MenuEntry[] {
  const items: MenuEntry[] = [{ id: NO_THEME, label: "No Theme (Built-in)", checkable: true }];

  if (themes.length) {
    items.push("sep");
    for (const th of themes) {


      //




      items.push({
        id: `${THEME_PREFIX}${th.id}`,
        label: th.builtin ? th.name : t("{0} (customized)", th.name),
        checkable: true,
      });
    }
  }



  items.push("sep", { id: THEMES_DIR, label: "Open Document Themes Folder…" });
  return items;
}









export function themeChecks(
  themes: readonly DocThemeInfo[],
  current: string,
): Record<string, boolean> {
  const out: Record<string, boolean> = { [NO_THEME]: current === "" };
  for (const t of themes) out[`${THEME_PREFIX}${t.id}`] = t.id === current;
  return out;
}


export type MenuPick =
  | { kind: "command"; id: string }
  | { kind: "theme"; id: string }
  | { kind: "themes-dir" };








export function resolvePick(id: string): MenuPick {
  if (id === NO_THEME) return { kind: "theme", id: "" };
  if (id === THEMES_DIR) return { kind: "themes-dir" };
  if (id.startsWith(THEME_PREFIX)) return { kind: "theme", id: id.slice(THEME_PREFIX.length) };
  return { kind: "command", id };
}













export const clearRemoveRecentItem: MenuItemSpec = { id: "file.clearRecent", label: "Clear Recent Files" };

export const MENUS: MenuSpec[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "file.new", label: "New", accel: "Ctrl+N" },
      { id: "file.newWindow", label: "New Window", accel: "Ctrl+Shift+N" },
      { id: "tab.openInNewWindow", label: "Open Current Tab in New Window", accel: "Ctrl+Alt+N", needsDoc: true },
      { id: "tab.moveToWindow", label: "Move Current Tab to Another Window…", accel: "Ctrl+Alt+M", needsDoc: true },
      "sep",
      { id: "file.open", label: "Open…", accel: "Ctrl+O" },
      { id: "file.openFolder", label: "Open Folder…" },



      { id: "file.quickOpen", label: "Quick Open…", accel: "Ctrl+Shift+P" },
      { id: "file.recent", label: "Open Recent File" },
      { id: "file.reload", label: "Reload from Disk", needsDoc: true },
      "sep",
      { id: "file.save", label: "Save", accel: "Ctrl+S", needsDoc: true },
      { id: "file.saveAs", label: "Save As…", accel: "Ctrl+Shift+S", needsDoc: true },
      { id: "file.saveAll", label: "Save All Open Files…" },
      "sep",
      { id: "file.rename", label: "Rename…", needsDoc: true },
      { id: "file.move", label: "Move to…", needsDoc: true },
      { id: "file.revealInFolder", label: "Open File Location…", needsDoc: true },
      { id: "file.showInSidebar", label: "Reveal in Sidebar", needsDoc: true },
      { id: "file.delete", label: "Delete…", needsDoc: true, danger: true },
      "sep",
      {



        id: "file.import",
        label: "Import",
        submenu: [
          { id: "file.importDocx", label: "Word (.docx)…" },
          { id: "file.importRtf", label: "RTF…" },
          { id: "file.importLatex", label: "LaTeX…" },
          { id: "file.importEpub", label: "EPUB…" },
          { id: "file.importOdt", label: "OpenDocument (.odt)…" },
        ],
      },
      {
        id: "file.export",
        label: "Export",
        submenu: [
          { id: "file.exportPdf", label: "PDF…", needsDoc: true },
          { id: "file.exportHtmlPlain", label: "HTML (No Styles)…", needsDoc: true },
          { id: "file.exportHtmlStyled", label: "HTML (With Styles)…", needsDoc: true },
          "sep",
          { id: "file.exportDocx", label: "Word (.docx)…", needsDoc: true },
          { id: "file.exportOdt", label: "OpenDocument (.odt)…", needsDoc: true },
          { id: "file.exportRtf", label: "RTF…", needsDoc: true },
          { id: "file.exportLatex", label: "LaTeX…", needsDoc: true },
          { id: "file.exportEpub", label: "EPUB…", needsDoc: true },
          { id: "file.exportOpml", label: "OPML…", needsDoc: true },
          "sep",
          { id: "file.exportImage", label: "Image…", needsDoc: true },
        ],
      },
      { id: "file.print", label: "Print…", accel: "Ctrl+P", needsDoc: true },
      "sep",
      { id: "file.preferences", label: "Settings…", accel: "Ctrl+," },
      "sep",
      { id: "file.close", label: "Close", accel: "Ctrl+W", needsDoc: true },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "edit.undo", label: "Undo", accel: "Ctrl+Z", needsDoc: true },
      { id: "edit.redo", label: "Redo", accel: "Ctrl+Y", needsDoc: true },
      "sep",
      { id: "edit.cut", label: "Cut", accel: "Ctrl+X", needsDoc: true },
      { id: "edit.copy", label: "Copy", accel: "Ctrl+C", needsDoc: true },
      { id: "edit.copyImage", label: "Copy Image", needsDoc: true },
      { id: "edit.paste", label: "Paste", accel: "Ctrl+V", needsDoc: true },









      { id: "edit.pastePlain", label: "Paste as Plain Text", accel: "Ctrl+Shift+V", needsDoc: true },


      //






      { id: "edit.delete", label: "Delete", needsDoc: true },
      "sep",
      {



        id: "edit.copyAs",
        label: "Copy As",
        submenu: [
          { id: "edit.copyAsMarkdown", label: "Markdown", accel: "Ctrl+Shift+C", needsDoc: true },
          { id: "edit.copyAsPlain", label: "Plain Text", needsDoc: true },
          { id: "edit.copyAsHtml", label: "HTML Source", needsDoc: true },
        ],
      },
      "sep",
      {



        //



        //




        id: "edit.select",
        label: "Select",
        submenu: [
          { id: "edit.selectLine", label: "Select Line", accel: "Ctrl+L", needsDoc: true },
          { id: "edit.selectWord", label: "Select Word", accel: "Ctrl+D", needsDoc: true },
          { id: "edit.selectSentence", label: "Select Sentence", accel: "Ctrl+E", needsDoc: true },
          { id: "edit.deleteWord", label: "Delete Word", accel: "Ctrl+Shift+D", needsDoc: true },
        ],
      },
      { id: "edit.moveLineUp", label: "Move Line Up", accel: "Alt+↑", needsDoc: true },
      { id: "edit.moveLineDown", label: "Move Line Down", accel: "Alt+↓", needsDoc: true },
      "sep",






      { id: "edit.find", label: "Find…", accel: "Ctrl+F", needsDoc: true },
      { id: "edit.findReplace", label: "Find and Replace…", accel: "Ctrl+H", needsDoc: true },
      { id: "edit.checkDocument", label: "Check Document…", needsDoc: true },
    ],
  },
  {
    id: "paragraph",
    label: "Paragraph",
    items: [
      { id: "para.h1", label: "Heading 1", accel: "Ctrl+1", needsDoc: true },
      { id: "para.h2", label: "Heading 2", accel: "Ctrl+2", needsDoc: true },
      { id: "para.h3", label: "Heading 3", accel: "Ctrl+3", needsDoc: true },
      { id: "para.h4", label: "Heading 4", accel: "Ctrl+4", needsDoc: true },
      { id: "para.h5", label: "Heading 5", accel: "Ctrl+5", needsDoc: true },
      { id: "para.h6", label: "Heading 6", accel: "Ctrl+6", needsDoc: true },
      { id: "para.text", label: "Normal text", accel: "Ctrl+0", needsDoc: true },
      "sep",
      {




        id: "para.tableMenu",
        label: "Table",
        submenu: [





          { id: "para.table", label: "Insert Table (3 × 3)", needsDoc: true },
          "sep",
          { id: "para.tableRowAbove", label: "Add Row Above", needsDoc: true },
          { id: "para.tableRowBelow", label: "Add Row Below", needsDoc: true },
          { id: "para.tableColLeft", label: "Add Column Before", needsDoc: true },
          { id: "para.tableColRight", label: "Add Column After", needsDoc: true },
          "sep",
          { id: "para.tableDelRow", label: "Delete Row", needsDoc: true },
          { id: "para.tableDelCol", label: "Delete Column", needsDoc: true },
          { id: "para.tableDel", label: "Delete Table", needsDoc: true, danger: true },
          "sep",
          { id: "para.tableAlignLeft", label: "Align Left", needsDoc: true },
          { id: "para.tableAlignCenter", label: "Align Center", needsDoc: true },
          { id: "para.tableAlignRight", label: "Align Right", needsDoc: true },
          { id: "para.tableRowHeaders", label: "Use First Column as Row Headers", needsDoc: true },
        ],
      },
      { id: "para.mathBlock", label: "Math Block", accel: "Ctrl+Shift+M", needsDoc: true },
      { id: "para.codeBlock", label: "Code Block", accel: "Ctrl+Shift+K", needsDoc: true },
      "sep",
      { id: "para.quote", label: "Blockquote", accel: "Ctrl+Shift+Q", needsDoc: true },
      "sep",
      { id: "para.ol", label: "Ordered List", accel: "Ctrl+Shift+[", needsDoc: true },
      { id: "para.ul", label: "Bullet List", accel: "Ctrl+Shift+]", needsDoc: true },
      { id: "para.task", label: "Task List", accel: "Ctrl+Shift+X", needsDoc: true },
      "sep",
      { id: "para.hr", label: "Horizontal Line", needsDoc: true },
      { id: "para.toc", label: "Table of Contents", needsDoc: true },
      {
        id: "para.alertMenu",
        label: "GitHub Alert",
        submenu: [
          { id: "para.alertNote", label: "Note", needsDoc: true },
          { id: "para.alertTip", label: "Tip", needsDoc: true },
          { id: "para.alertImportant", label: "Important", needsDoc: true },
          { id: "para.alertWarning", label: "Warning", needsDoc: true },
          { id: "para.alertCaution", label: "Caution", needsDoc: true },
        ],
      },




      { id: "para.footnote", label: "Footnote", needsDoc: true },
      { id: "para.frontMatter", label: "YAML Front Matter", needsDoc: true },
    ],
  },
  {
    id: "format",
    label: "Format",
    items: [
      { id: "fmt.bold", label: "Bold", accel: "Ctrl+B", needsDoc: true },
      { id: "fmt.italic", label: "Italic", accel: "Ctrl+I", needsDoc: true },
      { id: "fmt.underline", label: "Underline", accel: "Ctrl+U", needsDoc: true },
      { id: "fmt.kbd", label: "Keyboard Key", needsDoc: true },
      { id: "fmt.code", label: "Code", accel: "Ctrl+Shift+`", needsDoc: true },
      "sep",
      { id: "fmt.strike", label: "Strikethrough", accel: "Alt+Shift+5", needsDoc: true },



      //





      { id: "fmt.highlight", label: "Highlight", accel: "Ctrl+Shift+H", needsDoc: true },
      { id: "fmt.superscript", label: "Superscript", accel: "Ctrl+.", needsDoc: true },
      { id: "fmt.subscript", label: "Subscript", accel: "Ctrl+Shift+.", needsDoc: true },
      { id: "fmt.comment", label: "Comment", needsDoc: true },
      "sep",
      { id: "fmt.link", label: "Link", accel: "Ctrl+K", needsDoc: true },
      { id: "fmt.image", label: "Image", needsDoc: true },



      { id: "fmt.emoji", label: "Insert Emoji…", needsDoc: true },
      "sep",
      { id: "fmt.clear", label: "Clear Formatting", accel: "Ctrl+\\", needsDoc: true },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { id: "view.toggleSidebar", label: "Toggle Sidebar", accel: "Ctrl+Shift+L", checkable: true },
      { id: "view.outline", label: "Outline", accel: "Ctrl+Shift+1", checkable: true },
      { id: "view.fileTree", label: "File Tree", accel: "Ctrl+Shift+3", checkable: true },



      { id: "view.search", label: "Search", accel: "Ctrl+Shift+F" },
      "sep",
      { id: "view.toggleDock", label: "Extension Dock", checkable: true },

      //





      //



      //


      {
        id: "view.toolbar",
        label: "Formatting Toolbar",
        submenu: [
          { id: "view.toolbarAlways", label: "Always Show", checkable: true },
          { id: "view.toolbarHover", label: "Show on Hover", checkable: true },
          { id: "view.toolbarNever", label: "Never Show", checkable: true },
        ],
      },

      //






      //



      { id: "view.statusBar", label: "Status Bar", checkable: true },




      //




      //



      { id: "view.menuBar", label: "Menu Bar", accel: "Alt+M", checkable: true },





      //

      //






      //




      //



      "sep",

      //






      //


      { id: "view.modeWysiwyg", label: "WYSIWYG", accel: "Alt+1", checkable: true },
      { id: "view.modeSource", label: "Source Mode", accel: "Ctrl+/", checkable: true },
      { id: "view.modeSplit", label: "Split Preview", accel: "Alt+2", checkable: true },
      "sep",
      { id: "view.readOnly", label: "Read-Only Mode", checkable: true },
      "sep",
      { id: "view.focusMode", label: "Focus Mode", accel: "F8", checkable: true },
      { id: "view.typewriter", label: "Typewriter Mode", accel: "F9", checkable: true },




      "sep",

      //




      //


      //





      //




      //


      //



      { id: "view.zoomIn", label: "Zoom In", accel: "Ctrl+=" },
      { id: "view.zoomOut", label: "Zoom Out", accel: "Ctrl+-" },
      { id: "view.zoomReset", label: "Reset Zoom", accel: "Ctrl+Shift+0" },
      "sep",



      { id: "view.fullscreen", label: "Full Screen", accel: "F11", checkable: true },
      { id: "view.windowId", label: "Show Window IDs", accel: "Ctrl+Alt+I" },




      //



      { id: "view.alwaysOnTop", label: "Always on Top", checkable: true },



      { id: "view.devtools", label: "Developer Tools", accel: "Shift+F12" },
      "sep",





      //




      //




      { id: "view.forceFocus", label: "Force Focus", checkable: true },
    ],
  },
  {
    id: "theme",
    label: "Theme",
    items: [],
    dynamic: "themes",
  },
  {
    id: "about",
    label: "About",
    items: [{ id: "about.about", label: "About Nota" }],
  },
];








const itemIndex = (() => {
  const m = new Map<string, MenuItemSpec>();
  walkMenuItems(MENUS, (item) => {
    if (!m.has(item.id)) m.set(item.id, item);
  });
  return m;
})();


export function getItem(id: string): MenuItemSpec | undefined {
  return itemIndex.get(id);
}











export function flattenItem(ids: readonly string[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const id of ids) {
    if (id === "sep") {
      out.push("sep");
      continue;
    }
    const hit = itemIndex.get(id);
    if (hit) out.push(hit);
  }
  return out;
}














export const contextParagraphItems: MenuItemSpec = {
  id: "ctx.paragraph",
  label: "Paragraph",
  submenu: flattenItem([
    "para.h1",
    "para.h2",
    "para.h3",
    "para.h4",
    "para.h5",
    "para.h6",
    "para.text",
    "sep",
    "para.quote",
    "para.ul",
    "para.ol",
    "para.task",
    "sep",
    "para.codeBlock",
  ]),
};





export const contextTableItems: MenuItemSpec = {
  id: "ctx.table",
  label: "Table",
  submenu: [
    ...flattenItem([
      "para.tableRowAbove",
      "para.tableRowBelow",
      "para.tableColLeft",
      "para.tableColRight",
    ]),
    "sep",
    { id: "para.tableMoveRowUp", label: "Move Row Up", needsDoc: true },
    { id: "para.tableMoveRowDown", label: "Move Row Down", needsDoc: true },
    { id: "para.tableMoveColLeft", label: "Move Column Left", needsDoc: true },
    { id: "para.tableMoveColRight", label: "Move Column Right", needsDoc: true },
    "sep",
    ...flattenItem(["para.tableDelRow", "para.tableDelCol"]),
    "sep",
    { id: "para.tableCopy", label: "Copy Table", needsDoc: true },
    { id: "para.tableFormat", label: "Format Table Source", needsDoc: true },
    { id: "para.tableRowHeaders", label: "Use First Column as Row Headers", needsDoc: true },
    "sep",
    ...flattenItem(["para.tableDel"]),
  ],
};


export const contextInsertItems: MenuItemSpec = {
  id: "ctx.insert",
  label: "Insert",
  submenu: flattenItem([
    "para.table",
    "fmt.image",
    "fmt.link",
    "sep",
    "para.mathBlock",
    "para.codeBlock",
    "sep",
    "para.hr",
    "para.toc",
    "para.footnote",
    "para.alertNote",
    "para.alertTip",
    "para.alertImportant",
    "para.alertWarning",
    "para.alertCaution",
    "fmt.emoji",
  ]),
};
