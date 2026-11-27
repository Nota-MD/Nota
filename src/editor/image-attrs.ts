






























































import { $remark } from "@milkdown/kit/utils";


interface MdastNode {
  type?: string;
  alt?: string | null;
  title?: string | null;
  url?: string | null;
  value?: string | null;
  zoom?: number;
  syntax?: "markdown" | "html";
  children?: MdastNode[];
}

export function imageFromHtmlOnly(
  source: string,
): {
  src: string;
  alt: string;
  title: string;
  zoom: number;
  syntax: "html";
} | null {
  const image = /^\s*(?:<(p|div|span)\b[^>]*>\s*)?<img\b([^>]*?)\/?>\s*(?:<\/\1>\s*)?$/i.exec(
    source,
  );
  if (!image) return null;
  const attributes = new Map<string, string>();
  const pattern =
    /([a-z_:][a-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of (image[2] ?? "").matchAll(pattern)) {
    attributes.set(
      (match[1] ?? "").toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  const src = attributes.get("src");
  if (!src) return null;
  const zoomText = /(?:^|;)\s*zoom\s*:\s*([\d.]+)%/i.exec(
    attributes.get("style") ?? "",
  )?.[1];
  const parsedZoom = Number(zoomText);
  return {
    src,
    alt: attributes.get("alt") ?? "",
    title: attributes.get("title") ?? "",
    zoom: Number.isFinite(parsedZoom) && parsedZoom > 0 ? parsedZoom : 100,
    syntax: "html",
  };
}


export function normalizeImageHtmlNodes(node: MdastNode): void {
  if (node.type === "image") {
    if (node.alt === null || node.alt === undefined) node.alt = "";
    if (node.title === null || node.title === undefined) node.title = "";
  }


  if (Array.isArray(node.children)) {
    node.children = node.children.map((child) => {
      if (child.type === "html" && child.value) {
        const parsed = imageFromHtmlOnly(child.value);
        if (parsed) {
          const image: MdastNode = {
            type: "image",
            url: parsed.src,
            alt: parsed.alt,
            title: parsed.title,
            zoom: parsed.zoom,
            syntax: "markdown",
          };
          return node.type === "root"
            ? { type: "paragraph", children: [image] }
            : image;
        }
      }
      if (
        child.type === "paragraph" &&
        child.children?.length === 1 &&
        child.children[0]?.type === "html" &&
        child.children[0].value
      ) {
        const parsed = imageFromHtmlOnly(child.children[0].value);
        if (parsed) {
          const image: MdastNode = {
            type: "image",
            url: parsed.src,
            alt: parsed.alt,
            title: parsed.title,
            zoom: parsed.zoom,
            syntax: "markdown",
          };
          return node.type === "root"
            ? { type: "paragraph", children: [image] }
            : image;
        }
      }
      normalizeImageHtmlNodes(child);
      return child;
    });
  }
}





export const fillAllImageSliceAttribute = $remark("nota-image-attrs", () => () => (tree: MdastNode) => {
  normalizeImageHtmlNodes(tree);
});
