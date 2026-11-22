




































































































import { $remark } from "@milkdown/kit/utils";










export type code2 = number | null;


export type state = (code: code2) => unknown;


export type EffectResult = {
  consume: (code: code2) => void;
  enter?: (type: string) => { type?: string };
  exit?: (type: string) => unknown;
} & Record<string, unknown>;


export type ConstructCreate = {
  name?: string;
  previous?: (code: code2) => boolean;
  resolve?: (...parameter: never[]) => unknown;
  resolveTo?: (...parameter: never[]) => unknown;
  resolveAll?: boolean;
  tokenize: (this: unknown, effects: EffectResult, ok: state, nok: state) => unknown;
};




export function isNumberCharacter(code: code2): boolean {
  return code !== null && code >= 48 && code <= 57;
}


export function isWhitespace(code: code2): boolean {
  return code === 32 || (code !== null && code < 0);
}


export type shape = {

  openHowManyToken: number;

  openRightNeighbor: code2;

  closeLeftNeighbor: code2;

  closeLocalBody: code2;

  closeRightNeighbor: code2;
};








export function isProse(shape2: shape): boolean {
  if (shape2.closeLocalBody !== 36) return false;
  if (shape2.openHowManyToken !== 1) return false;
  if (!isNumberCharacter(shape2.openRightNeighbor)) return false;
  return isNumberCharacter(shape2.closeRightNeighbor) || isWhitespace(shape2.closeLeftNeighbor);
}











export function receiveNarrowDollarDollarCommonStyle(upstream: ConstructCreate): ConstructCreate {
  return {
    ...upstream,


    name: undefined,
    tokenize(this: unknown, effects: EffectResult, ok: state, nok: state): unknown {
      let openHowManyToken = 0;
      let openRightNeighbor: code2 = null;
      let headNumberCompleteDone = false;

      const tailTwoTokens: code2[] = [];

      const shadow: EffectResult = {
        ...effects,
        consume(code: code2): void {
          if (!headNumberCompleteDone) {
            if (code === 36) openHowManyToken++;
            else {
              headNumberCompleteDone = true;
              openRightNeighbor = code;
            }
          }
          tailTwoTokens.push(code);
          if (tailTwoTokens.length > 2) tailTwoTokens.shift();
          effects.consume(code);
        },
      };


      const receiveTail: state = (code: code2) => {
        const shape2: shape = {
          openHowManyToken,
          openRightNeighbor,
          closeLeftNeighbor: tailTwoTokens.length >= 2 ? tailTwoTokens[0] ?? null : null,
          closeLocalBody: tailTwoTokens.length >= 1 ? tailTwoTokens[tailTwoTokens.length - 1] ?? null : null,
          closeRightNeighbor: code,
        };
        return isProse(shape2) ? nok(code) : ok(code);
      };

      return upstream.tokenize.call(this, shadow, receiveTail, nok);
    },
  };
}









export function findUpstreamDollarDollar(extensionExtendTable: readonly unknown[]): ConstructCreate | undefined {
  for (const item5 of extensionExtendTable) {
    const table2 = (item5 as { text?: Record<number, unknown> } | null)?.text;
    if (!table2) continue;
    const item4 = table2[36];
    const column = Array.isArray(item4) ? item4 : item4 ? [item4] : [];
    for (const token of column) {
      const candidate = token as ConstructCreate | undefined;
      if (candidate?.name === "mathText" && typeof candidate.tokenize === "function") return candidate;
    }
  }
  return undefined;
}

type EventContext = {
  events: { 0: string; 1: { type: string; start?: { offset?: number }; end?: { offset?: number } } }[];
  sliceSerialize?: (token: unknown) => string;
};

function isInlineHTMLOpener(context: unknown): boolean {
  const self = context as EventContext;
  const last = self.events[self.events.length - 1];
  if (last?.[0] !== "exit" || last[1].type !== "htmlText") return false;
  const raw = self.sliceSerialize?.(last[1]) ?? "";
  return /^<[A-Za-z][^>]*>$/.test(raw) && !/^<\//.test(raw) && !/\/>$/.test(raw);
}

