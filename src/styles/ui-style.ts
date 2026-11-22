




























import { replaceInlineStyle } from "./inline-style";


const STYLE_ID = "nota-user-ui-style";










export function applyUiStyleCss(css: string | null): void {


  replaceInlineStyle(STYLE_ID, css);
}
