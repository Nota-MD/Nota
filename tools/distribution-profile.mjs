import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

export const DISTRIBUTION_SCHEMA_VERSION = 1;
export const OFFICIAL_IDENTIFIER = "io.github.nota.Nota";
export const OFFICIAL_DATA_DIRECTORY = "nota";

const repositoryRoot = resolve(process.cwd());

const topKeys = new Set([
  "schemaVersion",
  "kind",
  "id",
  "identity",
  "branding",
  "defaults",
  "bootstrap",
  "extensions",
  "legal",
  "updates",
  "onboarding",
]);

const identityKeys = new Set([
  "name",
  "productName",
  "binaryName",
  "identifier",
  "publisher",
  "website",
  "supportUrl",
  "dataDirectory",
]);

const brandingKeys = new Set([
  "logo",
  "icon",
  "primaryColor",
  "uiStyle",
  "documentTheme",
]);

const defaultsKeys = new Set([
  "language",
  "uiMode",
  "documentTheme",
  "checkForUpdates",
]);

const bootstrapKeys = new Set(["backup", "revision", "allowExtensionSettings"]);
const extensionsKeys = new Set(["enabledByDefault", "bundled"]);
const bundledKeys = new Set(["package", "sha256"]);
const legalKeys = new Set([
  "copyright",
  "upstreamLicense",
  "distributionLicense",
  "notice",
]);
const updatesKeys = new Set(["manifestUrl", "releasePrefix", "releasePage"]);
const onboardingKeys = new Set(["mode", "guide", "fallbackLocale", "title"]);

function fail(message) {
  throw new Error(`distribution profile: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field "${key}"`);
  }
}

function text(value, label, { nullable = false, max = 200 } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  if (value.length > max) fail(`${label} is too long`);
  if (/[\u0000-\u001f\u007f]/.test(value)) fail(`${label} contains control characters`);
  return value;
}

function optionalText(value, label, options) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, label, options);
}

function slug(value, label) {
  const result = text(value, label, { max: 64 });
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(result)) {
    fail(`${label} must use lowercase ASCII letters, digits, dot, dash, or underscore`);
  }
  return result;
}

