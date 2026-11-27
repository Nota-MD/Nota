import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  events,
  on,
  type PanelDirtyPayload,
  type PluginInfo,
  type PluginPanel,
  type PluginReviewPanel,
} from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
import { PanelBody } from "@/ui/PanelBody";
import { normalise, type PanelNode } from "@/ui/panel-nodes";
import type { PromptRequest } from "@/ui/useDialogs";


function previewMarkTitle(


  review: Pick<PluginReviewPanel, "plugin" | "panel">,
  panels: PluginPanel[],
  plugins: PluginInfo[],
): string {
  const panel = panels.find((p) => p.plugin === review.plugin && p.id === review.panel);
  const plugin = plugins.find((p) => p.id === review.plugin);
  return `${plugin?.name ?? review.plugin} / ${panel?.title ?? review.panel}`;
}

interface Props {

  plugin: string;

  panel: string;


  plugins: PluginInfo[];
  panels: PluginPanel[];

  onClose: () => void;

  onOpenSidebar: () => void;

  onCall: (plugin: string, command: string, args?: unknown) => Promise<unknown>;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
}


type content =
  | { state: "loading" }
  | { state: "ok"; nodes: PanelNode[] }
  | { state: "error"; message: string };

export function ReviewPane({
  plugin,
  panel,
  plugins,
  panels,
  onClose,
  onOpenSidebar,
  onCall,
  askPrompt,
}: Props) {


  const t = useT();
  const markTitle = previewMarkTitle({ plugin, panel }, panels, plugins);


  const thisPlugin = plugins.find((p) => p.id === plugin);
  const languageMismatch = (thisPlugin?.langs.length ?? 0) > 0 && !thisPlugin?.lang_ok;

  const [content, setContent] = useState<content>({ state: "loading" });

  const [busy, setBusy] = useState<string | null>(null);


  const index = useRef(0);

  const pull = useCallback(async () => {
    const thisCount = (index.current += 1);
    setContent((oldValue) => (oldValue.state === "ok" ? oldValue : { state: "loading" }));
    try {
      const nodes = normalise(await api.plugin.panelContent(plugin, panel));
      if (index.current !== thisCount) return;
      setContent({ state: "ok", nodes });
    } catch (e) {


      if (index.current !== thisCount) return;
      setContent({ state: "error", message: String(e) });
    }
  }, [plugin, panel]);


  useEffect(() => {
    void pull();
  }, [pull]);


  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let returnActiveActive = true;

    void on<PanelDirtyPayload>(events.pluginPanel, ({ plugin: p, id }) => {
      if (p !== plugin) return;
      if (id === null || id === panel) void pull();
    }).then((u) => {
      if (returnActiveActive) unsubscribe = u;
      else u();
    });

    return () => {
      returnActiveActive = false;
      unsubscribe?.();
    };
  }, [plugin, panel, pull]);


  const run = async (command: string, args?: unknown) => {
    setBusy(command);
    try {
      await onCall(plugin, command, args);
    } finally {


      setBusy(null);
      void pull();
    }
  };

  return (
    <div className="review-pane">


      <div className="review-bar">
        <span className="review-title" title={markTitle}>
          {markTitle}
        </span>
        <span className="review-spacer" />
        <button
          type="button"
          className="btn review-sidebar"
          onClick={onOpenSidebar}
          title={t("Open in sidebar")}
        >
          <Icon name="nota-columns-symbolic" />
          <span>{t("Sidebar")}</span>
        </button>
        <button
          type="button"
          className="btn review-back"
          onClick={onClose}


          title={t("Close the preview and go back to the document (this does not apply the changes)")}
        >
          {t("Back to the document")}
        </button>
      </div>

      <div className="review-body">

        {languageMismatch && <p className="panel-lang">{t("This extension does not support your language")}</p>}
        {content.state === "loading" && <p className="panel-empty">{t("Loading…")}</p>}
        {content.state === "error" && (
          <p className="panel-msg panel-msg-error">{content.message}</p>
        )}
        {content.state === "ok" && (
          <PanelBody
            plugin={plugin}
            nodes={content.nodes}


            onCall={(_p, command, args) => run(command, args)}
            askPrompt={askPrompt}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}
