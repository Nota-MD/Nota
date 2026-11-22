

































import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";








export const footNoteReferenceUseName = "footnote_reference";
export const footNoteFixedMeaningName = "footnote_definition";











export function scanSourceTextLabel(sourceText: string): string[] {
  const output2: string[] = [];
  for (const match of sourceText.matchAll(/\[\^([^\]\s]+)\]/g)) {
    if (match[1]) output2.push(match[1]);
  }
  return output2;
}


export function scanFootNoteLabel(doc: PMNode): string[] {
  const output2: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== footNoteReferenceUseName && node.type.name !== footNoteFixedMeaningName) return true;
    const label = node.attrs.label;
    if (typeof label === "string" && label !== "") output2.push(label);
    return true;
  });
  return output2;
}














export function belowValueItemFootNoteLabel(alreadyUse: Iterable<string>): string {
  const collection = new Set(alreadyUse);
  for (let n = 1; ; n++) {
    const candidate = String(n);
    if (!collection.has(candidate)) return candidate;
  }
}
























export function footNoteTransaction(state: EditorState): Transaction | null {
  const referenceUseType = state.schema.nodes[footNoteReferenceUseName];
  const fixedMeaningType = state.schema.nodes[footNoteFixedMeaningName];
  const paragraphType2 = state.schema.nodes.paragraph;
  if (!referenceUseType || !fixedMeaningType || !paragraphType2) return null;
  if (state.selection.$from.parent.type.name === "code_block") return null;

  const label = belowValueItemFootNoteLabel(scanFootNoteLabel(state.doc));
  const referenceUse = referenceUseType.create({ label: label });
  const fixedMeaning = fixedMeaningType.create({ label: label }, paragraphType2.create());

  const tr = state.tr.replaceSelectionWith(referenceUse);



  const fixedMeaningPosition = tr.doc.content.size;
  tr.insert(fixedMeaningPosition, fixedMeaning);



  tr.setSelection(TextSelection.near(tr.doc.resolve(fixedMeaningPosition + 2)));
  tr.scrollIntoView();
  return tr;
}








export function insertFootNote(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = footNoteTransaction(view.state);
    if (!tr) return;
    view.dispatch(tr);
    view.focus();
  });
}


export function footnotePosition(
  doc: PMNode,
  kind: typeof footNoteReferenceUseName | typeof footNoteFixedMeaningName,
  label: string,
): number | null {
  let found: number | null = null;
  doc.descendants((node, position) => {
    if (
      node.type.name === kind &&
      String(node.attrs.label ?? "") === label
    ) {
      found = position;
      return false;
    }
    return true;
  });
  return found;
}

const footnoteNavigationKey = new PluginKey("nota-footnote-navigation");







export const footnoteNavigation = $prose(
  () =>
    new Plugin({
      key: footnoteNavigationKey,
      props: {
        handleClick(view, _position, event) {
          const target = event.target;
          if (!(target instanceof Element)) return false;
          const reference = target.closest(
            `sup[data-type="${footNoteReferenceUseName}"]`,
          );
          if (reference instanceof HTMLElement) {
            const label = reference.dataset.label ?? "";
            const destination = footnotePosition(
              view.state.doc,
              footNoteFixedMeaningName,
              label,
            );
            if (destination === null) return false;
            view.dispatch(
              view.state.tr
                .setSelection(
                  TextSelection.near(
                    view.state.doc.resolve(destination + 2),
                  ),
                )
                .scrollIntoView(),
            );
            view.focus();
            return true;
          }

          const definition = target.closest(
            `dl[data-type="${footNoteFixedMeaningName}"]`,
          );
          if (!(definition instanceof HTMLElement) || !target.closest("dt")) {
            return false;
          }
          const label = definition.dataset.label ?? "";
          const destination = footnotePosition(
            view.state.doc,
            footNoteReferenceUseName,
            label,
          );
          if (destination === null) return false;
          view.dispatch(
            view.state.tr
              .setSelection(NodeSelection.create(view.state.doc, destination))
              .scrollIntoView(),
          );
          view.focus();
          return true;
        },
      },
    }),
);
