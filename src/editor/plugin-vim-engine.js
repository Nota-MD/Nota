// Vim adapter for Nota's editor. The state machine is local to the focused
// editor and runs synchronously; document edits are ProseMirror transactions
// supplied by VimEditorOps. The profile controls available modes and arrow
// key behavior, while vimrc-style text contributes additional mappings.
//
// Adapted from CatVinci Studio's MIT-licensed Textus Vim extension.

import {
  createMappingRuntime,
  parseMappings,
} from "./plugin-vim-mappings.js";

// The interface language arrives once the plugin is running: read when
// a label is made, not as this file loads.

var on = true;
var mode = "normal"; // normal | insert | visual | vline
var count = "";
var pending = ""; // an operator (d c y), "g", or a key waiting for its char (f t F T r)
var operator = null;
var register = { text: "", linewise: false };
var lastFind = null; // { char, forward, till }
var vlineCount = 1;
var cmdline = null; // the command line's text while a mapping's : runs
var feeding = 0; // above 0 while a mapping's keys are fed
var note = ""; // a line for the status until the next key (an unknown command)
var settings = { escape: "", mappings: "" };

// Dot repeat: the keys of the last change made in normal mode, from its
// count to the key that finished it.
var recording = null;
var lastChange = null;
var replaying = false;
var CHANGES = "dcxXrpPDCS~iaIAoO";
var host = null;
var profile = null;
var lastSearch = null;
var cmdKind = "ex";
var registers = { '"': { text: "", linewise: false } };
var pendingRegister = '"';
var recordingMacro = null;
var lastMacro = null;
var macros = {};
var marks = {};
var lastInsert = null;
var mappingRuntime = createMappingRuntime();

var status = null;

var MOTIONS = {
  h: "left",
  ArrowLeft: "left",
  Backspace: "left",
  l: "right",
  ArrowRight: "right",
  " ": "right",
  j: "down",
  ArrowDown: "down",
  Enter: "down",
  k: "up",
  ArrowUp: "up",
  w: "wordStart",
  W: "wordStart",
  b: "wordBack",
  B: "wordBack",
  e: "wordEnd",
  E: "wordEnd",
  0: "lineStart",
  Home: "lineStart",
  "^": "lineFirstChar",
  $: "lineEnd",
  End: "lineEnd",
  "{": "paragraphPrev",
  "}": "paragraphNext",
  G: "docEnd",
};
// Motions an operator takes the character under the end of, as Vim does.
var INCLUSIVE = { wordEnd: true, lineEnd: true, findChar: true };

function exec(op) {
  if (!host) throw new Error("Vim editor is not attached");
  return host.exec(op);
}

function label() {
  if (cmdline !== null) return (cmdKind === "search" ? "/" : ":") + cmdline;
  var names = {
    normal: "NORMAL",
    insert: "INSERT",
    visual: "VISUAL",
    vline: "V-LINE",
  };
  var text = "-- " + (names[mode] || mode.toUpperCase()) + " --";
  var typed = count + pending;
  if (note) return text + " " + note;
  return typed ? text + " " + typed : text;
}

function showStatus() {
  status = on ? label() : "";
  if (host) host.status({ enabled: on, mode: mode, label: status });
}

function captureFor(m) {
  if (host) host.capture(m, m === "insert" ? insertCaptureKeys() : null);
}

function insertCaptureKeys() {
  return mappingRuntime.insertKeys();
}

function setMode(m) {
  var previousMode = mode;
  mode = m;
  count = "";
  pending = "";
  operator = null;
  cmdline = null;
  cmdKind = "ex";
  mappingRuntime.reset();
  if (
    m === "normal" &&
    previousMode === "insert" &&
    recording &&
    !replaying
  ) {
    lastChange = recording.concat(["Escape"]);
    recording = null;
  }
  captureFor(m);
  showStatus();
  try {
    exec({ op: "cursor", style: m === "insert" ? "bar" : "block" });
  } catch (error) {
    console.error(error);
  }
}

function takeCount() {
  var n = count ? parseInt(count, 10) : 1;
  count = "";
  return n;
}

/** Keeps the keys of a change as it is typed. */
function record(key) {
  if (replaying) return;
  if (recording) {
    recording.push(key);
    return;
  }
  var starts = CHANGES.indexOf(key) >= 0;
  if (mode === "normal" && !operator && !pending && starts && key.length === 1)
    recording = (count ? count.split("") : []).concat([key]);
}

