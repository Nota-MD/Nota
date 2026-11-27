import { t } from "@/i18n";
import { createInlineMathHitZones } from "./math-inline-boundary";
import { mathDelimiterText } from "./math-delim";

const panelClass = "nota-math-panel";
const sourceClass = "nota-math-source";
const separatorClass = "nota-math-delim";
const renderClass = "nota-math-render";
const previewClass = "nota-math-preview";
const numberLabelClass = "nota-math-kind";
const rulerClass = "nota-math-ruler";

export interface MathViewElements {
  dom: HTMLElement;
  render: HTMLElement;
  preview: HTMLElement;
  panel: HTMLElement;
  numberLabel: HTMLButtonElement;
  input: HTMLInputElement | HTMLTextAreaElement;
  ruler: HTMLElement;
  hitBefore: HTMLElement;
  hitAfter: HTMLElement;
  blockSourceShell: HTMLPreElement;
  createSeparator: (closing?: boolean) => HTMLElement;
}

export function createMathViewElements(
  inline: boolean,
  editable: boolean,
  source: () => { attrs?: unknown; data?: unknown },
): MathViewElements {
  const elementName = inline ? "span" : "div";
  const dom = document.createElement(elementName);
  dom.className = `nota-math nota-math-${inline ? "inline" : "block"}`;
  if (!inline) dom.classList.add("md-math-block");
  dom.classList.toggle("nota-math-readonly", !editable);

  const render = document.createElement(elementName);
  render.className = renderClass;

  const preview = document.createElement(elementName);
  preview.className = previewClass;
  preview.contentEditable = "false";

  const panel = document.createElement(elementName);
  panel.className = panelClass;
  panel.contentEditable = "false";

  const numberLabel = document.createElement("button");
  numberLabel.type = "button";
  numberLabel.className = `${numberLabelClass} nota-block-kind`;
  numberLabel.textContent = t("Formula");
  numberLabel.title = t("Finish editing");
  numberLabel.setAttribute("aria-label", t("Finish editing"));

  const createSeparator = (closing = false): HTMLElement => {
    const separator = document.createElement("span");
    separator.className = separatorClass;
    if (inline && closing) separator.classList.add("nota-math-delim-close");
    separator.textContent = inline ? mathDelimiterText(source(), closing) : "$$";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  };

  const input: HTMLInputElement | HTMLTextAreaElement = inline
    ? document.createElement("input")
    : document.createElement("textarea");
  input.className = sourceClass;
  if (!inline) input.classList.add("nota-diagram-source-bootstrap");
  input.spellcheck = false;
  input.setAttribute("aria-label", t("Math Source (LaTeX)"));
  input.placeholder = inline ? "" : t("e.g. \\frac{a}{b}");
  if (inline) (input as HTMLInputElement).type = "text";
  else (input as HTMLTextAreaElement).rows = 1;

  const ruler = document.createElement("span");
  ruler.className = rulerClass;
  ruler.setAttribute("aria-hidden", "true");
  const { before: hitBefore, after: hitAfter } = createInlineMathHitZones();

  const blockSourceShell = document.createElement("pre");
  blockSourceShell.className =
    "md-fences ty-contain-cm nota-source-surface nota-math-source-shell nota-diagram-source nota-diagram-cm";
  blockSourceShell.contentEditable = "false";
  blockSourceShell.append(input);

  return {
    dom,
    render,
    preview,
    panel,
    numberLabel,
    input,
    ruler,
    hitBefore,
    hitAfter,
    blockSourceShell,
    createSeparator,
  };
}
