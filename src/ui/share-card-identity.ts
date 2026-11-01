/**
 * Persistent identity used by every share card and focus summary.
 *
 * This is presentation state, not a document property: keeping it in
 * localStorage means the same name/avatar follows all share surfaces without
 * giving plugins access to arbitrary files. The fallback is deliberately
 * conservative: no promotion QR until the user opts in.
 */

export const NOTA_PROMOTION_URL = "https://nota-md.github.io/";

export interface ShareCardIdentity {
  name: string;
  avatar: string;
  includePromotion: boolean;
}

const storageKey = "nota.share-card.identity.v1";
const avatarPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const listeners = new Set<() => void>();
let cached: ShareCardIdentity | null = null;

const fallback: ShareCardIdentity = {
  name: "",
  avatar: "",
  includePromotion: false,
};

function cleanName(value: unknown): string {
  return Array.from(typeof value === "string" ? value : "")
    .filter((character) => character !== "\n" && character !== "\r" && character !== "\0")
    .slice(0, 48)
    .join("")
    .trim();
}

function cleanAvatar(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000_000) return "";
  return avatarPattern.test(value) ? value : "";
}

export function normaliseShareIdentity(value: unknown): ShareCardIdentity {
  if (typeof value !== "object" || value === null) return { ...fallback };
  const raw = value as Record<string, unknown>;
  return {
    name: cleanName(raw.name),
    avatar: cleanAvatar(raw.avatar),
    includePromotion: raw.includePromotion === true,
  };
}

function load(): ShareCardIdentity {
  if (typeof localStorage === "undefined") return { ...fallback };
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normaliseShareIdentity(JSON.parse(raw)) : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

/** Stable snapshot for `useSyncExternalStore`; do not return a fresh object. */
export function readShareIdentity(): ShareCardIdentity {
  if (cached === null) cached = load();
  return cached;
}

export function writeShareIdentity(next: ShareCardIdentity): ShareCardIdentity {
  cached = normaliseShareIdentity(next);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cached));
    } catch {
      /* A blocked storage area must not break the share card. */
    }
  }
  for (const listener of listeners) listener();
  return cached;
}

export function subscribeShareIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One or two visible characters for the fallback avatar. */
export function shareInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = Array.from(words[0] ?? "")[0] ?? "";
    const second = Array.from(words[1] ?? "")[0] ?? "";
    return (first + second).toUpperCase();
  }
  return Array.from(words[0] ?? "N").slice(0, 2).join("").toUpperCase();
}
