








import { listen, type UnlistenFn } from "@tauri-apps/api/event";





export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}













export const events = {













  focusState: "nota:focus-state",











  focusBeep: "nota:focus-beep",

  updateProgress: "nota:update-progress",
  notify: "nota:notify",
  /** Successful settings write broadcast to every open WebView window. */
  settingsChanged: "nota:settings-changed",
  documentChanged: "nota:document-changed",

















  documentEdit: "nota:document-edit",














  pluginPanel: "nota:plugin-panel",
  /** Developer-mode Lua hot reload completed or was rejected transactionally. */
  pluginReloaded: "nota:plugin-reloaded",
  /** Live developer bridge theme replacement. */
  devBridgeTheme: "nota:dev-bridge-theme",
  /** Developer bridge request that must run in the WebView command host. */
  devBridgeCommand: "nota:dev-bridge-command",











  pluginReview: "nota:plugin-review",
  /**
   * An extension asked the host to reveal one of its registered panels in the
   * right-hand dock.
   *
   * The event carries an intent only. Visibility and the active tab belong to
   * the frontend; panel content is still pulled through the ordinary path.
   */
  pluginPanelFocus: "nota:plugin-panel-focus",



























  pluginStream: "nota:plugin-stream",
  /** A table-capable extension supplied temporary display values. */
  tableRender: "nota:table-render",
  /** A table-capable extension requested one undoable multi-cell edit. */
  tableWrite: "nota:table-write",








  nativeMenu: "nota:native-menu",
















  quitRequested: "nota:close-requested",















  fileChanged: "nota:file-changed",








  openDocument: "nota:open-document",














  secondInstance: "nota:second-instance",





















  formatKey: "nota:format-key",





} as const;
