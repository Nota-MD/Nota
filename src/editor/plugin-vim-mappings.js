// Vimrc-style mapping parser and timed mapping runtime.

const MAP_TIMEOUT = 1000;
const KEY_NAMES = {
  esc: "Escape",
  cr: "Enter",
  enter: "Enter",
  return: "Enter",
  space: " ",
  bs: "Backspace",
  tab: "Tab",
  del: "Delete",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  home: "Home",
  end: "End",
  lt: "<",
  bar: "|",
  bslash: "\\",
};
const MAP_MODES = {
  map: { modes: "nv", remap: true },
  noremap: { modes: "nv", remap: false },
  nmap: { modes: "n", remap: true },
  nnoremap: { modes: "n", remap: false },
  vmap: { modes: "v", remap: true },
  vnoremap: { modes: "v", remap: false },
  xmap: { modes: "v", remap: true },
  xnoremap: { modes: "v", remap: false },
  imap: { modes: "i", remap: true },
  inoremap: { modes: "i", remap: false },
  "map!": { modes: "i", remap: true },
  "noremap!": { modes: "i", remap: false },
};

export function parseKeys(text, leader) {
  const keys = [];
  let i = 0;
  while (i < text.length) {
    const close = text[i] === "<" ? text.indexOf(">", i) : -1;
    if (close > i) {
      const name = text.slice(i + 1, close).toLowerCase();
      const ctrl = /^c-(.)$/.exec(name);
      if (name === "leader") keys.push(...leader);
      else if (ctrl) keys.push(`ctrl+${ctrl[1]}`);
      else if (KEY_NAMES[name]) keys.push(KEY_NAMES[name]);
      else keys.push(...text.slice(i, close + 1).split(""));
      i = close + 1;
    } else {
      keys.push(text[i]);
      i++;
    }
  }
  return keys;
}

export function parseMappings(text) {
  const found = { n: [], v: [], i: [] };
  let leader = ["\\"];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.trim();
      if (!line || line[0] === '"') return;
      const lead = /^let\s+mapleader\s*=\s*(["'])(.*)\1\s*$/.exec(line);
      if (lead) {
        leader = parseKeys(lead[2].replace(/^\\</, "<"), []);
        return;
      }
      const words = line.split(/\s+/);
      const definition = MAP_MODES[words[0]];
      if (!definition) return;
      const rest = words.slice(1);
      while (rest.length && /^<(silent|buffer|nowait|expr|unique)>$/i.test(rest[0])) {
        rest.shift();
      }
      if (rest.length < 2) return;
      const lhs = parseKeys(rest[0], leader);
      const rhs = parseKeys(rest.slice(1).join(" "), leader);
      definition.modes
        .split("")
        .forEach((mode) => found[mode].push({ lhs, rhs, remap: definition.remap }));
    });
  return found;
}

function same(a, b) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function startsWith(keys, prefix) {
  return keys.length > prefix.length && same(keys.slice(0, prefix.length), prefix);
}

export function createMappingRuntime() {
  let maps = { n: [], v: [], i: [] };
  let typedNormal = [];
  let typedInsert = [];
  let typedInsertAt = 0;
  let timer = null;

  function setText(text, escape = "") {
    maps = parseMappings(text);
    if (escape.length === 2) {
      maps.i.push({ lhs: [escape[0], escape[1]], rhs: ["Escape"] });
    }
    reset();
  }

  function reset() {
    typedNormal = [];
    typedInsert = [];
    clearTimeout(timer);
  }

  function insertKeys() {
    const keys = ["Escape", "ctrl+["];
    for (const mapping of maps.i) {
      for (const key of mapping.lhs) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return keys;
  }

  async function normalKey(mode, key, dispatch, feed, schedule) {
    const list = maps[mode === "normal" ? "n" : "v"];
    const typed = typedNormal.concat([key]);
    const whole = list.find((mapping) => same(mapping.lhs, typed));
    const longer = list.some((mapping) => startsWith(mapping.lhs, typed));
    clearTimeout(timer);
    if (longer) {
      typedNormal = typed;
      timer = setTimeout(() => {
        schedule(async () => {
          if (!same(typedNormal, typed)) return;
          typedNormal = [];
          await feed(whole ? whole.rhs : typed);
        });
      }, MAP_TIMEOUT);
      return;
    }
    typedNormal = [];
    if (whole) return feed(whole.rhs, whole.remap);
    for (let i = 0; i < typed.length - 1; i++) await dispatch(typed[i]);
    return dispatch(key);
  }

  async function insertKey(key, insert, feed, deleteBack) {
    const now = Date.now();
    if (now - typedInsertAt > MAP_TIMEOUT) typedInsert = [];
    const typed = typedInsert.concat([key]);
    const whole = maps.i.find((mapping) => same(mapping.lhs, typed));
    const longer = maps.i.some((mapping) => startsWith(mapping.lhs, typed));
    if (whole && !longer) {
      const back = typedInsert.filter((item) => item.length === 1).length;
      typedInsert = [];
      if (back) await deleteBack(back);
      return feed(whole.rhs, whole.remap);
    }
    const begins = maps.i.some(
      (mapping) => startsWith(mapping.lhs, [key]) || same(mapping.lhs, [key]),
    );
    typedInsert = longer ? typed : begins ? [key] : [];
    typedInsertAt = now;
    return insert(key);
  }

  return {
    setText,
    reset,
    insertKeys,
    normalKey,
    insertKey,
    hasInsertMappings: () => maps.i.length > 0,
    hasNormalMappings: (mode) => maps[mode === "normal" ? "n" : "v"].length > 0,
    typedNormal: () => typedNormal.length,
  };
}
