import type { DocThemeInfo } from "@/bridge/ipc";
import {
  themeChecks,
  themeEntries,
  type MenuEntry,
  type MenuItemSpec,
  type MenuSpec,
} from "@/ui/commands";

export interface CommandPaletteEntry {
  id: string;
  title: string;
  group: string;
  keywords: string;
  accel?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  order: number;
}

export interface CommandPaletteSource {
  menus: readonly MenuSpec[];
  disabled: ReadonlySet<string>;
  checks: Readonly<Record<string, boolean>>;
  themes: readonly DocThemeInfo[];
  currentTheme: string;
  translate?: (source: string) => string;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSubsequence(needle: string, haystack: string): boolean {
  let offset = 0;
  for (const character of haystack) {
    if (character === needle[offset]) offset += 1;
    if (offset === needle.length) return true;
  }
  return needle.length === 0;
}

export function collectCommandPaletteEntries({
  menus,
  disabled,
  checks,
  themes,
  currentTheme,
  translate = (source) => source,
}: CommandPaletteSource): CommandPaletteEntry[] {
  const entries: CommandPaletteEntry[] = [];
  const seen = new Set<string>();
  let order = 0;

  const visit = (
    menu: MenuSpec,
    menuEntries: readonly MenuEntry[],
    menuChecks: Readonly<Record<string, boolean>>,
    parents: readonly string[],
  ) => {
    for (const entry of menuEntries) {
      if (entry === "sep") continue;
      const title = translate(entry.label);
      if (entry.submenu?.length) {
        visit(menu, entry.submenu, menuChecks, [...parents, title]);
        continue;
      }
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push({
        id: entry.id,
        title,
        group: [translate(menu.label), ...parents].join(" / "),
        keywords: [
          entry.id,
          entry.label,
          translate(menu.label),
          ...parents,
          entry.accel ?? "",
        ].join(" "),
        ...(entry.accel ? { accel: entry.accel } : {}),
        ...(menuChecks[entry.id] ? { checked: true } : {}),
        ...(entry.danger ? { danger: true } : {}),
        disabled: disabled.has(entry.id),
        order,
      });
      order += 1;
    }
  };

  for (const menu of menus) {
    if (menu.dynamic === "themes") {
      visit(
        menu,
        themeEntries(themes),
        { ...checks, ...themeChecks(themes, currentTheme) },
        [],
      );
      continue;
    }
    visit(menu, menu.items, checks, []);
  }

  return entries;
}

export function searchCommandPalette(
  entries: readonly CommandPaletteEntry[],
  query: string,
): CommandPaletteEntry[] {
  const value = normalized(query);
  if (!value) return [...entries];
  const tokens = value.split(" ");

  return entries
    .map((entry) => {
      const title = normalized(entry.title);
      const haystack = normalized(`${entry.title} ${entry.group} ${entry.keywords}`);
      for (const token of tokens) {
        if (!haystack.includes(token) && !isSubsequence(token, haystack)) return null;
      }

      let score = 0;
      if (title === value) score += 1_000;
      else if (title.startsWith(value)) score += 800;
      else if (title.includes(value)) score += 500;
      for (const token of tokens) {
        if (title === token) score += 160;
        else if (title.startsWith(token)) score += 120;
        else if (title.includes(token)) score += 80;
        else score += 20;
      }
      score -= Math.min(title.length, 80) / 100;
      return { entry, score };
    })
    .filter((item): item is { entry: CommandPaletteEntry; score: number } => item !== null)
    .sort((left, right) => right.score - left.score || left.entry.order - right.entry.order)
    .map((item) => item.entry);
}

export function firstEnabledCommand(entries: readonly CommandPaletteEntry[]): number {
  return entries.findIndex((entry) => !entry.disabled);
}

export function nextEnabledCommand(
  entries: readonly CommandPaletteEntry[],
  current: number,
  direction: 1 | -1,
): number {
  if (entries.length === 0) return -1;
  let index = current;
  for (let step = 0; step < entries.length; step += 1) {
    index = (index + direction + entries.length) % entries.length;
    if (!entries[index]?.disabled) return index;
  }
  return -1;
}

export function isCommandMenuItem(entry: MenuEntry): entry is MenuItemSpec {
  return entry !== "sep";
}
