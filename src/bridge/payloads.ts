
















import type { DocId } from "./types";


//




export interface NotifyPayload {
  plugin: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}


export interface PanelDirtyPayload {
  plugin: string;
  id: string | null;
}

/** Result of an opt-in Lua hot reload. An error means the previous state stayed active. */
export interface PluginReloadedPayload {
  plugin: string;
  error: string | null;
}
















export interface PanelStreamPayload {
  plugin: string;
  text: string;
}

export interface DocumentChangedPayload {
  id: DocId;
  text: string;



  origin?: string;
}














export interface DocumentEditPayload {
  id: DocId;

  op: "insert-at-cursor";

  text: string;
}



















export interface FileChangedPayload {
  id: DocId;
  path: string;

  hash: string;
}
















export interface SecondInstancePayload {
  path: string | null;
  error: string | null;
}

/**
 * A plugin asked the host to open one document inside its workspace fence.
 *
 * The backend resolves and validates the relative path before emitting this
 * event. The frontend still uses the ordinary `openPath` route, so plugin
 * document opening shares tab reuse, dirty-document handling and error
 * reporting with every other entry point.
 */
export interface OpenDocumentPayload {
  path: string;
}
