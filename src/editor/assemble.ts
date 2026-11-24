

























import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { flashSparkCursor } from "./blink-caret";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent, indentConfig } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";



import { prism } from "@milkdown/plugin-prism";


import { katexOptionsCtx, math } from "./math-schema";




import {
  emphasisKeymap,
  emphasisStarInputRule,
  emphasisUnderscoreInputRule,
  inlineCodeInputRule,
  strongInputRule,
  strongKeymap,
  wrapInHeadingInputRule,
} from "@milkdown/kit/preset/commonmark";
import { inlineMarkKeymap } from "./command-table";

const removedCommonmarkPlugins = new Set<unknown>([strongKeymap, emphasisKeymap]);



import { joinFrontMatter } from "@/editor/front-matter";

import { previewMiddleQuestion, previewPlugin } from "./review-prose";


import { $prose } from "@milkdown/kit/utils";

import { combineWriteCheckCheckPlugin } from "./spell-check";


import { coverWritePlugin } from "./overtype";
import { vimInputPlugin } from "./plugin-vim-input";
import { instantRender } from "./instant-render";



import { inlineSyntaxNodePlugins, literalInlineInput, markHint } from "./mark-hint";
import { inlineEscapeNodePlugins, remarkInlineEscapePlugins } from "./inline-escape";
import { compositionPruneGuard, linuxImeEnterGuard } from "./ime-guard";


import { taskList } from "./task-list";



import { tableInputRule, tableInput } from "./table-input";
import { blockContainerKeypress } from "./block-keys";


import { markTitleReturnCarBecomeBlock, markTitleLineFirstBackCell } from "./heading-on-enter";
import { paragraphWithoutBlankLine, documentMustNotExportEmptyRoot } from "./empty-paragraph";


import { codeBlockKeyboardEntry, codeBlockView } from "./code-block";
import { encloseBarLanguageFillAll } from "./fence-lang";



import { mermaidCodeBlockConvertReplace, imageTableParse, imageTableSpecPlugin, imageTableInputRuleRule } from "./diagram-node";

import { diagramView } from "./diagram-view";




import { mathView } from "./math-view";




import { visionFrequencyView } from "./video-view";



import { commonStyleBlockReturnCar, commonStyleCommit, commonStyleInput } from "./math-input";








import {
  markDollarDollarNumber,
  inlineMathHandler,
  inlineMathSpec,
  latexMathDelimiter,
} from "./math-delim";


import { receiveStrictDollarDollar } from "./math-currency";




import { textHandlerChain } from "./text-handlers";













import {
  closeSingleWaveWaveNumberRemoveRemoveLine,
  inlineMarkParse,
  inlineMarkHandler,
  inlineMarkSpecPlugin,
  inlineMarkCommand,
  inlineMarkInputRuleRule,
  type InlineExtensionFlags,
} from "./inline-marks";





import { blockHTMLParse, blockHTMLSpecPlugin } from "./html-block";
import { blockHTMLDiagnostics, blockHTMLView } from "./html-block-view";
import { liveToc } from "./live-toc";
import { footnoteNavigation } from "./footnote";
import { githubDocsCompat } from "./github-docs";
import { gitHubNoticePlugin } from "./github-alert";







import { punctuationInput, punctuationDecoration, type punctuationSettings } from "./smart-punctuation";


import { selfActionMoreCorrectInput } from "./auto-correct";
import { autoPair as autoPairPlugin } from "./auto-pair";
import {
  linkSourceNodePlugins,
  linkSourceReveal,
} from "./link-source-reveal";


import {
  autoLinkBoundary,
  explicitLinkInput,
  explicitLinkTyping,
  linkBoundarySpec,
  selfActionLinkInput,
} from "./url-link";

import { pastePastePlaceManage } from "./paste";


import { tableTab } from "./table-tab";
import { textTab } from "./text-tab";


import { tableEnterKey } from "./table-enter";




import { moveKeymap } from "./move-block";




import { emojiInputRuleRule, emojiFillAll } from "./emoji";



import { fillAllImageSliceAttribute } from "./image-attrs";
import { katexOptionsFor } from "./math-macros";


import { selectionSnapshotPlugin } from "./caret-snapshot";
import { cursorStatePlugin } from "./command-state";
import { writingModePlugin } from "./writing-modes";

import { findPlugin } from "./find";
import type { CreateOptions } from "./create-types";








export interface InstallConfigureParameter {

  root: HTMLElement;

  body2: string;

  physics: boolean;

  readOnly: boolean;

  documentPath: string | null;

  strict: boolean;
  inlineExtensions: InlineExtensionFlags;
  autoLinks: boolean;
  autoPair: boolean;
  keyboardExperience: boolean;
  defaultIndent: number;
  punctuation: punctuationSettings;
  selfActionMoreCorrect: boolean;
  emoji: boolean;

  onChange?: (markdown: string) => void;

  getFrontMatter: () => string | null;

  options: Pick<
    CreateOptions,
    "onCommandState" | "onFindStatus" | "onSelection" | "writingModes" | "review" | "onReviewEscape"
  >;

  vimInput: CreateOptions["vimInput"];
}


