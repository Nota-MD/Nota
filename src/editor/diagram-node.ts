











































import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { InputRule } from "@milkdown/prose/inputrules";
import { setBlockType } from "@milkdown/prose/commands";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import { $command, $inputRule, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";



export const imageTableNodeName = "diagram";

const mermaidLanguageAliases: Readonly<Record<string, string>> = {
  mermaid: "mermaid",
  sequence: "sequence",
  "sequence-diagram": "sequence",
  sequencediagram: "sequence",
  class: "classDiagram",
  "class-diagram": "classDiagram",
  classdiagram: "classDiagram",
  state: "stateDiagram-v2",
  "state-diagram": "stateDiagram-v2",
  statediagram: "stateDiagram-v2",
  "statediagram-v2": "stateDiagram-v2",
  er: "erDiagram",
  "er-diagram": "erDiagram",
  erdiagram: "erDiagram",
  gantt: "gantt",
  pie: "pie",
  journey: "journey",
  mindmap: "mindmap",
  timeline: "timeline",
  gitgraph: "gitgraph",
  quadrant: "quadrantChart",
  quadrantchart: "quadrantChart",
  requirement: "requirementDiagram",
  requirementdiagram: "requirementDiagram",
  c4context: "C4Context",
  c4container: "C4Container",
  c4component: "C4Component",
  c4dynamic: "C4Dynamic",
  c4deployment: "C4Deployment",
  sankey: "sankey-beta",
  "sankey-beta": "sankey-beta",
  xychart: "xychart-beta",
  "xychart-beta": "xychart-beta",
  block: "block-beta",
  "block-beta": "block-beta",
  architecture: "architecture-beta",
  "architecture-beta": "architecture-beta",
  packet: "packet-beta",
  "packet-beta": "packet-beta",
  kanban: "kanban",
  radar: "radar-beta",
  "radar-beta": "radar-beta",
  treemap: "treemap-beta",
  "treemap-beta": "treemap-beta",
  zenuml: "zenuml",
  flow: "flowchart",
  "flow-chart": "flowchart",
  flowchart: "flowchart",
};

const externalDiagramLanguages = new Map([
  ["plantuml", "plantuml"],
  ["puml", "plantuml"],
  ["uml", "plantuml"],
  ["graphviz", "graphviz"],
  ["dot", "graphviz"],
]);

export function isMermaidFenceLanguage(value: unknown): boolean {
  return typeof value === "string" && mermaidLanguageAliases[value.trim().toLowerCase()] !== undefined;
}

export function diagramLanguageFromFence(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase();
  const mermaid = mermaidLanguageAliases[language];
  if (mermaid) return mermaid;
  return externalDiagramLanguages.get(language) ?? null;
}

const mermaidHeaderRequirements: Readonly<Record<string, { header: string; pattern: RegExp }>> = {
  sequence: { header: "sequenceDiagram", pattern: /^\s*sequenceDiagram\b/ },
  flowchart: { header: "flowchart TD", pattern: /^\s*(?:flowchart|graph)\b/ },
  classDiagram: { header: "classDiagram", pattern: /^\s*classDiagram\b/ },
  "stateDiagram-v2": { header: "stateDiagram-v2", pattern: /^\s*stateDiagram(?:-v2)?\b/ },
  erDiagram: { header: "erDiagram", pattern: /^\s*erDiagram\b/ },
  gantt: { header: "gantt", pattern: /^\s*gantt\b/ },
  pie: { header: "pie", pattern: /^\s*pie\b/ },
  journey: { header: "journey", pattern: /^\s*journey\b/ },
  mindmap: { header: "mindmap", pattern: /^\s*mindmap\b/ },
  timeline: { header: "timeline", pattern: /^\s*timeline\b/ },
  gitgraph: { header: "gitGraph", pattern: /^\s*gitGraph\b/i },
  quadrantChart: { header: "quadrantChart", pattern: /^\s*quadrantChart\b/ },
  requirementDiagram: { header: "requirementDiagram", pattern: /^\s*requirementDiagram\b/ },
  C4Context: { header: "C4Context", pattern: /^\s*C4Context\b/ },
  C4Container: { header: "C4Container", pattern: /^\s*C4Container\b/ },
  C4Component: { header: "C4Component", pattern: /^\s*C4Component\b/ },
  C4Dynamic: { header: "C4Dynamic", pattern: /^\s*C4Dynamic\b/ },
  C4Deployment: { header: "C4Deployment", pattern: /^\s*C4Deployment\b/ },
  "sankey-beta": { header: "sankey-beta", pattern: /^\s*sankey-beta\b/ },
  "xychart-beta": { header: "xychart-beta", pattern: /^\s*xychart-beta\b/ },
  "block-beta": { header: "block-beta", pattern: /^\s*block-beta\b/ },
  "architecture-beta": { header: "architecture-beta", pattern: /^\s*architecture-beta\b/ },
  "packet-beta": { header: "packet-beta", pattern: /^\s*packet-beta\b/ },
  kanban: { header: "kanban", pattern: /^\s*kanban\b/ },
  "radar-beta": { header: "radar-beta", pattern: /^\s*radar-beta\b/ },
  "treemap-beta": { header: "treemap-beta", pattern: /^\s*treemap-beta\b/ },
  zenuml: { header: "zenuml", pattern: /^\s*zenuml\b/ },
};

export function mermaidSourceForLanguage(language: string, source: string): string {
  const requirement = mermaidHeaderRequirements[language];
  if (!requirement) {
    if (language !== "mermaid") return source;
    if (Object.values(mermaidHeaderRequirements).some((item) => item.pattern.test(source))) {
      return source;
    }
    const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
    if (/^\s*.+?(?:->>|-->>|->)\s*[^:：]+[:：]/.test(firstLine)) {
      return `sequenceDiagram\n${source}`;
    }
    if (/(?:-->|---|-.->|==>)/.test(source)) {
      return `flowchart TD\n${source}`;
    }
    return source;
  }
  if (requirement.pattern.test(source)) return source;
  return `${requirement.header}\n${source}`;
}







function followMachineMarkRecognize(): string {
  const characterMotherTable = "abcdefg";
  let s = "";
  for (let i = 0; i < 8; i++) s += characterMotherTable[Math.floor(Math.random() * characterMotherTable.length)];
  return s;
}


function getMarkRecognize(node?: PMNode): string {
  const value2: unknown = (node as { attrs?: { identity?: unknown } } | undefined)?.attrs?.identity;
  return typeof value2 === "string" && value2 !== "" ? value2 : followMachineMarkRecognize();
}












export function imageTableConvertReplace(tree: MarkdownNode): void {
  const walk = (node: MarkdownNode): void => {
    const child = node.children;
    if (!Array.isArray(child)) return;
    for (let i = 0; i < child.length; i++) {
      const value = child[i] as MarkdownNode | undefined;
      if (!value) continue;
      const language = diagramLanguageFromFence((value as { lang?: unknown }).lang);
      if (value.type === "code" && language) {
        child[i] = {
          type: imageTableNodeName,
          value: value.value,
          data: { language },
        } as unknown as MarkdownNode;
        continue;
      }
      walk(value);
    }
  };
  walk(tree);
}


type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"nota diagram", undefined>>[1];










export function imageTableParse() {
  const convertReplaceDevicePlugin: ReturnType<ConvertReplaceDeviceWorkFactory> = () => (tree) => {
    imageTableConvertReplace(tree as MarkdownNode);
  };
  const workFactory: ConvertReplaceDeviceWorkFactory = () => convertReplaceDevicePlugin;
  return $remark("nota diagram", workFactory);
}




interface ImageTableAttribute {
  value: string;
  identity: string;
  language: string;
}








export const imageTableSpec = $nodeSchema(imageTableNodeName, () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: "" },
    identity: { default: "" },
    language: { default: "mermaid" },
  },
  parseDOM: [
    {
      tag: `div[data-type="${imageTableNodeName}"]`,
      preserveWhitespace: "full" as const,
      getAttrs: (dom: HTMLElement | string) => {



        if (typeof dom === "string") {
          throw new Error(`Unexpected DOM ${JSON.stringify(dom)}`);
        }
        return {
          value: dom.dataset.value ?? "",
          identity: dom.dataset.id ?? "",
          language: dom.dataset.language || "mermaid",
        };
      },
    },
  ],
  toDOM: (node: PMNode) => {
    const attribute = node.attrs as ImageTableAttribute;
    return [
      "div",
      {
        "data-type": imageTableNodeName,
        "data-id": getMarkRecognize(node),
        "data-value": attribute.value,
        "data-language": attribute.language,
      },
      attribute.value,
    ] as const;
  },
  parseMarkdown: {
    match: ({ type }: MarkdownNode) => type === imageTableNodeName,
    runner: (state: ParserState, node: MarkdownNode, type: unknown) => {


      const sourceLanguage = (node as MarkdownNode & { data?: { language?: unknown } }).data?.language;
      state.addNode(type as never, {
        value: node.value ?? "",
        identity: followMachineMarkRecognize(),
        language: typeof sourceLanguage === "string" && sourceLanguage !== "" ? sourceLanguage : "mermaid",
      });
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === imageTableNodeName,
    runner: (state: SerializerState, node: PMNode) => {



      state.addNode("code", undefined, (node.attrs as ImageTableAttribute).value || "", {
        lang: (node.attrs as ImageTableAttribute).language || "mermaid",
      });
    },
  },
}));







