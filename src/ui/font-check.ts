


























const sample = "mmmmWWQ0123ili English test font";


const fallbackFamily = ["monospace", "serif", "sans-serif"] as const;







const followPackageCharacterBody = new Set<string>();


export function isFollowPackageCharacterBody(name2: string): boolean {
  return followPackageCharacterBody.has(name2.trim().replace(/^["']|["']$/g, "").trim());
}







export function characterBodyCanUse(name2: string): boolean {
  const name3 = name2.trim().replace(/^["']|["']$/g, "").trim();
  if (!name3) return true;


  if (isFollowPackageCharacterBody(name3)) {
    void document.fonts.load(`16px "${name3}"`, sample);
    return true;
  }
  const drawDistribute = document.createElement("canvas").getContext("2d");
  if (!drawDistribute) return true;




  const drawDistributeHas = fontSizes.some((characterNumber2) =>
    fallbackFamily.some((fallback) => {
      drawDistribute.font = `${characterNumber2}px ${fallback}`;
      const baseAccurate = drawDistribute.measureText(sample).width;
      drawDistribute.font = `${characterNumber2}px "${name3}", ${fallback}`;
      const tryPass = drawDistribute.measureText(sample).width;

      return Math.abs(tryPass - baseAccurate) > 0.5;
    }),
  );
  if (drawDistributeHas) return true;




  return layoutMeasureObtainTo(name3);
}


function layoutMeasureObtainTo(name3: string): boolean {
  const alpha = document.createElement("span");
  const beta = document.createElement("span");
  for (const el of [alpha, beta]) {
    el.textContent = sample;
    el.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font-size:16px";
  }
  alpha.style.fontFamily = "monospace";
  beta.style.fontFamily = `"${name3}", monospace`;
  document.body.append(alpha, beta);
  const difference = Math.abs(alpha.getBoundingClientRect().width - beta.getBoundingClientRect().width);
  alpha.remove();
  beta.remove();
  return difference > 0.5;
}


const fontSizes = [16, 24, 32] as const;









export function firstSelectCharacterBody(css: string): string | null {
  const candidate = canSelectCharacterBody(css);
  return candidate[0] ?? null;
}








export function canSelectCharacterBody(css: string): string[] {
  const match =
    /--font-doc\s*:\s*([^;]+);/.exec(css) ??
    /--font-family\s*:\s*([^;]+);/.exec(css);
  if (!match?.[1]) return [];
  const throughUse = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "inherit",
    "initial",
    "unset",
    "-apple-system",
    "",
  ]);
  return match[1]
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, "").trim())
    .filter((x) => x.length > 0 && !throughUse.has(x.toLowerCase()));
}

/** Font families supplied by `@font-face` rules in a theme stylesheet. */
export function declaredThemeFamilies(css: string): string[] {
  const families = new Set<string>();
  const rules = /@font-face\s*\{([^}]*)\}/gi;
  for (const match of css.matchAll(rules)) {
    const family = /font-family\s*:\s*([^;]+);/i.exec(match[1] ?? "");
    const name = family?.[1]?.trim().replace(/^["']|["']$/g, "").trim();
    if (name) families.add(name);
  }
  return [...families];
}