/** A change is done once nothing is pending in normal mode: it is what
 *  dot repeats. */
function endChange() {
  if (replaying || !recording) return;
  if (mode === "normal" && !pending && !operator) {
    lastChange = recording;
    recording = null;
  }
}

async function remember(text, linewise) {
  if (pendingRegister === "_") {
    pendingRegister = '"';
    return;
  }
  register = { text: text || "", linewise: !!linewise };
  registers[pendingRegister] = register;
  pendingRegister = '"';
}

function readMappings() {
  mappingRuntime.setText(settings.mappings, settings.escape);
}

/** Whether normal or visual mode's mappings may take this key: not
 *  inside something that waits for its own keys (an operator's motion,
 *  f's character, the command line). */
function mappable() {
  return !replaying && cmdline === null && !pending && !operator;
}

/** Runs keys as typed, unmapped (a mapping's right-hand side). */
async function feed(keys, remap) {
  feeding++;
  try {
    for (var i = 0; i < keys.length; i++) {
      if (remap && mappable()) await mapKey(keys[i]);
      else await dispatch(keys[i]);
    }
  } finally {
    feeding--;
  }
}

function mapKey(key) {
  return mappingRuntime.normalKey(
    mode,
    key,
    dispatch,
    feed,
    (work) => enqueue(work),
  );
}

function insertMapKey(key) {
  return mappingRuntime.insertKey(
    key,
    insertKey,
    feed,
    (count) => exec({ op: "deleteChars", count: count, back: true, copy: false }),
  );
}

// --- Operators ----------------------------------------------------------

async function applyToSelection(op) {
  if (op === "y") {
    var copied = await exec({ op: "copy" });
    await remember(copied.text, false);
    await exec({ op: "collapse", to: "start" });
    return;
  }
  var cut = await exec({ op: "delete" });
  await remember(cut.text, false);
  if (op === "c") await setMode("insert");
}

async function operateLines(op, n) {
  if (op === ">" || op === "<") {
    await exec({
      op: "indentLines",
      count: n,
      direction: op === ">" ? 1 : -1,
    });
    return;
  }
  if (op === "y") {
    var copied = await exec({ op: "copyLines", count: n });
    await remember(copied.text, true);
    return;
  }
  if (op === "c") {
    // The lines' text goes; one empty line stays, to write in.
    await exec({ op: "selectLines", count: n });
    var cut = await exec({ op: "delete" });
    await remember(cut.text + "\n", true);
    await setMode("insert");
    return;
  }
  var gone = await exec({ op: "deleteLines", count: n });
  await remember(gone.text, true);
  await exec({ op: "move", unit: "lineFirstChar" });
}

async function operateMotion(op, unit, n, extra) {
  if (unit === "down" || unit === "up") {
    if (unit === "up") await exec({ op: "move", unit: "up", count: n });
    return operateLines(op, n + 1);
  }
  // cw changes to the end of the word, as Vim's does; dw stops at the end
  // of the line; d} at the end of the paragraph.
  if (op === "c" && unit === "wordStart") unit = "wordEnd";
  else if (unit === "wordStart") unit = "wordStartInLine";
  else if (unit === "paragraphNext") unit = "paragraphEnd";
  var move = Object.assign(
    { op: "move", unit: unit, count: n, select: true },
    extra || {},
  );
  await exec(move);
  if (INCLUSIVE[unit])
    await exec({ op: "move", unit: "rightInsert", select: true });
  await applyToSelection(op);
}

// --- The command line ---------------------------------------------------

async function cmdlineKey(key) {
  if (key === "Escape" || key === "ctrl+[" || key === "ctrl+c") {
    cmdline = null;
  } else if (key === "Enter") {
    var text = cmdline;
    cmdline = null;
    showStatus();
    if (cmdKind === "search") {
      var query = text.replace(/^[/?]/, "");
      if (!query) return;
      lastSearch = { query: query, forward: text.charAt(0) !== "?" };
      return exec({ op: "search", query: query, forward: lastSearch.forward });
    }
    return runCommand(text);
  } else if (key === "Backspace") {
    cmdline = cmdline ? cmdline.slice(0, -1) : null;
  } else if (key === "ctrl+u") {
    cmdline = "";
  } else if (key.length === 1) {
    cmdline += key;
  }
  showStatus();
}