export const imageTableSpecPlugin: MilkdownPlugin[] = [
  imageTableSpec.ctx as unknown as MilkdownPlugin,
  imageTableSpec[1],
];








export const mermaidCodeBlockConvertReplace = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-mermaid-code-block"),
      view: (view) => {
        const tr = codeBlockConvertImageTable(view.state);
        if (tr) queueMicrotask(() => view.dispatch(tr));
        return {};
      },
      appendTransaction: (transactions, _OldValue, newValue) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        return codeBlockConvertImageTable(newValue);
      },
    }),
);

function codeBlockConvertImageTable(state: EditorState): Transaction | null {
  const imageTable = state.schema.nodes[imageTableNodeName];
  if (!imageTable) return null;
  const pendingReplace: { pos: number; end: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos) => {
    if (
      node.type.name === "code_block" &&
      diagramLanguageFromFence(node.attrs.language) !== null
    ) {
      pendingReplace.push({
        pos,
        end: pos + node.nodeSize,
        node: imageTable.create({
          value: node.textContent,
          identity: followMachineMarkRecognize(),
          language: diagramLanguageFromFence(node.attrs.language) ?? "mermaid",
        }),
      });
    }
    return true;
  });
  if (!pendingReplace.length) return null;
  const tr = state.tr;
  for (const { pos, end, node } of pendingReplace.reverse()) {
    tr.replaceWith(pos, end, node);
  }
  return tr;
}







export const imageTableInputRuleRule = $inputRule(
  (ctx) =>
    new InputRule(/^```([A-Za-z][A-Za-z0-9-]*)$/, (state, match, start, end) => {
      const language = diagramLanguageFromFence(match[1]);
      if (!language) return null;
      const nodeType = imageTableSpec.type(ctx);
      const $start = state.doc.resolve(start);
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType))
        return null;
      return state.tr.delete(start, end).setBlockType(start, start, nodeType, {
        identity: followMachineMarkRecognize(),
        language,
      });
    }),
);


export const imageTableCommand = $command("InsertDiagramCommand", (ctx) => () =>
  setBlockType(imageTableSpec.type(ctx), { identity: followMachineMarkRecognize() }),
);
