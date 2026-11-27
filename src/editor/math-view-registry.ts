import type { Ctx } from "@milkdown/kit/ctx";
import { $view } from "@milkdown/kit/utils";
import type { KatexOptions } from "katex";

import { commonStyleCurrent } from "./math-current";
import { inlineMathBoundaryEditing } from "./math-inline-boundary";
import {
  katexOptionsCtx,
  mathBlockSchema,
  mathInlineSchema,
} from "./math-schema";
import { createCommonStyleView } from "./math-view";

function readOption(ctx: Ctx): KatexOptions {
  try {
    return ctx.get(katexOptionsCtx.key) ?? {};
  } catch {
    return {};
  }
}

export const commonStyleInlineView = $view(mathInlineSchema.node, (ctx) =>
  createCommonStyleView("inline", readOption(ctx)),
);

export const commonStyleBlockView = $view(mathBlockSchema.node, (ctx) =>
  createCommonStyleView("block", readOption(ctx)),
);

export const mathView = [
  commonStyleInlineView,
  commonStyleBlockView,
  commonStyleCurrent,
  inlineMathBoundaryEditing,
];
