export type InlineMarkName =
  | "strong"
  | "emphasis"
  | "inlineCode"
  | "strike_through"
  | "highlight"
  | "superscript"
  | "subscript"
  | "underline";

export interface InlineMarkRange {
  from: number;
  to: number;
  marks: readonly InlineMarkName[];
}

export interface InlineDelimiterParse {
  text: string;
  ranges: readonly InlineMarkRange[];
  escapes: readonly { at: number; symbol: string }[];
  /** `sourceToText[i]` is the output offset before source character `i`. */
  sourceToText: readonly number[];
}

export interface InlineTextSegment {
  text: string;
  marks: readonly InlineMarkName[];
}

interface DelimiterRule {
  pattern: RegExp;
  contentGroup: number;
  /** Length of the opening run, or null when capture group 1 is the opener. */
  fixedOpenLength: number | null;
  marks: readonly InlineMarkName[];
  recursive: boolean;
}

/**
 * The editor's inline parser is intentionally sequential. At every source
 * position it tries complete constructs in descending specificity before
 * consuming a literal character. This prevents a shorter inner run from
 * stealing an outer pair during malformed input.
 */
const delimiterRules: readonly DelimiterRule[] = [
  {
    pattern: /^(\*\*|__)(?=\S)([^\r]*?\S?[*_]?)\1/,
    contentGroup: 2,
    fixedOpenLength: null,
    marks: ["strong"],
    recursive: true,
  },
  {
    pattern: /^(_)(?=\S)([^\r]*?[^\s_])\1(?!\1)/,
    contentGroup: 2,
    fixedOpenLength: null,
    marks: ["emphasis"],
    recursive: true,
  },
  {
    pattern: /^(\*)(?=\S)([^\r]*?[^\s*])(\1{1}|\1{3})(?!\1)/,
    contentGroup: 2,
    fixedOpenLength: null,
    marks: ["emphasis"],
    recursive: true,
  },
  {
    pattern: /^(`+)([\s\S]*?[^`])\1(?!`)/,
    contentGroup: 2,
    fixedOpenLength: null,
    marks: ["inlineCode"],
    recursive: false,
  },
  {
    pattern: /^(==)(?=\S)([^\r]*?\S)\1/,
    contentGroup: 2,
    fixedOpenLength: null,
    marks: ["highlight"],
    recursive: true,
  },
  {
    pattern: /^~~(?=\S)([\s\S]*?\S)~~/,
    contentGroup: 1,
    fixedOpenLength: 2,
    marks: ["strike_through"],
    recursive: true,
  },
  {
    pattern: /^<u>([^\r]*?\S)<\/u>/i,
    contentGroup: 1,
    fixedOpenLength: 3,
    marks: ["underline"],
    recursive: true,
  },
  {
    pattern: /^\^(([^\s\n]|(\\\s))+?)\^/,
    contentGroup: 1,
    fixedOpenLength: 1,
    marks: ["superscript"],
    recursive: false,
  },
  {
    pattern: /^~(([^\s\n]|(\\\s))+?)~/,
    contentGroup: 1,
    fixedOpenLength: 1,
    marks: ["subscript"],
    recursive: false,
  },
];

function ruleEnabled(
  rule: DelimiterRule,
  enabled: ReadonlySet<InlineMarkName> | null,
): boolean {
  return enabled === null || rule.marks.every((mark) => enabled.has(mark));
}

class InlineParser {
  private readonly output: string[] = [];
  private readonly ranges: InlineMarkRange[] = [];
  private readonly escapes: { at: number; symbol: string }[] = [];
  private readonly sourceToText: number[];
  private readonly matchText: string;

  constructor(
    private readonly source: string,
    private readonly enabled: ReadonlySet<InlineMarkName> | null,
  ) {
    this.sourceToText = new Array(source.length + 1).fill(0);
    const chars = source.split("");
    for (let index = 0; index < source.length - 1; index++) {
      if (source[index] === "\\" && "\\`*_{}[]()#+-.!<>~=^$|&\"'".includes(source[index + 1]!)) {
        chars[index] = "\uE000";
        chars[index + 1] = "\uE001";
      }
    }
    this.matchText = chars.join("");
  }

  parse(): InlineDelimiterParse {
    this.scan(0, this.source.length);
    this.sourceToText[this.source.length] = this.output.length;
    return {
      text: this.output.join(""),
      ranges: this.ranges,
      escapes: this.escapes,
      sourceToText: this.sourceToText,
    };
  }

  private scan(from: number, to: number): void {
    let index = from;
    while (index < to) {
      this.sourceToText[index] = this.output.length;

      if (this.source[index] === "\\" && index + 1 < to) {
        this.escapes.push({ at: this.output.length, symbol: this.source[index + 1]! });
        this.output.push(this.source[index + 1]!);
        this.sourceToText[index + 1] = this.output.length - 1;
        index += 2;
        continue;
      }

      const remaining = this.matchText.slice(index, to);
      let matched = false;
      for (const rule of delimiterRules) {
        if (!ruleEnabled(rule, this.enabled)) continue;
        const result = rule.pattern.exec(remaining);
        if (!result) continue;

        const whole = result[0];
        const inner = result[rule.contentGroup];
        if (!inner) continue;
        const openLength =
          rule.fixedOpenLength ?? result[1]?.length ?? 0;
        const innerAt = index + openLength;
        const innerTo = innerAt + inner.length;
        const outputFrom = this.output.length;

        for (let skipped = index; skipped < innerAt; skipped++) {
          this.sourceToText[skipped] = outputFrom;
        }
        if (rule.recursive) {
          this.scan(innerAt, innerTo);
        } else {
          for (let offset = innerAt; offset < innerTo; offset++) {
            this.sourceToText[offset] = this.output.length;
            this.output.push(this.source[offset]!);
            this.sourceToText[offset + 1] = this.output.length;
          }
        }
        const outputTo = this.output.length;
        if (outputTo > outputFrom) {
          this.ranges.push({
            from: outputFrom,
            to: outputTo,
            marks: rule.marks,
          });
        }
        const end = index + whole.length;
        for (let skipped = innerTo; skipped <= end; skipped++) {
          this.sourceToText[skipped] = outputTo;
        }
        index = end;
        matched = true;
        break;
      }
      if (matched) continue;

      this.output.push(this.source[index]!);
      index += 1;
      this.sourceToText[index] = this.output.length;
    }
  }
}

