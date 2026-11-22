
























import { useCallback, useEffect, useState } from "react";

import type { previewMode } from "@/editor/review";
import type { PluginReview, PluginReviewDiff, PluginReviewPanel } from "@/bridge/types";

export interface PreviewModeWiring {

  preview: PluginReview | null;




  invokePlugin: (plugin: string, command: string) => void;

  receivePreview: () => void;
}

export interface PreviewModeOutputMouth {








  activeJumpPreview: PluginReviewDiff | null;

  panelPreview: PluginReviewPanel | null;

  viewMode: previewMode;
  setViewMode: (v: previewMode) => void;

  backOutputPreview: () => void;
}

export function useReviewView(w: PreviewModeWiring): PreviewModeOutputMouth {
  const { preview, invokePlugin, receivePreview } = w;


  const activeJumpPreview = preview?.kind === "diff" ? preview : null;
  const panelPreview = preview?.kind === "panel" ? preview : null;

  const [viewMode, setViewMode] = useState<previewMode>("diff");


  const changeActionText = activeJumpPreview?.text ?? null;
  useEffect(() => {


    //



    setViewMode("diff");
  }, [changeActionText]);

  const backOutputPreview = useCallback(() => {
    const releaseDiscard = activeJumpPreview?.reject;
    if (releaseDiscard && activeJumpPreview) void invokePlugin(activeJumpPreview.plugin, releaseDiscard.command);
    else void receivePreview();
  }, [activeJumpPreview, invokePlugin, receivePreview]);

  return { activeJumpPreview, panelPreview, viewMode, setViewMode, backOutputPreview };
}
