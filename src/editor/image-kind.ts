






import { NormalizeUrl } from "./url-link";


export const imageSliceExtension = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
];


export function isImageSliceTextItem(path: string): boolean {
  const tail = path.split(".").pop()?.toLowerCase() ?? "";
  return imageSliceExtension.includes(tail);
}


export function imageExtensionFromMime(type: string): string {
  const lower = type.toLowerCase();
  if (lower === "image/jpeg") return "jpg";
  if (lower === "image/svg+xml") return "svg";
  const tail = (lower.split("/")[1] ?? "").replace(/\+.*$/, "");
  return imageSliceExtension.includes(tail) ? tail : "png";
}





const straightImageHosts: ReadonlySet<string> = new Set([
  "img.shields.io",
  "shields.io",
  "images.unsplash.com",
  "plus.unsplash.com",
  "images.pexels.com",
  "picsum.photos",
  "placehold.co",
  "dummyimage.com",
  "via.placeholder.com",
  "avatars.githubusercontent.com",
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
  "camo.githubusercontent.com",
  "images.weserv.nl",
  "wsrv.nl",
]);








export function imageAddressOfPastedText(candidate: string): string | null {
  const address = NormalizeUrl(candidate);
  if (!address) return null;

  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch {
    return null;
  }

  const pathname = parsed.pathname;
  const tail = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (isImageSliceTextItem(tail)) return address;
  if (straightImageHosts.has(parsed.hostname.toLowerCase())) return address;
  return null;
}

/** A stable fallback for an image inserted without explicit alt text. */
export function automaticImageName(address: string): string {
  const clean = address.trim();
  if (!clean || /^(?:blob|data):/i.test(clean)) return "Image";
  const path = clean.split(/[?#]/, 1)[0] ?? "";
  let leaf = path.split(/[\\/]/).at(-1) ?? "";
  try {
    leaf = decodeURIComponent(leaf);
  } catch {
    /* Keep the encoded filename when percent-decoding fails. */
  }
  return leaf.replace(/\.[^.]+$/, "").trim() || "Image";
}
