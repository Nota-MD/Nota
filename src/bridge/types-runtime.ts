/** Pandoc 导入与更新进度这两类运行时边界形状。 */

/** 一种可由 pandoc 转为 Markdown 的外部文档格式。 */
export interface PandocImportFormatInfo {
  /** 菜单 id 与 `nota_pandoc_import` 的 `format` 参数。 */
  id: string;
  /** 对话框标题与错误提示里用的名字。 */
  name: string;
  /** 打开对话框用到的后缀，不带点。 */
  extensions: string[];
}

/** 一次 pandoc 导入转换的结果。 */
export interface PandocImport {
  markdown: string;
  /** 成功退出时仍可能出现的警告，例如资源未找到。 */
  warnings: string;
}

/** 更新包下载 / 安装阶段推给界面的进度。 */
export interface UpdateDownloadProgress {
  phase: "downloading" | "installing";
  downloaded: number;
  total: number | null;
}