function httpsUrl(value, label, { nullable = false, prefix = false } = {}) {
  if (nullable && value === null) return null;
  const result = text(value, label, { max: 2048 });
  let parsed;
  try {
    parsed = new URL(result);
  } catch {
    fail(`${label} must be a complete URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must use HTTPS`);
  if (prefix && !result.endsWith("/")) fail(`${label} must end with "/"`);
  return result;
}

function safeRelative(value, label) {
  const result = text(value, label, { max: 512 });
  if (isAbsolute(result)) fail(`${label} must be relative`);
  const normalized = result.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} contains an unsafe path segment`);
  }
  return normalized;
}

function assetPath(profileDir, value, label, extensions = null) {
  const relativePath = safeRelative(value, label);
  const path = resolve(profileDir, relativePath);
  const within = relative(profileDir, path);
  if (within.startsWith("..") || isAbsolute(within)) fail(`${label} escapes the profile directory`);
  if (!existsSync(path) || !statSync(path).isFile()) fail(`${label} does not exist: ${relativePath}`);
  if (extensions && !extensions.includes(extname(path).toLowerCase())) {
    fail(`${label} must use one of: ${extensions.join(", ")}`);
  }
  return { relative: relativePath, absolute: path };
}

function repositoryAsset(value, label) {
  const relativePath = safeRelative(value, label);
  const path = resolve(repositoryRoot, relativePath);
  if (!existsSync(path) || !statSync(path).isFile()) fail(`${label} does not exist: ${relativePath}`);
  return { relative: relativePath, absolute: path };
}

function localizedAssets(profileDir, value, label, extensions) {
  const record = object(value, label);
  const result = {};
  for (const [locale, path] of Object.entries(record)) {
    if (!/^[A-Za-z0-9-]+$/.test(locale)) fail(`${label} contains invalid locale "${locale}"`);
    result[locale] = assetPath(profileDir, path, `${label}.${locale}`, extensions);
  }
  return result;
}

function safeStaticHtml(value, label) {
  const forbidden = [
    /<\s*script\b/i,
    /<\s*iframe\b/i,
    /<\s*object\b/i,
    /<\s*embed\b/i,
    /<\s*form\b/i,
    /<\s*link\b/i,
    /<\s*meta\b/i,
    /\son[a-z]+\s*=/i,
    /\bjavascript:/i,
    /\bsrcdoc\b/i,
    /\bdata:text\/html/i,
  ];
  if (forbidden.some((pattern) => pattern.test(value))) {
    fail(`${label} contains executable or unsafe HTML`);
  }
  if (/<(?:img|source)\b[^>]*\bsrc\s*=\s*["']https?:/i.test(value)) {
    fail(`${label} must not load remote images`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function loadDistributionProfile(idOrDirectory) {
  const direct = resolve(idOrDirectory);
  const profileDir = existsSync(join(direct, "distribution.json"))
    ? direct
    : resolve(repositoryRoot, "distributions", idOrDirectory);
  const profilePath = join(profileDir, "distribution.json");
  if (!existsSync(profilePath)) fail(`profile not found: ${idOrDirectory}`);
  const raw = JSON.parse(readFileSync(profilePath, "utf8"));
  return validateDistributionProfile(raw, profileDir, profilePath);
}

export function validateDistributionProfile(raw, profileDir, profilePath = join(profileDir, "distribution.json")) {
  const profile = object(raw, "profile");
  exactKeys(profile, topKeys, "profile");
  if (profile.schemaVersion !== DISTRIBUTION_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${DISTRIBUTION_SCHEMA_VERSION}`);
  }
  if (profile.kind !== "official" && profile.kind !== "organization") {
    fail("kind must be official or organization");
  }
  const id = slug(profile.id, "id");
  if (profile.kind === "official" && id !== "official") fail('the official profile id must be "official"');
  if (profile.kind === "organization" && id === "official") fail("organization profiles cannot use id official");

  const identity = object(profile.identity, "identity");
  exactKeys(identity, identityKeys, "identity");
  const name = text(identity.name, "identity.name", { max: 120 });
  const productName = text(identity.productName, "identity.productName", { max: 160 });
  const binaryName = slug(identity.binaryName, "identity.binaryName");
  const identifier = text(identity.identifier, "identity.identifier", { max: 200 });
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/.test(identifier)) {
    fail("identity.identifier must be a reverse-domain identifier with at least three parts");
  }
  if (profile.kind === "organization" && identifier === OFFICIAL_IDENTIFIER) {
    fail("organization profiles must not use the official identifier");
  }
  const dataDirectory = slug(identity.dataDirectory, "identity.dataDirectory");
  if (profile.kind === "organization" && dataDirectory === OFFICIAL_DATA_DIRECTORY) {
    fail("organization profiles must not use the official data directory");
  }
  const publisher = text(identity.publisher, "identity.publisher", { max: 160 });
  const website = httpsUrl(identity.website, "identity.website");
  const supportUrl = httpsUrl(identity.supportUrl, "identity.supportUrl");

  const branding = object(profile.branding, "branding");
  exactKeys(branding, brandingKeys, "branding");
  const logo = optionalText(branding.logo, "branding.logo") &&
    assetPath(profileDir, branding.logo, "branding.logo", [".svg", ".png"]);
  const icon = optionalText(branding.icon, "branding.icon") &&
    assetPath(profileDir, branding.icon, "branding.icon", [".png", ".svg"]);
  const primaryColor = optionalText(branding.primaryColor, "branding.primaryColor", { max: 16 });
  if (primaryColor && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(primaryColor)) {
    fail("branding.primaryColor must be #RRGGBB or #RRGGBBAA");
  }
  const uiStyle = optionalText(branding.uiStyle, "branding.uiStyle", { max: 80 });
  const documentTheme = optionalText(branding.documentTheme, "branding.documentTheme", { max: 80 });

  const defaults = object(profile.defaults, "defaults");
  exactKeys(defaults, defaultsKeys, "defaults");
  const language = text(defaults.language, "defaults.language", { max: 32 });
  if (!["auto", "en", "zh-CN"].includes(language)) fail("defaults.language is not supported");
  const uiMode = text(defaults.uiMode, "defaults.uiMode", { max: 16 });
  if (!["auto", "light", "dark"].includes(uiMode)) fail("defaults.uiMode must be auto, light, or dark");
  const defaultDocumentTheme = optionalText(
    defaults.documentTheme,
    "defaults.documentTheme",
    { max: 80 },
  ) ?? "";
  if (typeof defaults.checkForUpdates !== "boolean") {
    fail("defaults.checkForUpdates must be boolean");
  }

  const bootstrap = object(profile.bootstrap, "bootstrap");
  exactKeys(bootstrap, bootstrapKeys, "bootstrap");
  const backup = optionalText(bootstrap.backup, "bootstrap.backup") &&
    assetPath(profileDir, bootstrap.backup, "bootstrap.backup", [".nota-backup", ".zip"]);
  if (!Number.isInteger(bootstrap.revision) || bootstrap.revision < 0) {
    fail("bootstrap.revision must be a non-negative integer");
  }
  if (typeof bootstrap.allowExtensionSettings !== "boolean") {
    fail("bootstrap.allowExtensionSettings must be boolean");
  }
  if (backup && bootstrap.revision < 1) fail("bootstrap.revision must be at least 1 when a backup is present");

  const extensions = object(profile.extensions, "extensions");
  exactKeys(extensions, extensionsKeys, "extensions");
  if (!Array.isArray(extensions.enabledByDefault) ||
      !extensions.enabledByDefault.every((item) => typeof item === "string" && item.trim() !== "")) {
    fail("extensions.enabledByDefault must be an array of extension ids");
  }
  if (!Array.isArray(extensions.bundled)) {
    fail("extensions.bundled must be an array");
  }
  const bundled = extensions.bundled.map((item, index) => {
    const value = object(item, `extensions.bundled[${index}]`);
    exactKeys(value, bundledKeys, `extensions.bundled[${index}]`);
    const packagePath = assetPath(
      profileDir,
      value.package,
      `extensions.bundled[${index}].package`,
      [".nota-plugin", ".zip"],
    );
    const expected = text(value.sha256, `extensions.bundled[${index}].sha256`, { max: 64 }).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expected)) fail(`extensions.bundled[${index}].sha256 is invalid`);
    const actual = sha256(packagePath.absolute);
    if (actual !== expected) fail(`extensions.bundled[${index}] SHA-256 does not match`);
    return { package: packagePath, sha256: expected };
  });
  for (const extensionId of extensions.enabledByDefault) {
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i.test(extensionId)) {
      fail(`extension id is invalid: ${extensionId}`);
    }
  }

  const legal = object(profile.legal, "legal");
  exactKeys(legal, legalKeys, "legal");
  const copyright = optionalText(legal.copyright, "legal.copyright", { max: 300 });
  const upstreamLicense = repositoryAsset(legal.upstreamLicense, "legal.upstreamLicense");
  const distributionLicense = optionalText(legal.distributionLicense, "legal.distributionLicense") &&
    assetPath(profileDir, legal.distributionLicense, "legal.distributionLicense", [".txt", ".md"]);
  const notices = localizedAssets(profileDir, legal.notice, "legal.notice", [".html"]);
  for (const [locale, notice] of Object.entries(notices)) {
    safeStaticHtml(readFileSync(notice.absolute, "utf8"), `legal.notice.${locale}`);
  }

  const updates = object(profile.updates, "updates");
  exactKeys(updates, updatesKeys, "updates");
  const manifestUrl = httpsUrl(updates.manifestUrl, "updates.manifestUrl", { nullable: true });
  const releasePrefix = httpsUrl(updates.releasePrefix, "updates.releasePrefix", {
    nullable: true,
    prefix: true,
  });
  const releasePage = httpsUrl(updates.releasePage, "updates.releasePage", { nullable: true });
  if (Boolean(manifestUrl) !== Boolean(releasePrefix)) {
    fail("updates.manifestUrl and updates.releasePrefix must both be set or both be null");
  }

  const onboarding = object(profile.onboarding, "onboarding");
  exactKeys(onboarding, onboardingKeys, "onboarding");
  const mode = text(onboarding.mode, "onboarding.mode", { max: 32 });
  if (!["default", "before-default", "after-default", "replace-welcome", "disabled"].includes(mode)) {
    fail("onboarding.mode is not supported");
  }
  const fallbackLocale = text(onboarding.fallbackLocale, "onboarding.fallbackLocale", { max: 32 });
  const guides = localizedAssets(profileDir, onboarding.guide, "onboarding.guide", [".html"]);
  for (const [locale, guide] of Object.entries(guides)) {
    safeStaticHtml(readFileSync(guide.absolute, "utf8"), `onboarding.guide.${locale}`);
  }
  const titles = object(onboarding.title, "onboarding.title");
  for (const [locale, value] of Object.entries(titles)) {
    if (!/^[A-Za-z0-9-]+$/.test(locale)) fail(`onboarding.title contains invalid locale "${locale}"`);
    text(value, `onboarding.title.${locale}`, { max: 200 });
  }
  if (mode !== "default" && mode !== "disabled" && !guides[fallbackLocale]) {
    fail("onboarding.guide must contain the fallback locale");
  }

  return {
    schemaVersion: DISTRIBUTION_SCHEMA_VERSION,
    kind: profile.kind,
    id,
    profilePath,
    profileDir,
    identity: {
      name,
      productName,
      binaryName,
      identifier,
      publisher,
      website,
      supportUrl,
      dataDirectory,
    },
    branding: {
      logo,
      icon,
      primaryColor,
      uiStyle,
      documentTheme,
    },
    defaults: {
      language,
      uiMode,
      documentTheme: defaultDocumentTheme,
      checkForUpdates: defaults.checkForUpdates,
    },
    bootstrap: {
      backup,
      revision: bootstrap.revision,
      allowExtensionSettings: bootstrap.allowExtensionSettings,
    },
    extensions: {
      enabledByDefault: [...new Set(extensions.enabledByDefault)],
      bundled,
    },
    legal: {
      copyright,
      upstreamLicense,
      distributionLicense,
      notice: notices,
    },
    updates: {
      manifestUrl,
      releasePrefix,
      releasePage,
    },
    onboarding: {
      mode,
      guide: guides,
      fallbackLocale,
      title: titles,
    },
  };
}

