import {
  headingIdGenerator,
  headingSchema,
} from "@milkdown/kit/preset/commonmark";
import {
  ParserReady,
  editorStateTimerCtx,
  parserCtx,
} from "@milkdown/kit/core";
import { createTimer, type MilkdownPlugin } from "@milkdown/kit/ctx";
import { Fragment, type Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const isHeading = (node: PMNode): boolean => node.type.name === "heading";

export function headingIdsTouched(transaction: Transaction): boolean {
  let touched = false;
  transaction.mapping.maps.forEach((map, index) => {
    if (touched) return;
    const before = transaction.docs[index];
    const after = transaction.docs[index + 1] ?? transaction.doc;
    if (!before) return;
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (touched) return;
      const inspect = (doc: PMNode, from: number, to: number): void => {
        doc.nodesBetween(from, to, (node) => {
          if (isHeading(node)) touched = true;
          return !touched && !node.isTextblock;
        });
      };
      inspect(before, oldStart, oldEnd);
      if (!touched) inspect(after, newStart, newEnd);
    });
  });
  return touched;
}

const key = new PluginKey<number>("nota-heading-id");

type IdOf = (node: PMNode) => string;

function eachHeadingId(
  doc: PMNode,
  idOf: IdOf,
  visit: (node: PMNode, pos: number, id: string) => void,
): void {
  const seen = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (!isHeading(node)) return !node.isTextblock;
    if (node.textContent.trim().length === 0) return false;
    let id = idOf(node);
    const count = seen.get(id) ?? 0;
    if (count > 0) id += `-#${count + 1}`;
    seen.set(idOf(node), count + 1);
    visit(node, pos, id);
    return false;
  });
}

export function withHeadingIds(doc: PMNode, idOf: IdOf): PMNode {
  const ids = new Map<number, string>();
  eachHeadingId(doc, idOf, (node, pos, id) => {
    if (node.attrs.id !== id) ids.set(pos, id);
  });
  if (ids.size === 0) return doc;

  const rebuild = (node: PMNode, pos: number): PMNode => {
    const id = ids.get(pos);
    if (id !== undefined) {
      return node.type.create(
        { ...node.attrs, id },
        node.content,
        node.marks,
      );
    }
    if (node.isTextblock || node.childCount === 0) return node;
    const children: PMNode[] = [];
    let changed = false;
    node.forEach((child, offset) => {
      const next = rebuild(child, pos + 1 + offset);
      changed ||= next !== child;
      children.push(next);
    });
    return changed ? node.copy(Fragment.fromArray(children)) : node;
  };

  const children: PMNode[] = [];
  doc.forEach((child, offset) => children.push(rebuild(child, offset)));
  return doc.copy(Fragment.fromArray(children));
}

const HeadingIdsResolved = createTimer("NotaHeadingIdsResolved");

let parseCounts = new Map<string, number>();

interface MarkdownTreeNode {
  children?: MarkdownTreeNode[];
  value?: unknown;
}

function markdownText(node: MarkdownTreeNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(markdownText).join("");
}

export const headingSchemaWithIds = headingSchema.extendSchema(
  (previous) => (ctx) => {
    const schema = previous(ctx);
    const parseMarkdown = schema.parseMarkdown;
    if (!parseMarkdown?.runner) return schema;
    const idOf = ctx.get(headingIdGenerator.key);
    return {
      ...schema,
      parseMarkdown: {
        ...parseMarkdown,
        runner: (state, node, type) => {
          const level = Number(
            (node as MarkdownTreeNode & { depth?: unknown }).depth ?? 1,
          );
          const text = markdownText(node as MarkdownTreeNode);
          let id = "";
          if (text.trim()) {
            const provisional = type.create(
              { level },
              text ? state.schema.text(text) : undefined,
            );
            const base = idOf(provisional);
            const count = parseCounts.get(base) ?? 0;
            parseCounts.set(base, count + 1);
            id = count === 0 ? base : `${base}-#${count + 1}`;
          }
          state.openNode(type, { level, id });
          state.next(node.children);
          state.closeNode();
        },
      },
    };
  },
);

export const headingIdsOnParse: MilkdownPlugin = (ctx) => {
  ctx.record(HeadingIdsResolved);
  ctx.update(editorStateTimerCtx, (timers) =>
    timers.concat(HeadingIdsResolved),
  );
  return async () => {
    await ctx.wait(ParserReady);
    const parse = ctx.get(parserCtx);
    ctx.set(parserCtx, (text) => {
      parseCounts = new Map();
      return parse(text);
    });
    ctx.done(HeadingIdsResolved);
    return () => {
      ctx.clearTimer(HeadingIdsResolved);
    };
  };
};

const syncDelayMs = 300;

export const headingIdPlugin = $prose((ctx) => {
  const sync = (view: EditorView): void => {
    const transaction = view.state.tr
      .setMeta("addToHistory", false)
      .setMeta(key, true);
    eachHeadingId(
      view.state.doc,
      ctx.get(headingIdGenerator.key),
      (node, pos, id) => {
        if (node.attrs.id !== id) {
          transaction.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            id,
          });
        }
      },
    );
    if (transaction.docChanged) view.dispatch(transaction);
  };

  return new Plugin<number>({
    key,
    state: {
      init: () => 0,
      apply: (transaction, count) =>
        transaction.docChanged &&
        !transaction.getMeta(key) &&
        headingIdsTouched(transaction)
          ? count + 1
          : count,
    },
    view: (view) => {
      let synced = key.getState(view.state);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const schedule = (): void => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (view.isDestroyed) return;
          if (view.composing) {
            schedule();
            return;
          }
          synced = key.getState(view.state);
          sync(view);
        }, syncDelayMs);
      };
      sync(view);
      return {
        update: (view) => {
          if (key.getState(view.state) !== synced) schedule();
        },
        destroy: () => clearTimeout(timer),
      };
    },
  });
});