/** Save, close, line addressing, undo, and search clearing. */
async function runCommand(text) {
  // A visual selection's range ('<,'>) and a whole file's (%) mean this
  // document, as every command here does.
  var line = text.trim().replace(/^('<,'>|%)\s*/, "");
  if (!line) return;
  if (/^\d+$/.test(line)) {
    await exec({
      op: "move",
      unit: "docLine",
      count: parseInt(line, 10),
      visual: mode === "visual",
    });
    return;
  }
  if (line === "$") {
    await exec({ op: "move", unit: "docEnd", visual: mode === "visual" });
    return;
  }
  var name = line.split(/\s+/)[0];
  if (mode === "visual" || mode === "vline") {
    await exec({ op: "collapse", to: "head" });
    await setMode("normal");
  }
  switch (name) {
    case "w":
    case "w!":
    case "write":
    case "wa":
    case "wall":
    case "up":
    case "update":
      return host.command("save");
    case "q":
    case "q!":
    case "quit":
    case "quit!":
    case "clo":
    case "close":
    case "bd":
    case "bdelete":
      return host.command("close");
    case "wq":
    case "wq!":
    case "x":
    case "xit":
    case "exi":
    case "exit":
      await host.command("save");
      return host.command("close");
    case "u":
    case "undo":
      return exec({ op: "undo" });
    case "red":
    case "redo":
      return exec({ op: "redo" });
    case "noh":
    case "nohlsearch":
      lastSearch = null;
      return;
  }
  note = "Not a command here: " + name;
  showStatus();
}

// --- Normal and visual mode --------------------------------------------

