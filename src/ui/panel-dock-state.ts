









































import { normalise, type PanelNode } from "@/ui/panel-nodes";



export type PanelState =
  | { state: "loading" }
  | { state: "ok"; nodes: PanelNode[]; busy: string | null }
  | { state: "error"; message: string; busy: string | null };


export type page = string | null;


export interface PanelRecordRecall {






  current: page | undefined;
  contentTable: Record<string, PanelState>;
  actualTimeTable: Record<string, string>;
  tabOrder: string[];
  closedTabs: string[];
}


export const recordRecall: PanelRecordRecall = {
  current: undefined,
  contentTable: {},
  actualTimeTable: {},
  tabOrder: [],
  closedTabs: [],
};












export function startStartPage(recordObtainOf: page | undefined, keys: readonly string[]): page {
  return recordObtainOf !== undefined ? recordObtainOf : (keys[0] ?? null);
}










export function recordHoldContentTable(table2: Record<string, PanelState>): Record<string, PanelState> {
  const output2: Record<string, PanelState> = {};
  for (const [key, state2] of Object.entries(table2)) {

    output2[key] =
      state2.state === "ok"
        ? { ...state2, nodes: [...state2.nodes], busy: null }
        : state2.state === "error"
          ? { ...state2, busy: null }
          : state2;
  }
  return output2;
}


export interface ShouldDrawWhatWhat {

  nodes: PanelNode[];

  notice: "load" | "empty" | null;

  error: string | null;

  busy: string | null;
}













export function thisValuePageDrawWhatWhat(state2: PanelState, actualTime: string): ShouldDrawWhatWhat {
  if (state2.state === "error") {
    return { nodes: [], notice: null, error: state2.message, busy: state2.busy };
  }

  const actualTimeNode =
    actualTime === ""
      ? null
      : (normalise([
          { kind: "message", from: "ai", text: actualTime, streaming: true },
        ])[0] ?? null);

  if (state2.state === "loading") {



    return actualTimeNode
      ? { nodes: [actualTimeNode], notice: null, error: null, busy: null }
      : { nodes: [], notice: "load", error: null, busy: null };
  }

  const nodes =
    actualTimeNode === null
      ? state2.nodes
      : insertLiveStream(state2.nodes, actualTimeNode);
  return {
    nodes,
    notice: nodes.length === 0 ? "empty" : null,
    error: null,
    busy: state2.busy,
  };
}

/**
 * Place a live answer at the conversation boundary instead of after the whole
 * panel. Control and settings blocks stay below the transcript.
 */
export function insertLiveStream(nodes: PanelNode[], live: PanelNode): PanelNode[] {
  const input = nodes.findIndex((node) => node.kind === "input");
  const at = input >= 0 ? input : nodes.length;
  return [...nodes.slice(0, at), live, ...nodes.slice(at)];
}
