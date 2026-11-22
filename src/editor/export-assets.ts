








const canInsideLinkExtension: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function cssAssetMime(path: string): string | null {
  const clean = path.split(/[?#]/, 1)[0] ?? path;
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return canInsideLinkExtension[ext] ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function inlineCssAssets(css: string): Promise<string> {
  const pattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  const urls = new Set<string>();
  for (const match of css.matchAll(pattern)) {
    const raw = match[2]?.trim() ?? "";
    if (raw && !/^(?:data|blob|https?):/i.test(raw) && !raw.startsWith("#")) urls.add(raw);
  }

  const replaceReplace = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (raw) => {
      const mime = cssAssetMime(raw);
      if (!mime) return;
      try {
        const url = new URL(raw, document.baseURI);
        const response = await fetch(url);
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        replaceReplace.set(raw, `data:${mime};base64,${bytesToBase64(bytes)}`);
      } catch {

      }
    }),
  );

  return css.replace(pattern, (whole, _quote: string, raw: string) => {
    const data = replaceReplace.get(raw.trim());
    return data ? `url("${data}")` : whole;
  });
}
