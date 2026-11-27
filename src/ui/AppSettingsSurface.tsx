import type { ComponentProps } from "react";

import { DeferredSettingsDialog } from "@/ui/DeferredUi";

type Props = ComponentProps<typeof DeferredSettingsDialog> & {
  open: boolean;
};

export function AppSettingsSurface({ open, ...props }: Props) {
  return open ? <DeferredSettingsDialog {...props} /> : null;
}