export async function installConfigureActualExample(parameter: InstallConfigureParameter): Promise<Editor> {
  const {
    root,
    body2,
    physics,
    readOnly,
    documentPath,
    strict,
    inlineExtensions,
    autoLinks,
    autoPair,
    keyboardExperience: keyboardExperienceEnabled,
    defaultIndent,
    punctuation,
    selfActionMoreCorrect,
    emoji,
    onChange,
    options,
  } = parameter;

  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body2);
      ctx.set(indentConfig.key, { type: "space" as const, size: defaultIndent });











      closeSingleWaveWaveNumberRemoveRemoveLine(ctx);



      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,

















        bullet: "-" as const,
        rule: "-" as const,
        handlers: {
          ...prev.handlers,




          ...inlineMarkHandler(),





          text: textHandlerChain(prev.handlers?.text),








          inlineMath: inlineMathHandler(),
        },
      }));







      ctx.set(katexOptionsCtx.key, katexOptionsFor(physics));


















      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,








        editable: (state) => !readOnly && !previewMiddleQuestion(state),
        attributes: {
          ...(typeof prev.attributes === "function" ? {} : prev.attributes),
          id: "write",
        },
      }));




      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {



        if (readOnly) return;




        if (markdown !== prev) onChange?.(joinFrontMatter(parameter.getFrontMatter(), markdown));
      });
    })









    .use(encloseBarLanguageFillAll)
    .use(readOnly ? [] : [compositionPruneGuard, linuxImeEnterGuard])
    .use(readOnly ? [] : [literalInlineInput(autoPair)])
    .use(readOnly ? [] : [inlineMarkKeymap])
    .use(
      commonmark.filter(
        (plugin) =>
          plugin !== wrapInHeadingInputRule &&
          !removedCommonmarkPlugins.has(plugin) &&
          plugin !== emphasisStarInputRule &&
          plugin !== emphasisUnderscoreInputRule &&
          plugin !== inlineCodeInputRule &&
          plugin !== strongInputRule,
      ),
    )




    .use(inlineMarkSpecPlugin)












    .use(inlineMarkCommand)



    .use(readOnly ? [] : [explicitLinkTyping()])
    .use(readOnly || !autoPair ? [] : [autoPairPlugin(true, punctuation)])
    .use(
      readOnly || !keyboardExperienceEnabled
        ? []
        : [...linkSourceNodePlugins, linkSourceReveal],
    )
    .use(inlineMarkInputRuleRule(inlineExtensions))
    .use(gfm)
    .use(gitHubNoticePlugin)




    .use(punctuationInput(punctuation))
    .use(punctuationDecoration(punctuation))



    .use(selfActionMoreCorrectInput(selfActionMoreCorrect))


    .use(autoLinks ? [...selfActionLinkInput(), autoLinkBoundary()] : [])


    .use(explicitLinkInput())




    .use(emojiInputRuleRule(emoji))




    .use(emojiFillAll(emoji && !readOnly))



    .use(inlineMarkParse(inlineExtensions))



    .use(blockHTMLSpecPlugin)
    .use(blockHTMLParse())


    .use(blockHTMLView(documentPath))
    .use(blockHTMLDiagnostics)


    .use(footnoteNavigation)


    .use(githubDocsCompat)




    .use(fillAllImageSliceAttribute)











    .use($prose(() => combineWriteCheckCheckPlugin()))




    .use($prose(() => coverWritePlugin()))



    .use(readOnly ? [] : [blockContainerKeypress])
    .use(
      readOnly || !parameter.vimInput
        ? []
        : [vimInputPlugin(parameter.vimInput.config, parameter.vimInput.hooks)],
    )
    .use(history)
    .use(listener)
    .use(cursor)
    .use(readOnly ? [] : [$prose(() => flashSparkCursor())])


    .use(pastePastePlaceManage(autoLinks))
    .use(clipboard)



    .use(tableTab())
    .use(textTab(defaultIndent))
    .use(readOnly ? [] : [tableEnterKey])









    .use(readOnly ? [] : [codeBlockKeyboardEntry, moveKeymap])
    .use(indent)
    .use(trailing)
    .use(instantRender)
    .use(taskList)
    .use(tableInputRule)
    .use(tableInput)



    .use(markTitleReturnCarBecomeBlock(strict))




    .use(markTitleLineFirstBackCell(strict))



    .use(paragraphWithoutBlankLine)




    .use(documentMustNotExportEmptyRoot)
    .use(codeBlockView)
    .use(prism)













    .use(math)



    .use(linkBoundarySpec)
    .use(commonStyleInput)
    .use(commonStyleCommit)



    .use(commonStyleBlockReturnCar)









    .use(inlineMathSpec)
    .use(latexMathDelimiter)
    .use(markDollarDollarNumber)





    .use(receiveStrictDollarDollar)










    .use(imageTableSpecPlugin)
    .use(mermaidCodeBlockConvertReplace)
    .use(imageTableInputRuleRule)
    .use(imageTableParse())
    .use(diagramView)





    .use(mathView)

    .use(liveToc)








    .use(visionFrequencyView(documentPath))









    .use(options.onCommandState ? [cursorStatePlugin(options.onCommandState)] : [])


    .use(options.onFindStatus ? [findPlugin(options.onFindStatus)] : [])




    .use(options.onSelection ? [selectionSnapshotPlugin(options.onSelection)] : [])



    .use(readOnly ? [] : [writingModePlugin(options.writingModes)])



    .use(readOnly ? [] : [...remarkInlineEscapePlugins, ...inlineSyntaxNodePlugins, ...inlineEscapeNodePlugins, markHint])




    .use(readOnly ? [] : [previewPlugin(options.review ?? null, options.onReviewEscape ?? (() => {}))])
    .create();}
