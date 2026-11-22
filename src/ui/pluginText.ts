

























import type { PluginInfo, PluginPanel } from "@/bridge/ipc";
import { t } from "@/i18n";






export function keyNameDescription(s: PluginInfo["signature"]): string {
  switch (s) {
    case "verified":
      return t("verified");
    case "unknown":
      return t("unknown signer");
    case "unsigned":
      return t("unsigned");
    default:


      return t("origin not recorded");
  }
}







export function comeSourceDescription(p: PluginInfo): string {
  const comePath = p.origin === "user" ? t("user") : t("builtin");
  return `${comePath} / ${keyNameDescription(p.signature)}`;
}









export function languageMismatch(p: PluginInfo): boolean {
  return p.langs.length > 0 && !p.lang_ok;
}


export function languageHint(): string {
  return t("This extension does not support your language");
}









export function languageTag(tag: string): string | undefined {
  const table2: Record<string, string> = {
    en: t("English"),
    "zh-CN": t("Chinese (Simplified)"),
  };
  return table2[tag];
}









export function ableForceName(tag: string): string | undefined {
  const table2: Record<string, string> = {
    "document.read": t("Read the document"),
    "document.write": t("Edit the document"),
    "fs.read": t("Read workspace files"),
    "fs.write": t("Write workspace files"),
    "process.git": t("Run git"),
    "process.devserver": t("Start a dev server"),
    "network.http": t("Make network requests"),
    "ui.notify": t("Show notifications"),
    "ui.open_url": t("Open the browser"),
    "ui.panel": t("Add sidebar panels"),
    "ui.menu": t("Add menu entries"),
    "settings.own": t("Read and write its own settings"),



    "data.own": t("Read/write its own data"),
  };
  return table2[tag];
}







export function positionName(location: PluginPanel["location"]): string | undefined {
  const table2: Record<string, string> = {
    right: t("right dock"),
    main: t("editing area"),
  };
  return table2[location];
}
