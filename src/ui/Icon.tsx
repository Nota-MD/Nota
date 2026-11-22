







































import type { CSSProperties } from "react";










const urlTable: Record<string, string> = import.meta.glob("../assets/icons/*.svg", {
  query: "?url",
  eager: true,
  import: "default",
});


const iconUrl: Record<string, string> = {};
for (const [path, url] of Object.entries(urlTable)) {
  iconUrl[path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "")] = url;
}





const nameTable = [

  "folio-format-text-bold-symbolic",
  "folio-format-text-italic-symbolic",
  "folio-format-text-strikethrough-symbolic",



  "folio-marker-symbolic",
  "folio-format-text-superscript-symbolic",
  "folio-format-text-subscript-symbolic",
  "folio-format-text-underline-symbolic",
  "folio-insert-code-symbolic",
  "nota-inline-code-symbolic",
  "nota-code-block-symbolic",
  "folio-insert-link-symbolic",
  "folio-insert-image-symbolic",
  "folio-add-symbolic",
  "folio-view-list-bullet-symbolic",
  "folio-view-list-ordered-symbolic",
  "folio-view-more-horizontal-symbolic",
  "folio-eraser-symbolic",


  "nota-heading-1-symbolic",
  "nota-heading-2-symbolic",
  "nota-heading-3-symbolic",




  "nota-quote-symbolic",
  "nota-task-symbolic",


  "nota-source-quote-symbolic",
  "nota-source-bullet-symbolic",
  "nota-source-code-symbolic",



  "folio-columns-symbolic",
  "folio-close-symbolic",

  "folio-document-open-symbolic",
  "folio-edit-find-symbolic",















  "folio-edit-symbolic",
  "folio-insert-image-symbolic",
  "nota-markdown-symbolic",
  "folio-document-export-symbolic",
  "folio-window-symbolic",
  "nota-doc-theme-symbolic",
  "nota-keys-symbolic",
  "nota-plugin-symbolic",
  "nota-update-symbolic",
  "nota-advanced-symbolic",
  "folio-configure-symbolic",





  "nota-force-focus-symbolic",





  "nota-sidebar-toggle-symbolic",
  "nota-sidebar-collapse-symbolic",


  "nota-tree-folder-symbolic",
  "nota-tree-folder-open-symbolic",
  "nota-tree-file-symbolic",




  "nota-spellcheck-symbolic",
  "nota-unfold-more-symbolic",
  "nota-expand-symbolic",
  "nota-tab-close-symbolic",






  "folio-edit-cut-symbolic",
  "folio-edit-copy-symbolic",
  "folio-edit-paste-symbolic",
  "folio-delete-symbolic",
] as const;

export type iconName = (typeof nameTable)[number];

for (const name3 of nameTable) {
  if (!iconUrl[name3]) {
    console.error(
      `[icons] No file for "${name3}" in src/assets/icons/. ` +
        "The button will be empty. Add the file or remove this row.",
    );
  }
}










export function Icon({ name, size = 16 }: { name: iconName; size?: number }) {
  const url = iconUrl[name];
  const override = `var(--icon-${name}, var(--icon-base))`;
  return (
    <span
      className={url ? "icon" : "icon icon-missing"}
      data-icon={name}
      aria-hidden="true"
      style={
        {



          "--icon-base": url ? `url("${url}")` : "none",
          "--icon-override": override,




          WebkitMaskImage: override,
          maskImage: override,
          width: size,
          height: size,
        } as CSSProperties
      }
    />
  );
}
