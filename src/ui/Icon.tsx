







































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

  "nota-format-text-bold-symbolic",
  "nota-format-text-italic-symbolic",
  "nota-format-text-strikethrough-symbolic",



  "nota-marker-symbolic",
  "nota-format-text-superscript-symbolic",
  "nota-format-text-subscript-symbolic",
  "nota-format-text-underline-symbolic",
  "nota-insert-code-symbolic",
  "nota-inline-code-symbolic",
  "nota-code-block-symbolic",
  "nota-insert-link-symbolic",
  "nota-insert-image-symbolic",
  "nota-add-symbolic",
  "nota-view-list-bullet-symbolic",
  "nota-view-list-ordered-symbolic",
  "nota-view-more-horizontal-symbolic",
  "nota-eraser-symbolic",


  "nota-heading-1-symbolic",
  "nota-heading-2-symbolic",
  "nota-heading-3-symbolic",




  "nota-quote-symbolic",
  "nota-task-symbolic",


  "nota-source-quote-symbolic",
  "nota-source-bullet-symbolic",
  "nota-source-code-symbolic",



  "nota-columns-symbolic",
  "nota-close-symbolic",

  "nota-document-open-symbolic",
  "nota-edit-find-symbolic",















  "nota-edit-symbolic",
  "nota-insert-image-symbolic",
  "nota-markdown-symbolic",
  "nota-document-export-symbolic",
  "nota-window-symbolic",
  "nota-doc-theme-symbolic",
  "nota-keys-symbolic",
  "nota-plugin-symbolic",
  "nota-update-symbolic",
  "nota-advanced-symbolic",
  "nota-configure-symbolic",





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






  "nota-edit-cut-symbolic",
  "nota-edit-copy-symbolic",
  "nota-edit-paste-symbolic",
  "nota-delete-symbolic",
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
