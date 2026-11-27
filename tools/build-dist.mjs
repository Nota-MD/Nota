import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  loadDistributionProfile,
  serializableProfile,
} from "./distribution-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv[2];
if (!requested || requested.startsWith("-")) {
  console.error("usage: npm run build:dist -- <profile-id-or-directory> [tauri build options]");
  process.exit(2);
}

const profile = loadDistributionProfile(requested);
const output = join(root, "src-tauri", "target", "distribution-build", profile.id);
const resourceRoot = join(output, "distribution");
const iconRoot = join(output, "icons");
rmSync(output, { recursive: true, force: true });
mkdirSync(resourceRoot, { recursive: true });
mkdirSync(iconRoot, { recursive: true });

const copyAsset = (asset, destination) => {
  if (!asset) return null;
  const target = join(resourceRoot, destination);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(asset.absolute, target);
  return destination;
};

const runtime = serializableProfile(profile);
runtime.resources = {
  logo: copyAsset(profile.branding.logo, "logo" + (profile.branding.logo?.relative.endsWith(".png") ? ".png" : ".svg")),
  icon: copyAsset(profile.branding.icon, "icon" + (profile.branding.icon?.relative.endsWith(".png") ? ".png" : ".svg")),
  bootstrap: copyAsset(profile.bootstrap.backup, "bootstrap.nota-backup"),
  distributionLicense: copyAsset(profile.legal.distributionLicense, "LICENSE-DISTRIBUTION.txt"),
  notices: Object.fromEntries(
    Object.entries(profile.legal.notice).map(([locale, asset]) => [
      locale,
      copyAsset(asset, `notice-${locale}.html`),
    ]),
  ),
  guides: Object.fromEntries(
    Object.entries(profile.onboarding.guide).map(([locale, asset]) => [
      locale,
      copyAsset(asset, `onboarding-${locale}.html`),
    ]),
  ),
  bundledExtensions: profile.extensions.bundled.map((item) => {
    const target = join(resourceRoot, "extensions", basename(item.package.relative));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(item.package.absolute, target);
    return { package: `extensions/${basename(target)}`, sha256: item.sha256 };
  }),
};
runtime.branding.logo = runtime.resources.logo;
runtime.branding.icon = runtime.resources.icon;
runtime.legal.distributionLicense = runtime.resources.distributionLicense;
runtime.legal.notice = runtime.resources.notices;
runtime.onboarding.guide = runtime.resources.guides;
runtime.extensions.bundled = runtime.resources.bundledExtensions;
writeFileSync(
  join(resourceRoot, "distribution.json"),
  `${JSON.stringify(runtime, null, 2)}\n`,
);

let iconFiles = [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.png",
  "icons/icon.ico",
  "icons/icon.icns",
];
if (profile.branding.icon) {
  const icon = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tauri", "icon", profile.branding.icon.absolute, "--output", iconRoot],
    { cwd: root, stdio: "inherit" },
  );
  if (icon.status !== 0) process.exit(icon.status ?? 1);
  iconFiles = [
    join(iconRoot, "32x32.png"),
    join(iconRoot, "128x128.png"),
    join(iconRoot, "128x128@2x.png"),
    join(iconRoot, "icon.png"),
    join(iconRoot, "icon.ico"),
    join(iconRoot, "icon.icns"),
  ];
} else {
  iconFiles = iconFiles.map((path) => join(root, "src-tauri", path));
}

const base = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const config = structuredClone(base);
config.productName = profile.identity.productName;
config.identifier = profile.identity.identifier;
config.mainBinaryName = profile.identity.binaryName;
config.build.frontendDist = join(root, "dist");
config.app.windows[0].title = profile.identity.productName;
config.bundle.publisher = profile.identity.publisher;
config.bundle.homepage = profile.identity.website;
config.bundle.copyright = profile.legal.copyright ?? undefined;
config.bundle.shortDescription = `${profile.identity.productName}, a WYSIWYG Markdown editor`;
config.bundle.longDescription = `${profile.identity.productName} is a WYSIWYG Markdown editor with Lua extensions.`;
config.bundle.icon = iconFiles;
config.bundle.resources = { [resourceRoot]: "distribution" };
const configPath = join(output, "tauri.conf.json");
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const profilePath = join(resourceRoot, "build-profile.json");
writeFileSync(profilePath, `${JSON.stringify(runtime, null, 2)}\n`);

const passthrough = process.argv.slice(3);
const dryRun = passthrough.includes("--dry-run");
const buildArgs = passthrough.filter((value) => value !== "--dry-run");
if (dryRun) {
  console.log(`distribution profile: ${profile.id}`);
  console.log(`generated config: ${configPath}`);
  console.log(`generated resources: ${resourceRoot}`);
  process.exit(0);
}
const command = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tauri", "build", "--config", configPath, ...buildArgs],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NOTA_DISTRIBUTION_PROFILE: profilePath,
    },
  },
);
process.exit(command.status ?? 1);
