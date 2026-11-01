import { useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import type {
  PanelAction,
  PanelNetwork,
  PanelNetworkNode,
} from "@/ui/panel-nodes";

interface Props {
  spec: PanelNetwork;
  disabled: boolean;
  onAction: (action: PanelAction) => void;
}

interface SimNode extends PanelNetworkNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}

interface SimEdge {
  a: SimNode;
  b: SimNode;
  both: boolean;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

interface Size {
  width: number;
  height: number;
  ratio: number;
}

interface Palette {
  text: string;
  muted: string;
  line: string;
  accent: string;
  dark: boolean;
}

const groupPalette = [212, 154, 28, 278, 344, 94, 190, 48];

function cssValue(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

function paletteFrom(canvas: HTMLCanvasElement): Palette {
  const style = getComputedStyle(canvas);
  const text = cssValue(style, "--fg", "#333");
  const background = cssValue(style, "--bg-raised", "#fff");
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { text, muted: text, line: text, accent: text, dark: false };
  }
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return {
    text,
    muted: cssValue(style, "--fg-muted", text),
    line: cssValue(style, "--border-strong", cssValue(style, "--border", text)),
    accent: cssValue(style, "--accent", text),
    dark: luminance < 0.5,
  };
}

function groupColour(group: string, palette: Palette): string {
  if (!group) return palette.muted;
  let hash = 0;
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) >>> 0;
  const hue = groupPalette[hash % groupPalette.length];
  return `hsl(${hue} ${palette.dark ? 54 : 46}% ${palette.dark ? 66 : 42}%)`;
}

function buildSimulation(spec: PanelNetwork): {
  nodes: SimNode[];
  edges: SimEdge[];
  byId: Map<string, SimNode>;
  neighbours: Map<string, Set<string>>;
} {
  const byId = new Map<string, SimNode>();
  const nodes = spec.nodes.map((node, index) => {
    const angle = index * 2.399963;
    const radius = 24 * Math.sqrt(index + 1);
    const sim: SimNode = {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      degree: 0,
    };
    byId.set(node.id, sim);
    return sim;
  });

  const edges: SimEdge[] = [];
  const neighbours = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of spec.edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b || a === b) continue;
    edges.push({ a, b, both: edge.both });
    a.degree++;
    b.degree++;
    neighbours.get(a.id)?.add(b.id);
    neighbours.get(b.id)?.add(a.id);
  }
  return { nodes, edges, byId, neighbours };
}

function nodeRadius(node: SimNode): number {
  return 4 + Math.min(8, Math.sqrt(node.degree) * 1.7);
}

