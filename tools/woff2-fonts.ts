import { createRequire } from "node:module";
import { basename, extname } from "node:path";
import type { OutputAsset, OutputBundle } from "rollup";
import type { Plugin } from "vite";

import { collapseFontFaces } from "./font-css";

const require = createRequire(import.meta.url);
const { compress } = require("wawoff2") as {
  compress: (source: Uint8Array) => Promise<Uint8Array>;
};

const legacyFontExtensions = new Set([".ttf", ".otf", ".woff"]);
const fontExtensions = new Set([".woff2", ...legacyFontExtensions]);

function assetText(asset: OutputAsset): string {
  return typeof asset.source === "string"
    ? asset.source
    : Buffer.from(asset.source).toString("utf8");
}

/**
 * Release assets keep only WOFF2 fonts.
 *
 * Source masters may remain in the repository for license/audit and future
 * regeneration. The browser payload never receives the duplicated WOFF or TTF
 * fallbacks. A WOFF-only source is rejected because it has no corresponding
 * WOFF2 source and silently keeping the legacy format would defeat this gate.
 */
export function woff2OnlyFonts(): Plugin {
  return {
    name: "nota-woff2-only-fonts",
    apply: "build",
    async generateBundle(_options, bundle: OutputBundle) {
      const renamed = new Map<string, string>();

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "asset") continue;
        if (extname(fileName).toLowerCase() !== ".ttf" && extname(fileName).toLowerCase() !== ".otf") {
          continue;
        }
        const source = typeof output.source === "string" ? Buffer.from(output.source) : Buffer.from(output.source);
        const compressed = Buffer.from(await compress(source));
        const woff2Name = fileName.slice(0, -extname(fileName).length) + ".woff2";
        renamed.set(basename(fileName), basename(woff2Name));
        bundle[woff2Name] = {
          type: "asset",
          fileName: woff2Name,
          name: woff2Name,
          names: [woff2Name],
          originalFileName: woff2Name,
          originalFileNames: [woff2Name],
          needsCodeReference: false,
          source: compressed,
        };
      }

      const referencedWoff2 = new Set<string>();
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "asset" || extname(fileName).toLowerCase() !== ".css") continue;
        let css = assetText(output);
        for (const [from, to] of renamed) css = css.split(from).join(to);
        css = collapseFontFaces(css);
        output.source = css;

        for (const match of css.matchAll(/url\([^)]*?\/([^/)"']+\.woff2)(?:[?#][^)]*)?\)/g)) {
          if (match[1]) referencedWoff2.add(match[1]);
        }
        for (const match of css.matchAll(/url\(["']?\.\/([^/)"']+\.woff2)(?:[?#][^)"']*)?["']?\)/g)) {
          if (match[1]) referencedWoff2.add(match[1]);
        }
        const nonWoff2Reference = css.match(/url\([^)]*\.(ttf|otf|woff)(?:[?#][^)]*)?\)/i);
        if (nonWoff2Reference) {
          const at = nonWoff2Reference.index ?? 0;
          this.error(
            `Non-WOFF2 font reference remains in ${fileName}: ${nonWoff2Reference[0]}\n${css.slice(Math.max(0, at - 180), at + 300)}`,
          );
        }
      }

      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "asset") continue;
        const extension = extname(fileName).toLowerCase();
        if (!fontExtensions.has(extension)) continue;
        const name = basename(fileName);
        if (extension !== ".woff2" || !referencedWoff2.has(name)) {
          delete bundle[fileName];
        }
      }
    },
  };
}
