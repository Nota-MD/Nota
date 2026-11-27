































import { useMemo } from "react";

import type { MarkdownSettings } from "@/bridge/ipc";
import { DefaultInlineExtensionFlags } from "@/editor/inline-marks";
import { DefaultPunctuationSettings, type punctuationSettings } from "@/editor/smart-punctuation";
import {
  DefaultMarkdownSyntaxStyle,
  type MarkdownSyntaxStyle,
} from "@/editor/markdown-syntax-style";


export interface editorSettings {
  inlineExtensions: { highlight: boolean; superscript: boolean; subscript: boolean };
  punctuation: punctuationSettings;
  selfActionMoreCorrect: boolean;
  autoLinks: boolean;
  autoPair: boolean;
  defaultIndent: number;
  markdownSyntaxStyle: MarkdownSyntaxStyle;
}





export function useEditorSettings(
  markdown: MarkdownSettings | undefined,
  autoPairSetting = false,
  defaultIndentSetting = 2,
): editorSettings {




  const inlineExtensions = useMemo(
    () => ({
      highlight: markdown?.highlight ?? DefaultInlineExtensionFlags.highlight,
      superscript: markdown?.superscript ?? DefaultInlineExtensionFlags.superscript,
      subscript: markdown?.subscript ?? DefaultInlineExtensionFlags.subscript,
    }),
    [markdown?.highlight, markdown?.superscript, markdown?.subscript],
  );




  const punctuation = useMemo<punctuationSettings>(
    () => ({
      mode2: markdown?.smart_punctuation ?? DefaultPunctuationSettings.mode2,
      referenceNumber: markdown?.smart_quotes ?? DefaultPunctuationSettings.referenceNumber,
      doubleReferenceNumber: markdown?.smart_quotes_double ?? DefaultPunctuationSettings.doubleReferenceNumber,
      singleReferenceNumber: markdown?.smart_quotes_single ?? DefaultPunctuationSettings.singleReferenceNumber,
      dash: markdown?.smart_dashes ?? DefaultPunctuationSettings.dash,
      windCell: markdown?.dash_style ?? DefaultPunctuationSettings.windCell,
      saveOmitNumber: DefaultPunctuationSettings.saveOmitNumber,
    }),
    [
      markdown?.smart_punctuation,
      markdown?.smart_quotes,
      markdown?.smart_quotes_double,
      markdown?.smart_quotes_single,
      markdown?.smart_dashes,
      markdown?.dash_style,
    ],
  );



  const selfActionMoreCorrect = markdown?.auto_correct ?? true;
  const autoLinks = markdown?.autolink ?? true;
  const autoPair = autoPairSetting;
  const defaultIndent = Math.max(1, Math.min(8, defaultIndentSetting));
  const markdownSyntaxStyle = useMemo<MarkdownSyntaxStyle>(
    () => ({
      heading: markdown?.heading_style ?? DefaultMarkdownSyntaxStyle.heading,
      bullet: markdown?.bullet_mark ?? DefaultMarkdownSyntaxStyle.bullet,
      ordered: markdown?.ordered_mark ?? DefaultMarkdownSyntaxStyle.ordered,
    }),
    [markdown?.bullet_mark, markdown?.heading_style, markdown?.ordered_mark],
  );

  return {
    inlineExtensions,
    punctuation,
    selfActionMoreCorrect,
    autoLinks,
    autoPair,
    defaultIndent,
    markdownSyntaxStyle,
  };
}
