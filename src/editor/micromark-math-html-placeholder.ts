/**
 * `micromark-extension-math` 的 HTML 扩展在模块顶层静态导入 KaTeX。
 *
 * 编辑器从不使用这条 HTML 序列化路径：数学由 ProseMirror NodeView 绘制。
 * `vite.config.ts` 只在这个生产构建里把那条未使用分支换成空实现，避免 remark
 * 数学语法把整套 KaTeX 静态拖回首屏。测试与 Node 环境仍使用原包。
 */

export function mathHtml() {
  return {};
}
