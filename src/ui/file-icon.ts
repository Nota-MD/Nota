import type { iconName } from "@/ui/Icon";

/** Pick one of the existing application icons for a workspace file name. */
export function fileIconName(name: string): iconName {
  const point = name.lastIndexOf(".");
  const extension = point > 0 ? name.slice(point + 1).toLowerCase() : "";
  if (["md", "markdown", "mdx"].includes(extension)) {
    return "nota-markdown-symbolic";
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(extension)) {
    return "folio-insert-image-symbolic";
  }
  if (
    [
      "js", "jsx", "ts", "tsx", "json", "jsonc", "css", "scss", "html", "htm",
      "xml", "yaml", "yml", "toml", "rs", "go", "py", "rb", "java", "kt", "kts",
      "c", "h", "cc", "cpp", "hpp", "cs", "php", "lua", "sh", "bash", "zsh",
      "fish", "sql", "vue", "svelte", "astro",
    ].includes(extension)
  ) {
    return "nota-source-code-symbolic";
  }
  if (["txt", "log", "csv", "tsv", "rst", "org", "tex", "odt", "docx", "pdf", "epub"].includes(extension)) {
    return "folio-document-open-symbolic";
  }
  return "folio-edit-symbolic";
}