async function normalKey(key) {
  if (cmdline !== null) return cmdlineKey(key);
  if (mode === "normal") record(key);

  if (key === "Escape" || key === "ctrl+[") {
    count = "";
    pending = "";
    operator = null;
    if (!replaying) recording = null;
    if (mode === "visual" || mode === "vline") {
      await exec({ op: "collapse", to: "head" });
      await setMode("normal");
    }
    showStatus();
    return;
  }

  if (pending === "register") {
    pending = "";
    if (key.length === 1) pendingRegister = key;
    showStatus();
    return;
  }
  if (pending === "macroRecord") {
    pending = "";
    recordingMacro = key;
    macros[key] = [];
    showStatus();
    return;
  }
  if (pending === "macroExecute") {
    pending = "";
    var macroName = key === "@" ? lastMacro : key;
    if (macroName && macros[macroName]) {
      lastMacro = macroName;
      var macroCount = takeCount();
      for (var replayIndex = 0; replayIndex < macroCount; replayIndex++) {
        await feed(macros[macroName]);
      }
    }
    showStatus();
    return;
  }
  if (pending === "markSet") {
    pending = "";
    if (/^[a-zA-Z]$/.test(key)) {
      var here = await exec({ op: "position" });
      marks[key] = here.line;
    }
    showStatus();
    return;
  }
  if (pending === "markJump") {
    pending = "";
    if (marks[key]) await doMotion("docLine", marks[key]);
    showStatus();
    return;
  }

  if (key === '"' && !operator) {
    pending = "register";
    showStatus();
    return;
  }
  if (key === "q" && !operator) {
    if (recordingMacro !== null) {
      recordingMacro = null;
      showStatus();
    } else if (vimFeature("macroRecording")) {
      pending = "macroRecord";
      showStatus();
    }
    return;
  }
  if (key === "@" && !operator && vimFeature("macroRecording")) {
    pending = "macroExecute";
    showStatus();
    return;
  }
  if (key === "m" && !operator) {
    pending = "markSet";
    showStatus();
    return;
  }
  if ((key === "'" || key === "`") && !operator) {
    pending = "markJump";
    showStatus();
    return;
  }

  // An operator's text object: iw (the word), aw (the word and the
  // space after it).
  if (pending === "i" || pending === "a") {
    var around = pending === "a";
    pending = "";
    var objectOp = operator;
    operator = null;
    if ((key === "w" || key === "W") && vimFeature("textObjects")) {
      await exec({ op: "move", unit: "rightInsert" });
      await exec({ op: "move", unit: "wordBack" });
      if (around) {
        await exec({ op: "move", unit: "wordStart", select: true });
      } else {
        await exec({ op: "move", unit: "wordEnd", select: true });
        await exec({ op: "move", unit: "rightInsert", select: true });
      }
      await applyToSelection(objectOp);
      endChange();
    } else if (!replaying) {
      recording = null;
    }
    showStatus();
    return;
  }

  // A key waiting for its character: f t F T r.
  if (
    pending &&
    "ftFTr".indexOf(pending) >= 0 &&
    pending.length === 1 &&
    pending !== "g"
  ) {
    if (key.length !== 1) {
      pending = "";
      operator = null;
      showStatus();
      return;
    }
    var waiting = pending;
    pending = "";
    var n = takeCount();
    if (waiting === "r") {
      await exec({ op: "replaceChar", char: key });
      endChange();
      showStatus();
      return;
    }
    var find = {
      char: key,
      forward: waiting === "f" || waiting === "t",
      till: waiting === "t" || waiting === "T",
    };
    lastFind = find;
    await doMotion("findChar", n, find);
    showStatus();
    return;
  }

  if (/^[1-9]$/.test(key) || (key === "0" && count)) {
    count += key;
    showStatus();
    return;
  }

  if (pending === "g") {
    pending = "";
    // gg, or 5gg: the fifth line.
    if (key === "g") {
      if (count) await doMotion("docLine", takeCount());
      else await doMotion("docStart", 1);
    } else if (key === "J") {
      await exec({ op: "joinLines", count: takeCount() + 1, spaces: false });
    } else if (key === "e" || key === "E") {
      await doMotion("wordEndBack", takeCount());
    } else if (key === "i" && lastInsert) {
      await exec({ op: "move", unit: "docLine", count: lastInsert.line });
      await setMode("insert");
    } else if (key === "v") {
      await exec({ op: "visualStart" });
      await setMode("visual");
    }
    showStatus();
    return;
  }

  if (key === "g") {
    pending = "g";
    showStatus();
    return;
  }

  if (
    (key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Home" ||
      key === "End") &&
    !vimFeature("arrowKeys")
  ) {
    count = "";
    showStatus();
    return;
  }

  if ("fFtT".indexOf(key) >= 0) {
    pending = key;
    showStatus();
    return;
  }

  if (key === ";" || key === ",") {
    if (lastFind) {
      var repeat = Object.assign({}, lastFind);
      if (key === ",") repeat.forward = !repeat.forward;
      await doMotion("findChar", takeCount(), repeat);
    }
    showStatus();
    return;
  }

  if (key === "ctrl+d" || key === "ctrl+u") {
    await doMotion(key === "ctrl+d" ? "down" : "up", 15 * takeCount());
    showStatus();
    return;
  }

  if ((key === ":" || key === "/" || key === "?") && !operator) {
    count = "";
    if (!replaying) recording = null;
    cmdKind = key === ":" ? "ex" : "search";
    cmdline = "";
    showStatus();
    return;
  }

  if ((key === "n" || key === "N") && lastSearch) {
    var forward = key === "n" ? lastSearch.forward : !lastSearch.forward;
    await exec({
      op: "search",
      query: lastSearch.query,
      forward: forward,
      count: takeCount(),
    });
    showStatus();
    return;
  }

  if (MOTIONS[key]) {
    // 12G: the twelfth line.
    if (key === "G" && count) await doMotion("docLine", takeCount());
    else await doMotion(MOTIONS[key], takeCount());
    showStatus();
    return;
  }

  if (mode === "visual" || mode === "vline") return visualKey(key);
  return normalCommand(key);
}

async function doMotion(unit, n, extra) {
  if (operator) {
    var op = operator;
    operator = null;
    await operateMotion(op, unit, n, extra);
    endChange();
    return;
  }
  if (mode === "vline") {
    if (unit === "down") vlineCount += n;
    else if (unit === "up") vlineCount = Math.max(1, vlineCount - n);
    await exec({ op: "collapse", to: "start" });
    await exec({ op: "selectLines", count: vlineCount });
    return;
  }
  var move = Object.assign(
    { op: "move", unit: unit, count: n, visual: mode === "visual" },
    extra || {},
  );
  await exec(move);
}

