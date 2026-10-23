/**
 * 表格浮动工具栏和右键「表格」子菜单用到的结构操作。
 *
 * 列宽拖动已经移除；这里的 resize 是“改变整张表的行列数”，不是拖列边界。
 */

import { editorViewCtx, parserCtx, serializerCtx, type Editor } from "@milkdown/kit/core";
import { Fragment, type Node as PMNode, type NodeType } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  findTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@milkdown/kit/prose/tables";

function 行们(表: PMNode): PMNode[] {
  const 出: PMNode[] = [];
  表.forEach((行) => 出.push(行));
  return 出;
}

function 空格(类型: NodeType, 模板: PMNode | null): PMNode {
  const 对齐 = 模板?.attrs.alignment;
  const attrs = 对齐 === undefined ? null : { alignment: 对齐 };
  return 类型.createAndFill(attrs) ?? 类型.create(attrs);
}

function 调整行(行: PMNode, 列数: number, 模板: PMNode | null): PMNode {
  const 格们: PMNode[] = [];
  行.forEach((格, _偏移, 下标) => {
    if (下标 >= 列数) return;
    格们.push(格);
  });
  const 格类型 =
    行.firstChild?.type ??
    模板?.firstChild?.type ??
    null;
  if (!格类型) return 行;
  while (格们.length < 列数) 格们.push(空格(格类型, 模板?.firstChild ?? null));
  return 行.type.create(行.attrs, Fragment.from(格们));
}

/** 把光标所在表格调整为目标列数 / 行数（行数包含表头行）。 */
export function 调整当前表格(editor: Editor, 列数: number, 行数: number): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const found = findTable(state.selection.$from);
    if (!found) return;
    const 列 = Math.max(1, Math.min(12, Math.round(列数)));
    const 行 = Math.max(2, Math.min(30, Math.round(行数)));
    const 原行们 = 行们(found.node);
    const 头行 = 原行们[0];
    if (!头行) return;
    const 格 = 头行.firstChild;
    if (!格) return;

    const 新行们: PMNode[] = [];
    for (let r = 0; r < 行; r += 1) {
      const 原 = 原行们[r];
      if (原) {
        新行们.push(调整行(原, 列, 头行));
        continue;
      }
      const 行类型 = state.schema.nodes.table_row;
      if (!行类型) return;
      const 格类型 = state.schema.nodes.table_cell ?? 格.type;
      const 格们: PMNode[] = [];
      for (let c = 0; c < 列; c += 1) 格们.push(空格(格类型, 格));
      新行们.push(行类型.create(null, Fragment.from(格们)));
    }

    const 新表 = found.node.type.create(found.node.attrs, Fragment.from(新行们));
    const tr = state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, 新表);
    tr.setSelection(TextSelection.near(tr.doc.resolve(found.pos + 4)));
    view.dispatch(tr.scrollIntoView());
  });
}

/** 上移 / 下移当前行；表头行不参与移动。 */
export function 移动当前表行(editor: Editor, 方向: -1 | 1): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view.state.selection.$from.parent.inlineContent) return;
    const 表 = selectedRect(view.state);
    if (表.top === 0) return;
    const 从 = 表.top;
    const 到 = Math.max(1, Math.min(表.map.height - 1, 从 + 方向));
    if (从 === 到) return;
    moveTableRow({ from: 从, to: 到, select: false })(
      view.state,
      (tr) => view.dispatch(tr.scrollIntoView()),
    );
  });
}

/** 左移 / 右移当前列。 */
export function 移动当前表列(editor: Editor, 方向: -1 | 1): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view.state.selection.$from.parent.inlineContent) return;
    const 表 = selectedRect(view.state);
    const 从 = 表.left;
    const 到 = Math.max(0, Math.min(表.map.width - 1, 从 + 方向));
    if (从 === 到) return;
    moveTableColumn({ from: 从, to: 到, select: false })(
      view.state,
      (tr) => view.dispatch(tr.scrollIntoView()),
    );
  });
}

/** 把当前表格按 Markdown 序列化后的规范列宽重排一次。 */
export function 格式化当前表格(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const found = findTable(view.state.selection.$from);
    if (!found) return;
    const 序列化 = ctx.get(serializerCtx);
    const 解析 = ctx.get(parserCtx);
    let 新表: PMNode | null = null;
    解析(序列化(found.node)).descendants((node) => {
      if (!新表 && node.type.name === "table") {
        新表 = node;
        return false;
      }
      return true;
    });
    if (!新表) return;
    view.dispatch(
      view.state.tr
        .replaceWith(found.pos, found.pos + found.node.nodeSize, 新表)
        .scrollIntoView(),
    );
  });
}

/** 复制当前表格；同时提供 HTML 与纯文本，与常见表格软件的剪贴板一致。 */
export function 复制当前表格(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const found = findTable(view.state.selection.$from);
    if (!found) return;
    const 盒 = document.createElement("div");
    const 表 = document.createElement("table");
    found.node.forEach((行) => {
      const tr = document.createElement("tr");
      行.forEach((格) => {
        const td = document.createElement(格.type.name === "table_header" ? "th" : "td");
        td.textContent = 格.textContent;
        tr.append(td);
      });
      表.append(tr);
    });
    盒.append(表);
    const html = 盒.innerHTML;
    const text = 表.innerText;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ])
        .catch(() => navigator.clipboard?.writeText(text));
    } else {
      void navigator.clipboard?.writeText(text);
    }
  });
}
