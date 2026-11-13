import { useCallback, useEffect, useRef } from "react";

import { api, events, on } from "@/bridge/ipc";
import { exportHtml } from "@/editor/export";

interface BridgeCommand {
  requestId: string;
  command: string;
  args: Record<string, unknown>;
}

export interface DevBridgeHostOptions {
  renderPreview: (args: Record<string, unknown>) => Promise<string>;
}

export function useDevBridgeHost({ renderPreview }: DevBridgeHostOptions) {
  const renderPreviewRef = useRef(renderPreview);
  useEffect(() => {
    renderPreviewRef.current = renderPreview;
  }, [renderPreview]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | null = null;

    const handle = async ({ requestId, command, args }: BridgeCommand) => {
      try {
        const result =
          command === "nota_host_preview_render"
            ? await renderPreviewRef.current(args)
            : await api.devBridge.execute(command, args);
        if (active) {
          await api.devBridge.respond(requestId, result, null).catch(() => false);
        }
      } catch (reason) {
        if (active) {
          await api.devBridge
            .respond(
              requestId,
              null,
              reason instanceof Error ? reason.message : String(reason),
            )
            .catch(() => false);
        }
      }
    };

    void on<BridgeCommand>(events.devBridgeCommand, (payload) => {
      void handle(payload);
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      dispose?.();
    };
  }, []);
}

export function useDevBridgePreview({
  markdown,
  themeId,
  title,
}: {
  markdown: () => string | undefined;
  themeId: string;
  title: string;
}) {
  const renderPreview = useCallback(
    async (args: Record<string, unknown>) => {
      const source = typeof args.markdown === "string" ? args.markdown : markdown();
      if (source === undefined) throw new Error("No active editor is available");
      const themeCss =
        typeof args.themeCss === "string"
          ? args.themeCss
          : themeId
            ? await api.theme.css(themeId)
            : undefined;
      return exportHtml(source, {
        styled: true,
        themeCss,
        includeHtmlPreviews: true,
        title: typeof args.title === "string" ? args.title : title,
      });
    },
    [markdown, themeId, title],
  );
  useDevBridgeHost({ renderPreview });
}