async function normalCommand(key) {
  var n;
  if (operator && (key === "i" || key === "a")) {
    pending = key;
    showStatus();
    return;
  }
  if (operator) {
    // dd, cc, yy: lines.
    if (key === operator) {
      var op = operator;
      operator = null;
      await operateLines(op, takeCount());
      endChange();
      showStatus();
      return;
    }
    operator = null;
    recording = null;
    showStatus();
    return;
  }

  switch (key) {
    case "d":
    case "c":
    case "y":
      operator = key;
      pending = "";
      showStatus();
      return;
    case "D":
      await operateMotion("d", "lineEnd", 1);
      break;
    case "C":
      await operateMotion("c", "lineEnd", 1);
      break;
    case "Y":
      await operateLines("y", takeCount());
      break;
    case "J":
      await exec({ op: "joinLines", count: takeCount() + 1 });
      break;
    case ">":
    case "<":
      operator = key;
      pending = "";
      showStatus();
      return;
    case "x":
    case "X": {
      var cut = await exec({
        op: "deleteChars",
        count: takeCount(),
        back: key === "X",
      });
      if (cut.text) await remember(cut.text, false);
      break;
    }
    case "r":
      pending = "r";
      showStatus();
      return;
    case "s":
      await exec({ op: "deleteChars", count: takeCount() });
      recording = null;
      return setMode("insert");
    case "p":
    case "P":
      n = takeCount();
      var pasted = registers[pendingRegister] || register;
      pendingRegister = '"';
      if (!pasted.text) {
        note = "Register is empty";
        break;
      }
      for (var i = 0; i < n; i++) {
        if (pasted.linewise) {
          await exec({
            op: "pasteLines",
            text: pasted.text,
            above: key === "P",
          });
        } else if (pasted.text) {
          if (key === "p") await exec({ op: "move", unit: "rightInsert" });
          await exec({ op: "insertText", text: pasted.text });
          await exec({ op: "move", unit: "left" });
        }
      }
      break;
    case "u":
      n = takeCount();
      if (!vimFeature("multiLevelUndo")) n = 1;
      for (var u = 0; u < n; u++) await exec({ op: "undo" });
      break;
    case "~":
      // The case of the characters under the caret, flipped; the caret
      // ends after them.
      await exec({
        op: "move",
        unit: "right",
        count: takeCount(),
        select: true,
      });
      await recase("flip");
      break;
    case "ctrl+r":
      if (!vimFeature("redo")) break;
      n = takeCount();
      for (var r = 0; r < n; r++) await exec({ op: "redo" });
      break;
    case ".":
      if (lastChange) {
        replaying = true;
        try {
          for (var k = 0; k < lastChange.length; k++)
            await dispatch(lastChange[k]);
        } finally {
          replaying = false;
        }
      }
      break;
    case "i":
      lastInsert = await exec({ op: "position" });
      return setMode("insert");
    case "a":
      await exec({ op: "move", unit: "rightInsert" });
      lastInsert = await exec({ op: "position" });
      return setMode("insert");
    case "I":
      await exec({ op: "move", unit: "lineFirstChar" });
      lastInsert = await exec({ op: "position" });
      return setMode("insert");
    case "A":
      await exec({ op: "move", unit: "lineEndInsert" });
      lastInsert = await exec({ op: "position" });
      return setMode("insert");
    case "o":
    case "O":
      await exec({ op: "openLine", above: key === "O" });
      lastInsert = await exec({ op: "position" });
      return setMode("insert");
    case "v":
      if (!vimFeature("visual")) break;
      await exec({ op: "visualStart" });
      return setMode("visual");
    case "V":
      if (!vimFeature("visualLine")) break;
      vlineCount = 1;
      await exec({ op: "selectLines", count: 1 });
      return setMode("vline");
    default:
      count = "";
      if (!replaying) recording = null;
  }
  endChange();
  showStatus();
}

async function visualKey(key) {
  if (key === "d" || key === "x" || key === "y" || key === "c") {
    var op = key === "x" ? "d" : key;
    if (mode === "vline") {
      await exec({ op: "collapse", to: "start" });
      await setMode("normal");
      await operateLines(op, vlineCount);
    } else {
      await applyToSelection(op);
      if (op !== "c") await setMode("normal");
    }
    showStatus();
    return;
  }
  // ~ flips the selection's case, U upper-cases it, u lower-cases it -
  // within a paragraph (a visual-line selection keeps its blocks).
  if ((key === "~" || key === "U" || key === "u") && mode === "visual") {
    await recase(key === "~" ? "flip" : key === "U" ? "upper" : "lower");
    await setMode("normal");
    showStatus();
    return;
  }
  if (key === "v" || key === "V") {
    await exec({ op: "collapse", to: "head" });
    await setMode("normal");
  }
}