/**
 * Parse one paragraph of inline source into plain text plus overlapping mark
 * ranges. Delimiter characters that do not complete a construct stay literal.
 */
export function parseInlineDelimiters(
  source: string,
  enabled: ReadonlySet<InlineMarkName> | null = null,
): InlineDelimiterParse {
  return new InlineParser(source, enabled).parse();
}

/** Flatten overlapping mark ranges into contiguous text/mark segments. */
export function inlineTextSegments(
  parsed: InlineDelimiterParse,
  accepted: ReadonlySet<InlineMarkName> | null = null,
): InlineTextSegment[] {
  const segments: InlineTextSegment[] = [];
  for (let offset = 0; offset < parsed.text.length; offset++) {
    const marks = parsed.ranges
      .filter((range) => range.from <= offset && offset < range.to)
      .flatMap((range) => range.marks)
      .filter((mark, index, all) => all.indexOf(mark) === index)
      .filter((mark) => accepted === null || accepted.has(mark));
    const char = parsed.text[offset]!;
    const previous = segments.at(-1);
    if (
      previous &&
      previous.marks.length === marks.length &&
      previous.marks.every((mark, index) => mark === marks[index])
    ) {
      previous.text += char;
    } else {
      segments.push({ text: char, marks });
    }
  }
  return segments;
}
