import { useCallback, useEffect, useRef, type RefObject } from "react";

import { api, events, on } from "@/bridge/ipc";
import { exportHtml } from "@/editor/export";
import {
  createDevBridgeInputHost,
  playDevBridgeActions,
} from "@/ui/devBridgeInput";
import type { EditorPaneHandle } from "@/ui/EditorPane";

interface BridgeCommand {
  requestId: string;
  command: string;
  args: Record<string, unknown>;
}

export interface DevBridgeHostOptions {
  renderPreview: (args: Record<string, unknown>) => Promise<string>;
  playInput?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function useDevBridgeHost({ renderPreview, playInput }: DevBridgeHostOptions) {
  const renderPreviewRef = useRef(renderPreview);
  const playInputRef = useRef(playInput);
  useEffect(() => {
    renderPreviewRef.current = renderPreview;
    playInputRef.current = playInput;
  }, [playInput, renderPreview]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | null = null;

    const handle = async ({ requestId, command, args }: BridgeCommand) => {
      try {
        const result =
          command === "nota_host_preview_render"
            ? await renderPreviewRef.current(args)
            : command === "nota_host_input_play"
              ? await playInputRef.current?.(args) ??
                Promise.reject(new Error("Input playback is not available in this window"))
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
  editorRef,
}: {
  markdown: () => string | undefined;
  themeId: string;
  title: string;
  editorRef: RefObject<EditorPaneHandle | null>;
}) {
  const inputAbortRef = useRef<AbortController | null>(null);
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
  const playInput = useCallback(
    async (args: Record<string, unknown>) => {
      inputAbortRef.current?.abort();
      const controller = new AbortController();
      inputAbortRef.current = controller;
      try {
        return await playDevBridgeActions(
          args,
          createDevBridgeInputHost(editorRef),
          controller.signal,
        );
      } finally {
        if (inputAbortRef.current === controller) inputAbortRef.current = null;
      }
    },
    [editorRef],
  );
  useDevBridgeHost({ renderPreview, playInput });
}
