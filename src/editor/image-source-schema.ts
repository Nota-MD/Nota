import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

export type ImageSourceSyntax = "markdown" | "html";

export interface ImageSourceAttributes {
  src: string;
  alt: string;
  title: string;
  syntax: ImageSourceSyntax;
  zoom: number;
  width?: string;
  height?: string;
}

interface MarkdownImageNode {
  url?: string;
  alt?: string | null;
  title?: string | null;
  syntax?: ImageSourceSyntax;
  zoom?: number;
  width?: string | number | null;
  height?: string | number | null;
}

function attribute(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function htmlImageSource(attributes: Partial<ImageSourceAttributes>): string {
  const src = attribute(attributes.src);
  const alt = attribute(attributes.alt);
  const title = attribute(attributes.title);
  const width = attribute(attributes.width);
  const height = attribute(attributes.height);
  const zoom = Number(attributes.zoom ?? 100);
  const style =
    Number.isFinite(zoom) && zoom > 0 && zoom !== 100
      ? ` style="zoom:${zoom}%;"`
      : "";
  const size = `${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""}`;
  return `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ""}${size}${style} />`;
}

function sourceSyntax(value: unknown): ImageSourceSyntax {
  return value === "html" ? "html" : "markdown";
}

function sourceZoom(value: unknown): number {
  const zoom = Number(value);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 100;
}

export const imageSourceSyntaxSpec = imageSchema.extendSchema(
  (previous) => (ctx) => {
    const spec = previous(ctx);
    const previousToDOM = spec.toDOM;
    type ParserRunner = NonNullable<typeof spec.parseMarkdown.runner>;
    type SerializerRunner = NonNullable<typeof spec.toMarkdown.runner>;
    return {
      ...spec,
      attrs: {
        ...spec.attrs,
        syntax: { default: "markdown", validate: "string" },
        zoom: { default: 100, validate: "number" },
        width: { default: "", validate: "string" },
        height: { default: "", validate: "string" },
      },
      parseDOM: [
        {
          tag: "img[src]",
          getAttrs(dom: HTMLElement | string) {
            if (!(dom instanceof HTMLElement)) return false;
            const styleZoom = /(?:^|;)\s*zoom\s*:\s*([\d.]+)%/i.exec(
              dom.getAttribute("style") ?? "",
            )?.[1];
            return {
              src: dom.getAttribute("src") ?? "",
              alt: dom.getAttribute("alt") ?? "",
              title: dom.getAttribute("title") ?? "",
              syntax: sourceSyntax(
                dom.getAttribute("data-nota-image-syntax"),
              ),
              zoom: sourceZoom(
                dom.getAttribute("data-nota-image-zoom") ?? styleZoom,
              ),
              width: dom.getAttribute("width") ?? "",
              height: dom.getAttribute("height") ?? "",
            };
          },
        },
      ],
      toDOM(node: PMNode) {
        if (!previousToDOM) return ["img", { src: String(node.attrs.src ?? "") }];
        const output = previousToDOM(node) as unknown as [
          string,
          Record<string, unknown>,
          ...unknown[],
        ];
        const attributes: Record<string, unknown> = {
          ...output[1],
          "data-nota-image-syntax": sourceSyntax(node.attrs.syntax),
          "data-nota-image-zoom": String(sourceZoom(node.attrs.zoom)),
          width: String(node.attrs.width ?? "") || undefined,
          height: String(node.attrs.height ?? "") || undefined,
        };
        const zoom = sourceZoom(node.attrs.zoom);
        if (zoom !== 100) {
          attributes.style = `zoom:${zoom}%;`;
        }
        return [output[0], attributes, ...output.slice(2)];
      },
      parseMarkdown: {
        ...spec.parseMarkdown,
        runner: ((
          state: Parameters<ParserRunner>[0],
          node: MarkdownImageNode,
          type: Parameters<ParserRunner>[2],
        ) => {
          state.addNode(type, {
            src: node.url ?? "",
            alt: node.alt ?? "",
            title: node.title ?? "",
            syntax: sourceSyntax(node.syntax),
            zoom: sourceZoom(node.zoom),
            width: String(node.width ?? ""),
            height: String(node.height ?? ""),
          });
        }) as ParserRunner,
      },
      toMarkdown: {
        ...spec.toMarkdown,
        runner: ((state: Parameters<SerializerRunner>[0], node: PMNode) => {
          const syntax = sourceSyntax(node.attrs.syntax);
          const zoom = sourceZoom(node.attrs.zoom);
          const width = String(node.attrs.width ?? "");
          const height = String(node.attrs.height ?? "");
          if (syntax === "html" || zoom !== 100 || width || height) {
            state.addNode(
              "html",
              undefined,
              htmlImageSource({
                src: String(node.attrs.src ?? ""),
                alt: String(node.attrs.alt ?? ""),
                title: String(node.attrs.title ?? ""),
                zoom,
                width,
                height,
              }),
            );
            return;
          }
          spec.toMarkdown.runner?.(state, node);
        }) as SerializerRunner,
      },
    };
  },
);