export function serializableProfile(profile) {
  return {
    schemaVersion: profile.schemaVersion,
    kind: profile.kind,
    id: profile.id,
    identity: profile.identity,
    branding: {
      logo: profile.branding.logo?.relative ?? null,
      icon: profile.branding.icon?.relative ?? null,
      primaryColor: profile.branding.primaryColor,
      uiStyle: profile.branding.uiStyle,
      documentTheme: profile.branding.documentTheme,
    },
    defaults: profile.defaults,
    bootstrap: {
      backup: profile.bootstrap.backup?.relative ?? null,
      revision: profile.bootstrap.revision,
      allowExtensionSettings: profile.bootstrap.allowExtensionSettings,
    },
    extensions: {
      enabledByDefault: profile.extensions.enabledByDefault,
      bundled: profile.extensions.bundled.map((item) => ({
        package: item.package.relative,
        sha256: item.sha256,
      })),
    },
    legal: {
      copyright: profile.legal.copyright,
      upstreamLicense: profile.legal.upstreamLicense.relative,
      distributionLicense: profile.legal.distributionLicense?.relative ?? null,
      notice: Object.fromEntries(
        Object.entries(profile.legal.notice).map(([locale, asset]) => [locale, asset.relative]),
      ),
    },
    updates: profile.updates,
    onboarding: {
      mode: profile.onboarding.mode,
      guide: Object.fromEntries(
        Object.entries(profile.onboarding.guide).map(([locale, asset]) => [locale, asset.relative]),
      ),
      fallbackLocale: profile.onboarding.fallbackLocale,
      title: profile.onboarding.title,
    },
  };
}

export function profileFileName(profile) {
  return `${profile.id}-${basename(profile.profilePath)}`;
}