function previousMathText(this: unknown, upstream: ConstructCreate, code: code2): boolean {
  if (code === 36) {
    const context = this as EventContext;
    const last = context.events[context.events.length - 1];
    if (last?.[1].type !== "characterEscape" && last?.[1].type !== undefined) {
      if (isInlineHTMLOpener(this)) return false;
    }
  }
  return upstream.previous ? upstream.previous(code) : code !== 36;
}

/**
 * remark-math treats every unescaped dollar as a closing delimiter and can open
 * math immediately after inline HTML. Both differ from Typora. This construct
 * keeps remark-math's token shape while applying those two syntax fixes.
 */
export function receiveMathTextSyntax(upstream: ConstructCreate): ConstructCreate {
  return {
    resolve: upstream.resolve,
    resolveTo: upstream.resolveTo,
    resolveAll: upstream.resolveAll,
    previous(code: code2): boolean {
      return previousMathText.call(this, upstream, code);
    },
    tokenize(this: unknown, effectsRaw: EffectResult, ok: state, nok: state): unknown {
      const effects = effectsRaw as Required<EffectResult>;
      let sizeOpen = 0;
      let size = 0;
      let token: { type?: string };

      const start = (code: code2): unknown => {
        if (isInlineHTMLOpener(this)) return nok(code);
        effects.enter("mathText");
        effects.enter("mathTextSequence");
        return sequenceOpen(code);
      };

      const sequenceOpen = (code: code2): unknown => {
        if (code === 36) {
          effects.consume(code);
          sizeOpen++;
          return sequenceOpen;
        }
        effects.exit("mathTextSequence");
        return between(code);
      };

      const between = (code: code2): unknown => {
        if (code === null) return nok(code);
        if (code === 36) {
          token = effects.enter("mathTextSequence");
          size = 0;
          return sequenceClose(code);
        }
        if (code === 32) {
          effects.enter("space");
          effects.consume(code);
          effects.exit("space");
          return between;
        }
        if (code < 0) {
          effects.enter("lineEnding");
          effects.consume(code);
          effects.exit("lineEnding");
          return between;
        }
        effects.enter("mathTextData");
        return data(code);
      };

      const afterBackslash = (count: number, code: code2): unknown => {
        if (code === 92) {
          effects.consume(code);
          return (next: code2) => afterBackslash(count + 1, next);
        }
        if (code === 36 && count % 2 === 1) {
          effects.consume(code);
          return data;
        }
        return data(code);
      };

      const data = (code: code2): unknown => {
        if (code === null || code === 32 || code === 36 || code < 0) {
          effects.exit("mathTextData");
          return between(code);
        }
        if (code === 92) {
          effects.consume(code);
          return (next: code2) => afterBackslash(1, next);
        }
        effects.consume(code);
        return data;
      };

      const sequenceClose = (code: code2): unknown => {
        if (code === 36) {
          effects.consume(code);
          size++;
          return sequenceClose;
        }
        if (size === sizeOpen) {
          effects.exit("mathTextSequence");
          effects.exit("mathText");
          return ok(code);
        }
        if (token) token.type = "mathTextData";
        return data(code);
      };

      return start;
    },
  };
}












export function receiveStrictDollarDollarPlugin(this: unknown): void {
  const machine = this as { data: () => Record<string, unknown> };
  const all = machine.data();
  const table2 = all["micromarkExtensions"];
  if (!Array.isArray(table2)) return;
  const upstream = findUpstreamDollarDollar(table2);
  if (!upstream) return;
  table2.push({
    text: { 36: receiveNarrowDollarDollarCommonStyle(receiveMathTextSyntax(upstream)) },


    disable: { null: ["mathText"] },
  });
}


type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"strict dollar delimiters", undefined>>[1];


const receiveStrictDollarDollarWorkFactory: ConvertReplaceDeviceWorkFactory = () => receiveStrictDollarDollarPlugin;


export const receiveStrictDollarDollar = $remark("strict dollar delimiters", receiveStrictDollarDollarWorkFactory);
