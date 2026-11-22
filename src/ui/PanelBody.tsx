import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import { pushVerticalTick, formatNumber } from "@/ui/chart-ticks";
import { askParameter } from "@/ui/plugin-prompt";


import { ShareCardBlock } from "@/ui/ShareCard";
import type { PromptRequest } from "@/ui/useDialogs";
import { PanelControlBlock, type PanelControl } from "@/ui/PanelControls";
import { CardIcon } from "@/ui/CardIcon";
import { PanelDiffBlock } from "@/ui/PanelDiffBlock";
import type {
  PanelAction,
  PanelCards,
  PanelChart,
  PanelGraphLine,
  PanelHeatmap,
  PanelInput as PanelInputSpec,
  PanelNode,
} from "@/ui/panel-nodes";
import { PanelMarkdown } from "@/ui/panel-markdown";

const PanelNetworkBlock = lazy(() =>
  import("@/ui/PanelNetwork").then((module) => ({ default: module.PanelNetworkBlock })),
);

interface Props {

  plugin: string;
  nodes: PanelNode[];

  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;

  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

  busy: string | null;
}

export function PanelBody({ plugin, nodes, onCall, askPrompt, busy }: Props) {

  const t = useT();


  const pointPressButton = async (b: Extract<PanelNode, { kind: "buttons" }>["items"][number]) => {
    if (b.disabled || busy || !b.command) return;


    const ask = await askParameter({ prompt: b.prompt, askPrompt, args: b.args, title: b.label });
    if (!ask) return;

    await onCall(plugin, b.command, ask.args);
  };


  const pointAction = (a: PanelAction) => {
    if (busy) return;
    void onCall(plugin, a.command, a.args);
  };

  return (
    <>
      {nodes.map((node, i) => {


        switch (node.kind) {
          case "heading":
            return (
              <h4 key={i} className="panel-heading">
                {node.text}
              </h4>
            );

          case "text":
            return (
              <p key={i} className={`panel-text tone-${node.tone}`}>
                {node.text}
              </p>
            );

          case "fields":
            return (
              <dl key={i} className="panel-fields">
                {node.items.map((f, j) => (
                  <div key={j} className="panel-field">
                    <dt>{f.label}</dt>
                    <dd className={`tone-${f.tone}`}>{f.value}</dd>
                  </div>
                ))}
              </dl>
            );

          case "list":
            return (
              <ul key={i} className="panel-list">
                {node.items.map((it, j) => (
                  <li key={j} className={`panel-item tone-${it.tone}`}>
                    <div className="panel-item-main">
                      <span className="panel-item-title" title={it.title}>
                        {it.title}
                      </span>
                      {it.badge && <span className="panel-item-badge">{it.badge}</span>}
                    </div>
                    {it.subtitle && <div className="panel-item-sub">{it.subtitle}</div>}
                  </li>
                ))}
              </ul>
            );

          case "buttons":
            return (
              <div key={i} className="panel-buttons">
                {node.items.map((b, j) => {


                  const disabled2 = b.disabled || busy !== null || !b.command;
                  return (
                    <button
                      key={j}
                      type="button"
                      className={`btn panel-btn${b.style === "normal" ? "" : ` btn-${b.style}`}`}
                      disabled={disabled2}
                      title={b.command ? undefined : t("This button has no `command`, so clicking it does nothing")}
                      onClick={() => void pointPressButton(b)}
                    >
                      {b.label || b.command}
                    </button>
                  );
                })}
              </div>
            );

          case "toggle":
          case "select":
          case "file":
            return (
              <PanelControlBlock
                key={i}
                node={node as PanelControl}
                busy={busy !== null}
                onCall={(command, arg, args, value) => {
                  if (arg) void onCall(plugin, command, { ...(args as object), [arg]: value });
                }}
              />
            );

          case "empty":
            return (
              <p key={i} className="panel-empty">
                {node.text}
              </p>
            );

          case "separator":
            return <hr key={i} className="panel-sep" />;

          case "hero":


            return (
              <div key={i} className="panel-hero">
                <p className="panel-hero-title">{node.title}</p>
                {node.subtitle && <p className="panel-hero-sub">{node.subtitle}</p>}
              </div>
            );

          case "tabs":


            return (
              <div key={i} className="panel-tabs" role="tablist">
                {node.items.map((tb, j) => (
                  <span key={j} className={`panel-tab${tb.active ? " panel-tab-on" : ""}`}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tb.active}
                      className="panel-tab-pick"
                      disabled={busy !== null || !tb.pick}
                      title={tb.pick?.title || undefined}
                      onClick={() => tb.pick && pointAction(tb.pick)}
                    >
                      {tb.label}
                    </button>
                    {tb.close && (
                      <button
                        type="button"
                        className="panel-tab-close"
                        disabled={busy !== null}


                        title={tb.close.title || t("Close")}
                        onClick={() => pointAction(tb.close!)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {node.act && (
                  <button
                    type="button"
                    className="panel-tab-new"
                    disabled={busy !== null}
                    title={node.act.title || undefined}
                    onClick={() => pointAction(node.act!)}
                  >
                    ＋
                  </button>
                )}
              </div>
            );

          case "message":
            return <PanelMessage key={i} node={node} />;

          case "diff":
            return <PanelDiffBlock key={i} items={node.items} />;

          case "graph":
            return (
              <div key={i} className="panel-graph">
                {node.items.map((l, j) => (

                  <GraphRow key={j} line={l} disabled={busy !== null} onPress={pointAction} />
                ))}
              </div>
            );

          case "network":
            return (
              <Suspense
                key={i}
                fallback={<p className="panel-empty">{t("Preparing the note graph…")}</p>}
              >
                <PanelNetworkBlock
                  spec={node.spec}
                  disabled={busy !== null}
                  onAction={pointAction}
                />
              </Suspense>
            );

          case "chart":
            return <PanelChartBlock key={i} spec={node.spec} />;

          case "heatmap":
            return <PanelHeatmapBlock key={i} spec={node.spec} />;

          case "cards":
            return <PanelCardsBlock key={i} spec={node.spec} />;

          case "share":


            return <ShareCardBlock key={i} spec={node.spec} />;

          case "input":
            return (
              <PanelInput
                key={i}
                spec={node.spec}
                disabled={busy !== null}
                onSubmit={(value2) => onCall(plugin, node.spec.submit, { [node.spec.arg]: value2 })}
                onCommand={(c, args) => void onCall(plugin, c, args)}
              />
            );

          case "frame":


            return node.url ? (
              <iframe
                key={i}
                className="panel-frame"


                sandbox="allow-scripts allow-same-origin"
                allow="fullscreen; autoplay"
                allowFullScreen


                src={node.url}
                style={{ height: `${node.height}px` }}
                title={t("Extension preview")}
              />
            ) : (
              <p key={i} className="panel-empty">
                {node.alive
                  ? t("The preview URL is not acceptable, so it cannot be embedded.")
                  : t("The preview is not running. Press “Stop”, then “Preview” again.")}
              </p>
            );

          case "unknown":
            return (
              <p key={i} className="panel-unknown">
                {t("Unrecognised content block (kind={0})", node.raw)}{" "}
                {t("This extension may target a newer Nota, or `kind` is misspelled.")}
              </p>
            );
        }
      })}
    </>
  );
}


function GraphRow({
  line,
  disabled,
  onPress,
}: {
  line: PanelGraphLine;
  disabled: boolean;
  onPress: (a: PanelAction) => void;
}) {
  const key = line.bond;
  const character2 = line.pick;

  return (
    <div className={`pg-row tone-${line.tone}${line.picked ? " is-picked" : ""}`}>
      {key ? (
        <button
          type="button"
          className="pg-art"
          title={key.title || undefined}
          disabled={disabled}
          onClick={() => onPress(key)}
        >
          {line.art}
        </button>
      ) : (
        <span className="pg-art">{line.art}</span>
      )}

      {character2 ? (
        <button
          type="button"
          className="pg-text"


          title={character2.title || line.text}
          disabled={disabled}
          onClick={() => onPress(character2)}
        >
          {line.text}
        </button>
      ) : (


        <span className="pg-text" />
      )}
    </div>
  );
}


function PanelInput({
  spec,
  disabled,
  onSubmit,
  onCommand,
}: {
  spec: PanelInputSpec;
  disabled: boolean;
  onSubmit: (value2: string) => Promise<void>;

  onCommand: (command: string, args?: unknown) => void;
}) {


  const t = useT();
  const [draftDraft, setDraftDraft] = useState(spec.value);
  const lastInitial = useRef(spec.value);
  const disabled2 = disabled || !spec.submit || !spec.arg;

  useEffect(() => {
    if (lastInitial.current === spec.value) return;
    lastInitial.current = spec.value;
    setDraftDraft(spec.value);
  }, [spec.value]);

  const send = () => {
    const value2 = draftDraft.trim();
    if (disabled2 || !value2) return;
    setDraftDraft("");
    void onSubmit(value2);
  };

  return (
    <div className="panel-input">
      <div className="panel-input-wrap">
        {spec.multiline ? (
          <textarea
            className="panel-input-box"
            rows={spec.rows}
            value={draftDraft}
            placeholder={spec.placeholder}
            disabled={disabled2}
            onChange={(e) => setDraftDraft(e.target.value)}


            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
        ) : (
          <input
            type="text"
            className="panel-input-box"
            value={draftDraft}
            placeholder={spec.placeholder}
            disabled={disabled2}
            onChange={(e) => setDraftDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
        )}







        <div className="panel-input-foot">
          {spec.chips.length > 0 && (
            <div className="panel-input-chips">
              {spec.chips.map((b, j) => (
                <button
                  key={j}
                  type="button"
                  className={`btn panel-chip${b.style === "normal" ? "" : ` btn-${b.style}`}`}
                  disabled={disabled || !b.command}
                  onClick={() => void onCommand(b.command, b.args)}
                >
                  {b.label || b.command}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary panel-input-send"
            disabled={disabled2 || !draftDraft.trim()}


            title={disabled2 ? t("This input box has no `submit` / `arg`, so clicking it does nothing") : spec.submitLabel}
            aria-label={spec.submitLabel}
            onClick={send}
          >
            ↑
          </button>
        </div>
      </div>
      {spec.hint && <div className="panel-input-hint">{spec.hint}</div>}
    </div>
  );
}


function PanelMessage({ node }: { node: Extract<PanelNode, { kind: "message" }> }) {
  const t = useT();
  const [result2, setResult] = useState<"idle" | "ok" | "fail">("idle");

  const copy = () => {
    if (!node.text) return;


    try {
      void Promise.resolve(navigator.clipboard?.writeText?.(node.text)).then(
        () => setResult("ok"),
        () => setResult("fail"),
      );
    } catch {
      setResult("fail");
    }
  };

  return (
    <div className={`panel-msg panel-msg-${node.from}`}>
      <span className="panel-msg-who">{node.from === "user" ? "you" : "AI"}</span>
      {node.from === "ai" ? (
        <div className="panel-msg-text panel-msg-markdown">
          <PanelMarkdown text={node.text} />
        </div>
      ) : (
        <span className="panel-msg-text">{node.text}</span>
      )}
      {node.copy && node.text !== "" && (
        <div className="panel-msg-actions">
          <button type="button" className="panel-msg-action" onClick={copy}>
            {result2 === "ok" ? t("Copied to clipboard") : t("Copy")}
          </button>
          {result2 === "fail" && (
            <span className="panel-msg-action-fail">
              {t("Could not copy: the system refused to write to the clipboard.")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


const drawDistributeWidth = 100;
const drawDistributeHeight = 30;


function PanelHeatmapBlock({ spec }: { spec: PanelHeatmap }) {
  if (spec.grid.column.length === 0) return null;
  return (
    <div className="panel-heat">
      {spec.title && <div className="panel-heat-title">{spec.title}</div>}
      <div className="panel-heat-grid" aria-hidden="true">
        {spec.grid.column.map((column, i) => (

          <div key={i} className="heat-col">


            <div className="heat-month">{column.month}</div>
            {column.cell2.map((cell2) => (
              <span
                key={cell2.date}
                className={`heat-cell heat-${cell2.level}`}


                title={cell2.value2 > 0 ? `${cell2.date} / ${cell2.value2} ${spec.unit}` : cell2.date}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}


function PanelChartBlock({ spec }: { spec: PanelChart }) {
  const t = useT();
  const point = spec.points;
  const hasImage = point.length >= 2;


  const limit = hasImage ? Math.max(...point) : 0;
  const belowLimit = hasImage ? Math.min(...point) : 0;
  const crossDegree = limit - belowLimit;


  const verticalToward = (v: number) => (crossDegree > 0 ? (limit - v) / crossDegree : 0.5) * drawDistributeHeight;
  const horizontalToward = (i: number) => (i / (point.length - 1)) * drawDistributeWidth;


  const verticalTick = spec.yTicks.length > 0 ? spec.yTicks : pushVerticalTick(point);
  const horizontalTick = spec.xTicks;


  const foldLine = point
    .map((v, i) => `${i === 0 ? "M" : "L"}${horizontalToward(i).toFixed(2)} ${verticalToward(v).toFixed(2)}`)
    .join(" ");

  const surfaceAccumulate = `${foldLine} L${drawDistributeWidth} ${drawDistributeHeight} L0 ${drawDistributeHeight} Z`;

  return (
    <div className="panel-chart">
      {spec.label && <div className="panel-chart-label">{spec.label}</div>}

      <div className="panel-chart-value">


        <span className="panel-chart-number">{spec.value || "—"}</span>
        {spec.unit && <span className="panel-chart-unit">{spec.unit}</span>}
      </div>

      {hasImage && (
        <div className="panel-chart-plot-wrap">


          {verticalTick.length > 0 && (
            <div className="panel-chart-yticks" aria-hidden="true">
              {verticalTick.map((k, i) => (
                <span
                  key={i}
                  className={
                    "panel-chart-ytick" +
                    (k.at <= 0.001 ? " is-top" : k.at >= 0.999 ? " is-bottom" : "")
                  }
                  style={{ top: `${k.at * 100}%` }}
                >
                  {k.label}
                </span>
              ))}
            </div>
          )}

          <svg
            className="panel-chart-plot"
            viewBox={`0 0 ${drawDistributeWidth} ${drawDistributeHeight}`}

            preserveAspectRatio="none"


            role="img"
            aria-label={
              horizontalTick.length > 0
                ? t(
                    "A curve with {0} points, vertical axis {1} to {2}",
                    point.length,
                    formatNumber(limit),
                    formatNumber(belowLimit),
                  )
                : t("A curve with {0} points", point.length)
            }
          >


            {verticalTick.map((k, i) => (
              <line
                key={i}
                className="panel-chart-grid"
                x1={0}
                x2={drawDistributeWidth}
                y1={k.at * drawDistributeHeight}
                y2={k.at * drawDistributeHeight}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path className="panel-chart-area" d={surfaceAccumulate} />
            <path
              className="panel-chart-line"
              d={foldLine}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}


      {hasImage && horizontalTick.length > 0 && (
        <div className="panel-chart-xticks" aria-hidden="true">
          {horizontalTick.map((k, i) => (
            <span
              key={i}
              className={
                "panel-chart-xtick" +
                (k.at <= 0.001 ? " is-start" : k.at >= 0.999 ? " is-end" : "")
              }
              style={{ left: `${k.at * 100}%` }}
            >
              {k.label}
            </span>
          ))}
        </div>
      )}

      {spec.caption && <div className="panel-chart-caption">{spec.caption}</div>}
    </div>
  );
}


function PanelCardsBlock({ spec }: { spec: PanelCards }) {


  if (spec.items.length === 0 && !spec.total) return null;

  return (
    <div className="panel-cards">
      {spec.title && <div className="panel-cards-title">{spec.title}</div>}

      {spec.items.map((card, i) => (


        <div key={i} className="panel-card">
          <CardIcon name={card.icon} />
          <div className="panel-card-body">
            <div className="panel-card-head">

              <span className="panel-card-value">{card.value || "—"}</span>
              {card.unit && <span className="panel-card-unit">{card.unit}</span>}
            </div>
            {card.caption && <div className="panel-card-caption">{card.caption}</div>}
            <CardNarrowCurveLine points={card.points} />
          </div>
        </div>
      ))}

      {spec.total && (
        <div className="panel-cards-total">


          {spec.total.label && (
            <span className="panel-cards-total-label">{spec.total.label}</span>
          )}
          <span className="panel-cards-total-value">{spec.total.value || "—"}</span>
          {spec.total.unit && <span className="panel-cards-total-unit">{spec.total.unit}</span>}
        </div>
      )}
    </div>
  );
}


function CardNarrowCurveLine({ points }: { points: number[] }) {
  const t = useT();

  if (points.length < 2) return null;

  const limit = Math.max(...points);
  const belowLimit = Math.min(...points);
  const crossDegree = limit - belowLimit;
  const verticalToward = (v: number) => (crossDegree > 0 ? (limit - v) / crossDegree : 0.5) * narrowImageHeight;
  const horizontalToward = (i: number) => (i / (points.length - 1)) * narrowImageWidth;


  const foldLine = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${horizontalToward(i).toFixed(2)} ${verticalToward(v).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      className="panel-card-spark"
      viewBox={`0 0 ${narrowImageWidth} ${narrowImageHeight}`}

      preserveAspectRatio="none"
      role="img"

      aria-label={t("A curve with {0} points", points.length)}
    >
      <path className="panel-card-spark-line" d={foldLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}


const narrowImageWidth = 100;
const narrowImageHeight = 18;