function fitView(
  nodes: SimNode[],
  size: Size,
  view: View,
): void {
  if (!size.width || !size.height) return;
  if (nodes.length === 0) {
    view.x = 0;
    view.y = 0;
    view.scale = 1;
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const width = Math.max(80, maxX - minX);
  const height = Math.max(80, maxY - minY);
  view.scale = Math.max(0.12, Math.min(2.2, Math.min((size.width - 96) / width, (size.height - 96) / height)));
  view.x = -(minX + maxX) / 2;
  view.y = -(minY + maxY) / 2;
}

export function PanelNetworkBlock({ spec, disabled, onAction }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef(onAction);
  const disabledRef = useRef(disabled);
  const queryRef = useRef("");
  const drawRef = useRef<() => void>(() => undefined);
  const fitRef = useRef<() => void>(() => undefined);
  const [query, setQuery] = useState("");

  actionRef.current = onAction;
  disabledRef.current = disabled;
  queryRef.current = query.trim().toLowerCase();

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { nodes, edges, neighbours } = buildSimulation(spec);
    const view: View = { x: 0, y: 0, scale: 1 };
    const size: Size = { width: 0, height: 0, ratio: 1 };
    let palette = paletteFrom(canvas);
    let hover: SimNode | null = null;
    let dragNode: SimNode | null = null;
    let draggingNode = false;
    let panning = false;
    let pointerOrigin = { x: 0, y: 0 };
    let pointerLast = { x: 0, y: 0 };
    let moved = 0;
    let alpha = 1;
    let frame = 0;

    const toScreen = (node: SimNode) => ({
      x: size.width / 2 + (node.x + view.x) * view.scale,
      y: size.height / 2 + (node.y + view.y) * view.scale,
    });
    const toWorld = (x: number, y: number) => ({
      x: (x - size.width / 2) / view.scale - view.x,
      y: (y - size.height / 2) / view.scale - view.y,
    });

    const draw = () => {
      if (!size.width || !size.height) return;
      ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      const queryNow = queryRef.current;
      const lit = hover ? neighbours.get(hover.id) : null;
      const labels = view.scale > 0.58 || nodes.length < 70;
      const arrows = edges.length <= 220 && view.scale >= 0.72;

      ctx.lineWidth = 1;
      for (const edge of edges) {
        const active = hover && (edge.a === hover || edge.b === hover);
        const a = toScreen(edge.a);
        const b = toScreen(edge.b);
        ctx.strokeStyle = active ? palette.accent : palette.line;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.globalAlpha = hover && !active ? 0.28 : 0.72;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (arrows) {
          const arrow = (from: typeof a, to: typeof b, radius: number) => {
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const tipX = to.x - Math.cos(angle) * (radius + 1);
            const tipY = to.y - Math.sin(angle) * (radius + 1);
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX - Math.cos(angle - 0.44) * 5.5,
              tipY - Math.sin(angle - 0.44) * 5.5,
            );
            ctx.lineTo(
              tipX - Math.cos(angle + 0.44) * 5.5,
              tipY - Math.sin(angle + 0.44) * 5.5,
            );
            ctx.closePath();
            ctx.fill();
          };
          arrow(a, b, nodeRadius(edge.b) * view.scale);
          if (edge.both) arrow(b, a, nodeRadius(edge.a) * view.scale);
        }
      }

      ctx.font = `${Math.round(11 * Math.min(1.35, Math.max(0.92, view.scale)))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const node of nodes) {
        const point = toScreen(node);
        const radius = nodeRadius(node) * Math.min(1.6, view.scale);
        if (
          point.x < -80 ||
          point.y < -50 ||
          point.x > size.width + 80 ||
          point.y > size.height + 60
        ) {
          continue;
        }
        const matching = !queryNow || node.label.toLowerCase().includes(queryNow);
        const related = hover && (node === hover || lit?.has(node.id));
        ctx.globalAlpha = (matching ? 1 : 0.16) * (hover && !related ? 0.33 : 1);
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(2.5, radius), 0, Math.PI * 2);
        ctx.fillStyle = node.focus || node === hover
          ? palette.accent
          : node.kind === "missing"
            ? "transparent"
            : groupColour(node.group, palette);
        ctx.fill();
        if (node.kind === "missing") {
          ctx.strokeStyle = palette.muted;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        if (labels || node === hover || node.focus || (queryNow && matching)) {
          ctx.fillStyle = node.kind === "missing" ? palette.muted : palette.text;
          ctx.fillText(node.label, point.x, point.y + radius + 4);
        }
      }
      ctx.globalAlpha = 1;
    };
    drawRef.current = draw;

    const step = () => {
      const cell = 115;
      const grid = new Map<string, SimNode[]>();
      for (const node of nodes) {
        const key = `${Math.floor(node.x / cell)},${Math.floor(node.y / cell)}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(node);
        else grid.set(key, [node]);
      }

      for (const node of nodes) {
        const gx = Math.floor(node.x / cell);
        const gy = Math.floor(node.y / cell);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = grid.get(`${gx + dx},${gy + dy}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other === node) continue;
              let x = node.x - other.x;
              let y = node.y - other.y;
              let distance2 = x * x + y * y;
              if (distance2 < 0.01) {
                x = 0.3;
                y = 0.2;
                distance2 = 0.13;
              }
              if (distance2 > cell * cell) continue;
              const force = (900 / distance2) * alpha * 0.01;
              node.vx += x * force;
              node.vy += y * force;
              if (distance2 < 54 * 54) {
                const distance = Math.sqrt(distance2);
                const push = ((54 - distance) / distance) * 0.24 * alpha;
                node.vx += x * push;
                node.vy += y * push;
              }
            }
          }
        }
        node.vx -= node.x * 0.002 * alpha;
        node.vy -= node.y * 0.002 * alpha;
      }

      for (const edge of edges) {
        const x = edge.b.x - edge.a.x;
        const y = edge.b.y - edge.a.y;
        const distance = Math.sqrt(x * x + y * y) || 1;
        const force = ((distance - 72) / distance) * 0.055 * alpha;
        edge.a.vx += x * force;
        edge.a.vy += y * force;
        edge.b.vx -= x * force;
        edge.b.vy -= y * force;
      }

      for (const node of nodes) {
        if (node === dragNode) continue;
        node.vx *= 0.61;
        node.vy *= 0.61;
        node.x += node.vx;
        node.y += node.vy;
      }
      alpha *= 0.984;
    };

    const tick = () => {
      frame = 0;
      const steps = nodes.length > 650 ? 1 : 2;
      for (let i = 0; i < steps; i++) step();
      draw();
      if (alpha > 0.025 || dragNode) frame = requestAnimationFrame(tick);
    };
    const heat = () => {
      alpha = Math.max(alpha, 1);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      size.width = Math.max(1, rect.width);
      size.height = Math.max(260, rect.height);
      size.ratio = ratio;
      canvas.width = Math.round(size.width * ratio);
      canvas.height = Math.round(size.height * ratio);
      if (view.scale === 1 && view.x === 0 && view.y === 0) fitView(nodes, size, view);
      draw();
    };
    const fit = () => {
      fitView(nodes, size, view);
      draw();
    };
    fitRef.current = fit;

    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const nodeAt = (x: number, y: number): SimNode | null => {
      let result: SimNode | null = null;
      let distanceBest = Infinity;
      for (const node of nodes) {
        const screen = toScreen(node);
        const radius = nodeRadius(node) * Math.min(1.6, view.scale) + 5;
        const distance = (screen.x - x) ** 2 + (screen.y - y) ** 2;
        if (distance <= radius * radius && distance < distanceBest) {
          result = node;
          distanceBest = distance;
        }
      }
      return result;
    };

    const pointerDown = (event: PointerEvent) => {
      const at = point(event);
      pointerOrigin = at;
      pointerLast = at;
      moved = 0;
      dragNode = nodeAt(at.x, at.y);
      draggingNode = !!dragNode;
      panning = !dragNode;
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const at = point(event);
      if (draggingNode && dragNode) {
        const world = toWorld(at.x, at.y);
        dragNode.x = world.x;
        dragNode.y = world.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else if (panning) {
        view.x += (at.x - pointerLast.x) / view.scale;
        view.y += (at.y - pointerLast.y) / view.scale;
      } else {
        const next = nodeAt(at.x, at.y);
        if (next !== hover) {
          hover = next;
          draw();
        }
        canvas.title = next?.label ?? "";
      }
      moved = Math.max(moved, Math.hypot(at.x - pointerOrigin.x, at.y - pointerOrigin.y));
      pointerLast = at;
      if (draggingNode || panning) draw();
    };
    const pointerUp = (event: PointerEvent) => {
      const clicked = moved < 5 ? dragNode : null;
      if (clicked?.action && !disabledRef.current) actionRef.current(clicked.action);
      dragNode = null;
      draggingNode = false;
      panning = false;
      canvas.releasePointerCapture?.(event.pointerId);
      heat();
    };
    const pointerLeave = () => {
      if (draggingNode || panning) return;
      hover = null;
      draw();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = point(event as unknown as PointerEvent);
      const before = toWorld(at.x, at.y);
      const factor = Math.exp(-event.deltaY * 0.0014);
      view.scale = Math.max(0.12, Math.min(3.2, view.scale * factor));
      view.x = (at.x - size.width / 2) / view.scale - before.x;
      view.y = (at.y - size.height / 2) / view.scale - before.y;
      draw();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "f" || event.key === "F" || event.key === "0") {
        fit();
        event.preventDefault();
      } else if (event.key === "+" || event.key === "=") {
        view.scale = Math.min(3.2, view.scale * 1.18);
        draw();
        event.preventDefault();
      } else if (event.key === "-") {
        view.scale = Math.max(0.12, view.scale / 1.18);
        draw();
        event.preventDefault();
      } else if (event.key === "Enter" && hover?.action && !disabledRef.current) {
        actionRef.current(hover.action);
      }
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("pointerleave", pointerLeave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keydown);
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
      });
    });
    observer.observe(surface);
    const themeObserver = new MutationObserver(() => {
      palette = paletteFrom(canvas);
      draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-mode", "data-ui-style", "style"],
    });

    resize();
    if (nodes.length) for (let i = 0; i < 20; i++) step();
    heat();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keydown);
    };
  }, [spec]);

  useEffect(() => {
    drawRef.current();
  }, [query]);

  const notes = spec.nodes.filter((node) => node.kind === "note").length;
  const missing = spec.nodes.length - notes;

  return (
    <div ref={surfaceRef} className="panel-network">
      <div className="panel-network-toolbar">
        <span>
          {t("{0} notes", notes)}
          {missing > 0 ? ` · ${t("{0} unresolved", missing)}` : ""}
          {" · "}
          {t("{0} links", spec.edges.length)}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search notes")}
          aria-label={t("Search notes")}
        />
        <button type="button" className="btn" onClick={() => fitRef.current()}>
          {t("Fit")}
        </button>
      </div>
      <div className="panel-network-canvas-wrap">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label={t("Note relationship graph with {0} notes and {1} links", notes, spec.edges.length)}
        />
        {spec.nodes.length === 0 && (
          <p className="panel-network-empty">{t("No linked notes were found in this workspace.")}</p>
        )}
      </div>
      <p className="panel-network-help">
        {t("Drag to pan, scroll to zoom, drag a note to move it, and click a note to open it.")}
      </p>
    </div>
  );
}
