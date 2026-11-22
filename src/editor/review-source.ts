
















import {
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType, keymap } from "@codemirror/view";

import { pressLineDifferenceException, createIncreaseBox, removeClass, type changePreview } from "@/editor/review";












export const previewEffectResult = StateEffect.define<changePreview | null>();








class IncreaseItem extends WidgetType {
  constructor(readonly line3: string[]) {
    super();
  }
  eq(distinguishOf: IncreaseItem): boolean {
    return (
      distinguishOf.line3.length === this.line3.length &&
      distinguishOf.line3.every((x, i) => x === this.line3[i])
    );
  }
  toDOM(): HTMLElement {
    return createIncreaseBox(this.line3);
  }

  ignoreEvent(): boolean {
    return true;
  }
}







function computePreviewDecoration(state: EditorState, preview: changePreview | null): DecorationSet {
  if (!preview) return Decoration.none;
  const singleDollar = pressLineDifferenceException(state.doc.toString(), preview.text);
  const decoration: Range<Decoration>[] = [];

  let DropPoint = -1;

  for (const item5 of singleDollar) {
    if (item5.class === "same") {
      DropPoint = item5.position3;
    } else if (item5.class === "delete") {
      const line3 = state.doc.line(item5.position3 + 1);
      decoration.push(Decoration.line({ class: removeClass }).range(line3.from));
      DropPoint = item5.position3;
    } else {


      const position3 = DropPoint < 0 ? 0 : state.doc.line(DropPoint + 1).to;
      decoration.push(
        Decoration.widget({ widget: new IncreaseItem(item5.line3), block: true, side: 1 }).range(position3),
      );
    }
  }



  return decoration.length ? Decoration.set(decoration, true) : Decoration.none;
}










export function previewExtensionExtendCollection(initialStart: changePreview | null, backOutput?: () => void) {
  const field = StateField.define<changePreview | null>({
    create: () => initialStart,
    update(v, tr) {
      let output2 = v;
      for (const e of tr.effects) if (e.is(previewEffectResult)) output2 = e.value;
      return output2;
    },
  });






  const decoration = EditorView.decorations.compute([field, "doc"], (state) =>
    computePreviewDecoration(state, state.field(field)),
  );

  const extensionExtend: Extension[] = [field, decoration];
  if (backOutput) {
    extensionExtend.unshift(
      Prec.highest(
        keymap.of([
          {
            key: "Escape",



            stopPropagation: true,
            run: (view) => {
              const current2 = view.state.field(field, false);
              if (!current2) return false;
              backOutput();
              return true;
            },
          },
        ]),
      ),
    );
  }
  return { field, extensionExtend };
}