/** The selection's text again in another case. */
async function recase(how) {
  var copied = await exec({ op: "copy" });
  var text = copied.text || "";
  if (!text || text.indexOf("\n") >= 0) {
    await exec({ op: "collapse", to: "head" });
    return;
  }
  var next =
    how === "upper"
      ? text.toUpperCase()
      : how === "lower"
        ? text.toLowerCase()
        : text
            .split("")
            .map(function (c) {
              var up = c.toUpperCase();
              return c === up ? c.toLowerCase() : up;
            })
            .join("");
  await exec({ op: "insertText", text: next });
}

// --- Insert mode --------------------------------------------------------

async function insertKey(key) {
  if (key === "Escape" || key === "ctrl+[") {
    mappingRuntime.reset();
    await setMode("normal");
    await exec({ op: "move", unit: "left" });
    return;
  }
  // A key typed while the editor still sent every key here (just after
  // i, cw, o...), or one a mapping starts with: typed as it is.
  if (key.length === 1) await exec({ op: "insertText", text: key });
  else if (key === "Enter") await exec({ op: "insertText", text: "\n" });
  else if (key === "Backspace")
    await exec({ op: "deleteChars", count: 1, back: true, copy: false });
  else if (key === "Delete")
    await exec({ op: "deleteChars", count: 1, copy: false });
  else if (key === "Tab") await exec({ op: "insertText", text: "\t" });
}

// --- Wiring -------------------------------------------------------------

/** One key, as typed, no mapping looked up. */
function dispatch(key) {
  return mode === "insert" ? insertKey(key) : normalKey(key);
}

var queue = Promise.resolve();
function enqueue(work) {
  queue = queue.then(work).catch(function (err) {
    console.error(err);
  });
}

function handle(key) {
  enqueue(function () {
    if (note) {
      note = "";
      showStatus();
    }
    if (recordingMacro !== null && key !== "q" && macros[recordingMacro]) {
      macros[recordingMacro].push(key);
    }
    if (mode === "insert")
      return mappingRuntime.hasInsertMappings() ? insertMapKey(key) : insertKey(key);
    if (
      (mappingRuntime.hasNormalMappings(mode) && mappable()) ||
      mappingRuntime.typedNormal()
    )
      return mapKey(key);
    return normalKey(key);
  });
}

async function readSettings() {
  settings.escape = "";
  settings.mappings = host && host.mappings ? host.mappings() : "";
  readMappings();
}

function resetState() {
  mode = "normal";
  count = "";
  pending = "";
  operator = null;
  cmdline = null;
  note = "";
  recording = null;
  mappingRuntime.reset();
  vlineCount = 1;
}

export function configureVim(nextHost, config) {
  host = nextHost;
  profile = config && config.profile ? config.profile : null;
  on = !!(config && config.enabled);
  resetState();
  readSettings();
  if (on) setMode("normal");
  else showStatus();
}

export function handleVimKey(key) {
  if (!on) return false;
  handle(key);
  return true;
}

export function vimInsertCaptureKeys() {
  return insertCaptureKeys();
}

export function recordVimInsertText(text) {
  if (replaying || !text) return;
  for (var textIndex = 0; textIndex < text.length; textIndex++) {
    if (recordingMacro !== null && macros[recordingMacro]) {
      macros[recordingMacro].push(text[textIndex]);
    }
    if (recording) recording.push(text[textIndex]);
  }
}

export function recordVimInsertKey(key) {
  if (replaying) return;
  if (recordingMacro !== null && macros[recordingMacro]) {
    macros[recordingMacro].push(key);
  }
  if (recording) recording.push(key);
}

export function vimMode() {
  return mode;
}

export function vimFeature(name) {
  var features = profile && profile.features;
  if (!features) return name !== "compatible";
  if (name === "arrowKeys") return !!features.arrowKeys;
  if (name === "visual") return !!(features.modes && features.modes.visual);
  if (name === "visualLine") return !!(features.modes && features.modes.visualLine);
  if (name === "redo") return features.redo !== false;
  return features[name] !== false;
}

// Kept exported for focused tests of vimrc-style mapping parsing.
export { parseMappings };
