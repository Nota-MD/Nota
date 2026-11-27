export type HeadingStyle = "atx" | "setext";
export type BulletMark = "dash" | "star" | "plus";
export type OrderedMark = "dot" | "paren";

export interface MarkdownSyntaxStyle {
  heading: HeadingStyle;
  bullet: BulletMark;
  ordered: OrderedMark;
}

export const DefaultMarkdownSyntaxStyle: MarkdownSyntaxStyle = {
  heading: "atx",
  bullet: "dash",
  ordered: "dot",
};

interface StyleTally<T> {
  value: T;
  count: number;
  first: number;
}

function dominant<T>(
  values: StyleTally<T>[],
  preferred: T,
): T {
  const [first, ...rest] = values;
  if (!first) return preferred;
  let winner = first;
  for (const candidate of rest) {
    if (
      candidate.count > winner.count ||
      (candidate.count === winner.count && candidate.first < winner.first)
    ) {
      winner = candidate;
    }
  }
  if (winner.count === 0) return preferred;
  return winner.value;
}

function countStyles(source: string) {
  const heading: StyleTally<HeadingStyle>[] = [
    { value: "atx", count: 0, first: Number.POSITIVE_INFINITY },
    { value: "setext", count: 0, first: Number.POSITIVE_INFINITY },
  ];
  const bullet: StyleTally<BulletMark>[] = [
    { value: "dash", count: 0, first: Number.POSITIVE_INFINITY },
    { value: "star", count: 0, first: Number.POSITIVE_INFINITY },
    { value: "plus", count: 0, first: Number.POSITIVE_INFINITY },
  ];
  const ordered: StyleTally<OrderedMark>[] = [
    { value: "dot", count: 0, first: Number.POSITIVE_INFINITY },
    { value: "paren", count: 0, first: Number.POSITIVE_INFINITY },
  ];
  let fenceCharacter = "";
  let fenceLength = 0;
  let previousWasText = false;

  const record = <T>(values: StyleTally<T>[], value: T, line: number) => {
    const target = values.find((entry) => entry.value === value);
    if (!target) return;
    target.count += 1;
    target.first = Math.min(target.first, line);
  };

  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceCharacter) {
      if (
        fence &&
        fence[1]?.[0] === fenceCharacter &&
        fence[1].length >= fenceLength
      ) {
        fenceCharacter = "";
        fenceLength = 0;
      }
      previousWasText = false;
      continue;
    }
    if (fence) {
      fenceCharacter = fence[1]![0]!;
      fenceLength = fence[1]!.length;
      previousWasText = false;
      continue;
    }
    if (/^ {4}/.test(line) || line.trim() === "") {
      previousWasText = false;
      continue;
    }

    if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) {
      record(heading, "atx", lineIndex);
    }
    if (previousWasText && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) {
      record(heading, "setext", lineIndex - 1);
    }

    const bulletMarker = /^ {0,3}([-+*])[ \t]+/.exec(line)?.[1];
    if (bulletMarker) {
      record(
        bullet,
        bulletMarker === "+" ? "plus" : bulletMarker === "*" ? "star" : "dash",
        lineIndex,
      );
    }
    const orderedMarker = /^ {0,3}\d{1,9}([.)])[ \t]+/.exec(line)?.[1];
    if (orderedMarker) {
      record(ordered, orderedMarker === ")" ? "paren" : "dot", lineIndex);
    }

    previousWasText = !/^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
  }

  return { heading, bullet, ordered };
}

export function resolveMarkdownSyntaxStyle(
  source: string,
  preferred: MarkdownSyntaxStyle = DefaultMarkdownSyntaxStyle,
): MarkdownSyntaxStyle {
  const counts = countStyles(source);
  return {
    heading: dominant(counts.heading, preferred.heading),
    bullet: dominant(counts.bullet, preferred.bullet),
    ordered: dominant(counts.ordered, preferred.ordered),
  };
}

export function markdownStringifyOptions(style: MarkdownSyntaxStyle) {
  return {
    setext: style.heading === "setext",
    bullet: (
      style.bullet === "plus" ? "+" : style.bullet === "star" ? "*" : "-"
    ) as "+" | "*" | "-",
    bulletOrdered: (style.ordered === "paren" ? ")" : ".") as ")" | ".",
    rule: "-" as const,
  };
}
