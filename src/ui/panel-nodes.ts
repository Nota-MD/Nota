

























import { t } from "@/i18n";
import type { PluginPrompt } from "@/bridge/ipc";
import { readTick } from "@/ui/chart-ticks";
import { readHotForceRecordRecord, computeHeatmap } from "@/ui/heatmap";


export type PanelTone = "normal" | "muted" | "success" | "warn" | "danger";

export interface PanelField {
  label: string;
  value: string;
  tone: PanelTone;
}

export interface PanelListItem {
  title: string;
  subtitle: string;
  badge: string;
  tone: PanelTone;
}

export interface PanelButton {
  label: string;

  command: string;

  args: unknown;

  prompt: PluginPrompt | null;
  style: "normal" | "primary" | "danger";
  disabled: boolean;
}

export interface PanelSelectOption {
  label: string;
  value: string;
}










export interface PanelAction {
  command: string;
  args: unknown;

  title: string;
}















export interface PanelGraphLine {
  art: string;
  text: string;
  tone: PanelTone;
  bond: PanelAction | null;
  pick: PanelAction | null;
  picked: boolean;
}

/** One note or unresolved link in a knowledge-graph panel. */
export interface PanelNetworkNode {
  id: string;
  label: string;
  kind: "note" | "missing";
  /** Stable grouping key, usually the first folder below the workspace root. */
  group: string;
  /** The active document, drawn with the accent colour. */
  focus: boolean;
  /** Present when clicking the node should open a document. */
  action: PanelAction | null;
}

/** One directed link between two graph nodes. */
export interface PanelNetworkEdge {
  source: string;
  target: string;
  /** Both notes link to each other. */
  both: boolean;
}

/** Data for the host-rendered, interactive note graph. */
export interface PanelNetwork {
  nodes: PanelNetworkNode[];
  edges: PanelNetworkEdge[];
}

export type PanelNode =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string; tone: PanelTone }
  | { kind: "fields"; items: PanelField[] }
  | { kind: "list"; items: PanelListItem[] }
  | { kind: "buttons"; items: PanelButton[] }
  | {
      kind: "toggle";
      label: string;
      value: boolean;
      command: string;
      args: unknown;
      arg: string;
    }
  | {
      kind: "select";
      label: string;
      value: string;
      options: PanelSelectOption[];
      command: string;
      args: unknown;
      arg: string;
    }
  | {
      kind: "file";
      label: string;
      buttonLabel: string;
      accept: string;
      command: string;
      args: unknown;
      arg: string;
    }
  | { kind: "empty"; text: string }
  | { kind: "separator" }






  | {
      kind: "message";
      from: PanelFrom;
      text: string;
      copy: boolean;
      streaming: boolean;
    }

  | { kind: "diff"; items: PanelDiffLine[] }





  | { kind: "graph"; items: PanelGraphLine[] }
  /**
   * An interactive force-directed note graph.
   *
   * Unlike the git commit `graph` block above, this is a real canvas with
   * zoom, pan, node dragging, hover highlighting and click-to-open actions.
   * The plugin supplies facts only; layout, colours and hit testing stay in
   * the host.
   */
  | { kind: "network"; spec: PanelNetwork }





  | { kind: "tabs"; items: PanelTab[]; act: PanelAction | null }




  | { kind: "hero"; title: string; subtitle: string }

  | { kind: "input"; spec: PanelInput }













  | { kind: "frame"; url: string; alive: boolean; height: number }















  | { kind: "chart"; spec: PanelChart }












  | { kind: "share"; spec: PanelShare }














  | { kind: "heatmap"; spec: PanelHeatmap }














  | { kind: "cards"; spec: PanelCards }




  | { kind: "unknown"; raw: string };


export type PanelFrom = "user" | "ai";









export type PanelDiffOp = "del" | "add" | "ctx" | "hunk" | "meta";
















export interface PanelDiffLine {
  op: PanelDiffOp;
  text: string;
}


export interface PanelInput {

  arg: string;

