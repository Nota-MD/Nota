


export interface PandocImportFormatInfo {

  id: string;

  name: string;

  extensions: string[];
}


export interface PandocImport {
  markdown: string;

  warnings: string;
}


export interface UpdateDownloadProgress {
  phase: "downloading" | "installing";
  downloaded: number;
  total: number | null;
}
