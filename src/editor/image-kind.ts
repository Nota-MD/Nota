/**
 * 图片识别共用的纯判据。
 *
 * 文件选择器、拖入和粘贴三条路都问“这是不是图片”。后缀表放在这里，
 * 避免 UI 与编辑器各维护一份后在新增格式时出现行为差异。
 */

import { NormalizeUrl } from "./url-link";

/** 认得的图片后缀。与 `src-tauri/src/image.rs` 的列表保持一致。 */
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

/** 一条文件名或路径是否以支持的图片后缀结尾。 */
export function isImageSliceTextItem(path: string): boolean {
  const tail = path.split(".").pop()?.toLowerCase() ?? "";
  return imageSliceExtension.includes(tail);
}

/** `image/png` → `png`；JPEG 与 SVG 的 MIME 名称需要单独归一。 */
export function imageExtensionFromMime(type: string): string {
  const lower = type.toLowerCase();
  if (lower === "image/jpeg") return "jpg";
  if (lower === "image/svg+xml") return "svg";
  const tail = (lower.split("/")[1] ?? "").replace(/\+.*$/, "");
  return imageSliceExtension.includes(tail) ? tail : "png";
}

/**
 * 常见图片 CDN 的地址不一定带文件后缀，例如 `img.shields.io/badge/...`。
 * 这里只列稳定、明确以图片为返回内容的域名，避免把普通网页误判成图片。
 */
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

/**
 * 剪贴板里单独一条网址是否是图片地址；是的话返回可直接写进 image 节点的地址。
 *
 * 只认整段就是一条 URL 的输入。正文里夹着一条图片网址时仍当普通文字处理，
 * 不替用户重排整段内容。查询串和片段不参与后缀判断，因此
 * `photo.png?raw=true#preview` 仍能识别。
 */
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