  submit: string;
  submitLabel: string;
  placeholder: string;
  hint: string;
  /** Initial editable text for settings-style forms. Chat inputs leave this empty. */
  value: string;
  /** Preferred textarea height. */
  rows: number;

  multiline: boolean;





  chips: PanelButton[];
}







export interface PanelTab {
  label: string;

  active: boolean;

  pick: PanelAction | null;

  close: PanelAction | null;
}


export type {
  PanelCard,
  PanelCardIcon,
  PanelCards,
  PanelCardsTotal,
  PanelChart,
  PanelHeatmap,
  PanelShare,
  PanelShareStat,
} from "./panel-data-nodes";
import type {
  PanelCard,
  PanelCardIcon,
  PanelCards,
  PanelChart,
  PanelHeatmap,
  PanelShare,
  PanelShareStat,
} from "./panel-data-nodes";



const eachBlockLimit = 200;

/** Graph datasets are larger than ordinary panel lists, but still bounded. */
const networkItemLimit = 800;


const pointMarkLimit = 3;









function weekNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}


const textLimit = 4000;








const clearMessageLimit = 20000;

function text2(v: unknown, limit = textLimit): string {
  if (typeof v === "string") return v.length > limit ? `${v.slice(0, limit)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function languageGas(v: unknown): PanelTone {
  switch (v) {
    case "muted":
    case "success":
    case "warn":
    case "danger":
      return v;



    case "info":
      return "normal";
    case "error":
      return "danger";
    case "warning":
      return "warn";
    default:
      return "normal";
  }
}

function isTable(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}









function differenceExceptionop(v: unknown): PanelDiffOp {
  switch (v) {
    case "del":
    case "add":
    case "ctx":
    case "hunk":
    case "meta":
      return v;
    default:
      return "add";
  }
}


function tableArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isTable).slice(0, eachBlockLimit);
}










function action(v: unknown): PanelAction | null {
  if (!isTable(v)) return null;
  const command = text2(v.command);
  if (!command) return null;
  return { command, args: v.args, title: text2(v.title) };
}

function imageLine(v: Record<string, unknown>): PanelGraphLine {
  return {


    art: text2(v.art),
    text: text2(v.text),
    tone: languageGas(v.tone),
    bond: action(v.bond),
    pick: action(v.pick),
    picked: v.picked === true,
  };
}

function notice(v: unknown): PluginPrompt | null {
  if (!isTable(v)) return null;
  const arg = text2(v.arg);


  if (!arg) return null;



  const secondArg = text2(v.secondArg);
  const secondLabel = text2(v.secondLabel);
  const twoAllGive = Boolean(secondArg && secondLabel);
  return {
    arg,
    label: text2(v.label) || t("Enter a value"),
    placeholder: text2(v.placeholder),
    hint: text2(v.hint),
    secret: v.secret === true,
    secondArg: twoAllGive ? secondArg : "",
    secondLabel: twoAllGive ? secondLabel : "",
    secondPlaceholder: twoAllGive ? text2(v.secondPlaceholder) : "",
  };
}









function inputBox(raw: Record<string, unknown>): PanelInput {
  return {
    arg: text2(raw.arg),
    submit: text2(raw.submit),
    submitLabel: text2(raw.submit_label) || t("Submit"),
    placeholder: text2(raw.placeholder),
    hint: text2(raw.hint),
    value: text2(raw.value),
    rows: Math.max(1, Math.min(24, Number(raw.rows) || 3)),
    multiline: raw.multiline === true,


    chips: tableArray(raw.chips)
      .slice(0, eachBlockLimit)
      .map((it) => ({
        label: text2(it.label),
        command: text2(it.command),
        args: it.args,
        prompt: notice(it.prompt),
        style: it.style === "primary" || it.style === "danger" ? it.style : "normal",
        disabled: it.disabled === true,
      })),
  };
}





function label(it: Record<string, unknown>): PanelTab {
  return {
    label: text2(it.label),
    active: it.active === true,
    pick: action(it.pick),
    close: action(it.close),
  };
}















function curveLinePoint(v: unknown): number[] {
  const original = Array.isArray(v) ? v : [];
  return original.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-eachBlockLimit);
}




function imageBlock(raw: Record<string, unknown>): PanelChart {
  const points = curveLinePoint(raw.points);
  return {
    value: text2(raw.value),
    unit: text2(raw.unit),
    label: text2(raw.label),
    caption: text2(raw.caption),
    points,



    xTicks: readTick(raw.x_ticks),
    yTicks: readTick(raw.y_ticks),
  };
}










function shareEnjoyCard(raw: Record<string, unknown>): PanelShare {
  const points = curveLinePoint(raw.points);

  const stats: PanelShareStat[] = [];
  if (Array.isArray(raw.stats)) {
    for (const item5 of raw.stats.slice(0, pointMarkLimit)) {
      if (typeof item5 !== "object" || item5 === null) continue;
      const t = item5 as Record<string, unknown>;
      stats.push({ k: text2(t.k), v: text2(t.v), small: text2(t.small) });
    }
  }

  return {
    title: text2(raw.title),
    subtitle: text2(raw.subtitle),
    date: text2(raw.date),
    label: text2(raw.label),
    value: text2(raw.value),
    unit: text2(raw.unit),
    points,


    xTicks: readTick(raw.x_ticks, cardTickLimit),
    xMinor: horizontalThinShareNumber(raw.x_minor),



    shape: raw.shape === "heat" ? "heat" : "curve",
    heat:
      raw.shape === "heat"
        ? computeHeatmap(readHotForceRecordRecord(raw.days), text2(raw.to), weekNumber(raw.weeks))
        : null,
    less: text2(raw.less),
    more: text2(raw.more),
    stats,
    foot: text2(raw.foot),
    file: text2(raw.file),
  };
}




const cardTickLimit = 13;









const iconName: PanelCardIcon[] = ["round", "today", "long", "doc", "record"];


function icon(raw: unknown): PanelCardIcon {
  const s = typeof raw === "string" ? raw : "";
  return iconName.includes(s as PanelCardIcon) ? (s as PanelCardIcon) : "record";
}








function recordRecordCardColumnTable(raw: Record<string, unknown>): PanelCards {
  const items: PanelCard[] = [];
  for (const item5 of tableArray(raw.items)) {
    items.push({
      icon: icon(item5.icon),
      value: text2(item5.value),
      unit: text2(item5.unit),
      caption: text2(item5.caption),
      points: curveLinePoint(item5.points),
    });
  }




  const total = isTable(raw.total)
    ? {
        label: text2(raw.total.label),
        value: text2(raw.total.value),
        unit: text2(raw.total.unit),
      }
    : null;

  return { title: text2(raw.title), items, total };
}








function horizontalThinShareNumber(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(10, Math.floor(raw)));
}













function localMachineAddress(v: unknown): string {
  const s = text2(v);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:") return "";
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname)) return "";
    return s;
  } catch {

    return "";
  }
}








function heightDegree(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 480;
  return Math.min(2000, Math.max(120, Math.round(n)));
}

function networkBlock(raw: Record<string, unknown>): PanelNetwork {
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes.filter(isTable) : [];
  const nodes: PanelNetworkNode[] = rawNodes
    .slice(0, networkItemLimit)
    .map((item, index) => ({
      id: text2(item.id) || `node-${index}`,
      label: text2(item.label, 160),
      kind: item.kind === "missing" ? "missing" : "note",
      group: text2(item.group, 160),
      focus: item.focus === true,
      action: action(item.action),
    }));

  const known = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges.filter(isTable) : [];
  const edges: PanelNetworkEdge[] = rawEdges
    .slice(0, networkItemLimit)
    .map((item) => ({
      source: text2(item.source),
      target: text2(item.target),
      both: item.both === true,
    }))
    .filter((edge) => edge.source !== edge.target && known.has(edge.source) && known.has(edge.target));

  return { nodes, edges };
}

function oneBlock(raw: Record<string, unknown>): PanelNode {
  const kind = text2(raw.kind);
  switch (kind) {
    case "heading":
      return { kind: "heading", text: text2(raw.text) };
    case "text":
      return { kind: "text", text: text2(raw.text), tone: languageGas(raw.tone) };
    case "fields":
      return {
        kind: "fields",
        items: tableArray(raw.items).map((it) => ({
          label: text2(it.label),
          value: text2(it.value),
          tone: languageGas(it.tone),
        })),
      };
    case "list":
      return {
        kind: "list",
        items: tableArray(raw.items).map((it) => ({
          title: text2(it.title),
          subtitle: text2(it.subtitle),
          badge: text2(it.badge),
          tone: languageGas(it.tone),
        })),
      };
    case "buttons":
      return {
        kind: "buttons",
        items: tableArray(raw.items).map((it) => ({
          label: text2(it.label),
          command: text2(it.command),


          args: it.args,
          prompt: notice(it.prompt),
          style: it.style === "primary" || it.style === "danger" ? it.style : "normal",
          disabled: it.disabled === true,
        })),
      };
    case "toggle":
      return {
        kind: "toggle",
        label: text2(raw.label),
        value: raw.value === true,
        command: text2(raw.command),
        args: raw.args ?? null,
        arg: text2(raw.arg),
      };
    case "select":
      return {
        kind: "select",
        label: text2(raw.label),
        value: text2(raw.value),
        options: tableArray(raw.options)
          .map((it) => ({ label: text2(it.label), value: text2(it.value) }))
          .filter((it) => it.value !== ""),
        command: text2(raw.command),
        args: raw.args ?? null,
        arg: text2(raw.arg),
      };
    case "file":
      return {
        kind: "file",
        label: text2(raw.label),
        buttonLabel: text2(raw.buttonLabel) || "Choose…",
        accept: text2(raw.accept) || ".json,application/json",
        command: text2(raw.command),
        args: raw.args ?? null,
        arg: text2(raw.arg) || "file",
      };
    case "empty":
      return { kind: "empty", text: text2(raw.text) };
    case "separator":
      return { kind: "separator" };
    case "message":
      return {
        kind: "message",
        from: raw.from === "user" ? "user" : "ai",
        text: text2(raw.text, clearMessageLimit),
        copy: raw.copy === true,
        streaming: raw.streaming === true,
      };
    case "diff":
      return {
        kind: "diff",
        items: tableArray(raw.items).map((it) => ({
          op: differenceExceptionop(it.op),
          text: text2(it.text),
        })),
      };
    case "graph":
      return { kind: "graph", items: tableArray(raw.items).map(imageLine) };
    case "network":
      return { kind: "network", spec: networkBlock(raw) };
    case "tabs":
      return {
        kind: "tabs",
        items: tableArray(raw.items).slice(0, eachBlockLimit).map(label),


        act: action(raw.new),
      };
    case "hero":
      return {
        kind: "hero",
        title: text2(raw.title),
        subtitle: text2(raw.subtitle),
      };
    case "input":
      return { kind: "input", spec: inputBox(raw) };
    case "chart":
      return { kind: "chart", spec: imageBlock(raw) };
    case "share":
      return { kind: "share", spec: shareEnjoyCard(raw) };
    case "cards":
      return { kind: "cards", spec: recordRecordCardColumnTable(raw) };
    case "heatmap":
      return {
        kind: "heatmap",
        spec: {
          title: text2(raw.title),
          unit: text2(raw.unit),


          grid: computeHeatmap(readHotForceRecordRecord(raw.days), text2(raw.to), weekNumber(raw.weeks)),
        },
      };
    case "frame":
      return {
        kind: "frame",
        url: localMachineAddress(raw.url),
        alive: raw.alive === true,
        height: heightDegree(raw.height),
      };
    default: {
      const name3 = kind || t("(no kind)");
      return { kind: "unknown", raw: name3 };
    }
  }
}







export function normalise(raw: unknown): PanelNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isTable)
    .slice(0, eachBlockLimit)
    .map(oneBlock);
}
