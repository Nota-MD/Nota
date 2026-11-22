












import { $shortcut } from "@milkdown/kit/utils";
import type { Command } from "@milkdown/kit/prose/state";
import { isInTable } from "@milkdown/kit/prose/tables";

import { handleTableTab } from "./table-tab";






export const tableEnter: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  return handleTableTab(state, dispatch, false);
};







export const tableEnterKey = $shortcut(() => ({
  Enter: { key: "Enter", onRun: () => tableEnter, priority: 110 },
}));
