



































import { walkMenuItems, type MenuSpec } from "@/ui/commands";


export interface Accel {

  ctrl: boolean;
  shift: boolean;

  alt: boolean;

  key: string;
}


function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const s = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad/i.test(s);
}


export const IS_MAC = detectMac();








const KEY_ALIASES: Record<string, string> = {
  "↑": "arrowup",
  "↓": "arrowdown",
  "←": "arrowleft",
  "→": "arrowright",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  esc: "escape",
  escape: "escape",
  return: "enter",
  enter: "enter",
  space: " ",
  spacebar: " ",
  tab: "tab",
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",
  backspace: "backspace",
  del: "delete",
  delete: "delete",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  bracketleft: "[",
  bracketright: "]",
  backslash: "\\",
  backquote: "`",
  minus: "-",
  equal: "=",
  plus: "=",
};






const MOD_ALIASES: Record<string, "ctrl" | "shift" | "alt"> = {
  ctrl: "ctrl",
  control: "ctrl",
  cmd: "ctrl",
  command: "ctrl",
  meta: "ctrl",
  super: "ctrl",
  win: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  opt: "alt",
};


function normalizeKey(token: string): string {
  const t = token.trim();
  if (!t) return "";

  return KEY_ALIASES[t.toLowerCase()] ?? t.toLowerCase();
}








export function parseAccel(text: string): Accel | null {




  const parts = text
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts.pop();
  if (!last) return null;

  const accel: Accel = { ctrl: false, shift: false, alt: false, key: "" };
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (!mod) return null;
    accel[mod] = true;
  }

  const key = normalizeKey(last);
  if (!key) return null;
  accel.key = key;
  return accel;
}







export function accelSig(a: Accel): string {
  return `${a.ctrl ? "c" : "-"}${a.shift ? "s" : "-"}${a.alt ? "a" : "-"}:${a.key}`;
}





const CODE_TO_KEY: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Escape: "escape",
  Enter: "enter",
  NumpadEnter: "enter",
  Space: " ",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};







for (let i = 0; i <= 9; i++) CODE_TO_KEY[`Digit${i}`] = String(i);
for (let i = 0; i < 26; i++) {
  const upper = String.fromCharCode(65 + i);
  CODE_TO_KEY[`Key${upper}`] = upper.toLowerCase();
}
for (let i = 1; i <= 24; i++) CODE_TO_KEY[`F${i}`] = `f${i}`;














function eventKey(e: KeyboardEvent): string {
  return CODE_TO_KEY[e.code] ?? e.key.toLowerCase();
}







export function eventAccel(e: KeyboardEvent, mac: boolean = IS_MAC): Accel {
  return {


    ctrl: mac ? e.metaKey : e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key: eventKey(e),
  };
}


const MAC_GLYPH: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  escape: "esc",
  enter: "↩",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  " ": "Space",
  pageup: "⇞",
  pagedown: "⇟",
  home: "↖",
  end: "↘",
};














export function formatAccel(text: string, mac: boolean = IS_MAC): string {
  if (!mac) return text;
  const a = parseAccel(text);
  if (!a) return text;

  let out = "";
  if (a.alt) out += "⌥";
  if (a.shift) out += "⇧";
  if (a.ctrl) out += "⌘";
  out += MAC_GLYPH[a.key] ?? a.key.toUpperCase();
  return out;
}


const KEY_TEXT: Record<string, string> = {
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  escape: "Escape",
  enter: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
};





















export function accelToText(a: Accel): string | null {
  if (["control", "shift", "alt", "meta", "os"].includes(a.key)) return null;
  if (!a.key || /[+\s]/.test(a.key)) return null;
  if (!a.ctrl && !a.shift && !a.alt && a.key.length === 1) return null;

  let out = "";
  if (a.ctrl) out += "Ctrl+";
  if (a.shift) out += "Shift+";
  if (a.alt) out += "Alt+";
  out += KEY_TEXT[a.key] ?? a.key.toUpperCase();
  return out;
}















export function buildAccelIndex(menus: readonly MenuSpec[]): Map<string, string> {
  const index = new Map<string, string>();

  walkMenuItems(menus, (item) => {
    if (!item.accel) return;

    const accel = parseAccel(item.accel);
    if (!accel) {
      console.warn(
        `[nota] Unknown shortcut "${item.accel}" on menu item ${item.id}; the key will not be bound`,
      );
      return;
    }

    const sig = accelSig(accel);
    const prev = index.get(sig);
    if (prev) {
      console.warn(
        `[nota] Shortcut "${item.accel}" is used by both ${prev} and ${item.id}; ${prev} wins`,
      );
      return;
    }
    index.set(sig, item.id);
  });

  return index;
}
















export function isOutsideEditor(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest(".editor-pane")) return false;
  return el.closest("input, textarea, select, [contenteditable='true']") !== null;
}
