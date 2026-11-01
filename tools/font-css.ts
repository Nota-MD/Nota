function splitCssValues(value: string): string[] {
  const output: string[] = [];
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (character === "," && depth === 0) {
      output.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  output.push(value.slice(start).trim());
  return output.filter(Boolean);
}

/** Keep only the first WOFF2 source in every CSS `src:` list. */
export function collapseFontFaces(css: string): string {
  let output = "";
  let cursor = 0;
  for (const match of css.matchAll(/\bsrc\s*:\s*/g)) {
    const start = (match.index ?? 0) + match[0].length;
    let end = start;
    let quote = "";
    let depth = 0;
    for (; end < css.length; end++) {
      const character = css[end]!;
      if (quote) {
        if (character === "\\") end++;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === "(") depth++;
      else if (character === ")") depth--;
      else if ((character === ";" || character === "}") && depth === 0) break;
    }
    const values = splitCssValues(css.slice(start, end));
    const woff2 = values.find(
      (value) => /data:font\/woff2|\.woff2(?:["')?#]|$)/.test(value),
    );
    if (!woff2) continue;
    output += css.slice(cursor, start) + woff2;
    cursor = end;
  }
  return cursor === 0 ? css : output + css.slice(cursor);
}
