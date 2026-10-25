/**
 * 延迟读取一次编辑器全文。
 *
 * 源码编辑器在按键事务里已经持有完整文档。若每次事务都调用
 * `doc.toString()`，大文件会不断复制数 MB 的字符串，并把旧副本交给垃圾回收；
 * 用户看到的是输入间歇性停顿。这里只记录“需要快照”，等连续输入停下来后读取
 * 当前状态一次。
 *
 * 该模块只负责计时，不知道 CodeMirror、React 或后端；保存和切模式仍应直接
 * 读取编辑器，不能等待这里。
 */
export interface DeferredSnapshot {
  /** 记一次变化；已有待处理快照时重新计时。 */
  touch: () => void;
  /** 立即交付当前快照；没有待处理快照时什么都不做。 */
  flush: () => void;
  /** 丢弃待处理快照。 */
  cancel: () => void;
}

export interface DeferredSnapshotOptions {
  /** 读取当前全文。`null` 表示实例已经不可用。 */
  read: () => string | null;
  /** 接收去抖后的全文快照。 */
  deliver: (markdown: string) => void;
  delayMs: number;
  /** 测试可注入；生产环境默认使用 `window`。 */
  setTimer?: (callback: () => void, delayMs: number) => number;
  clearTimer?: (timer: number) => void;
}

export function createDeferredSnapshot({
  read,
  deliver,
  delayMs,
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timer) => window.clearTimeout(timer),
}: DeferredSnapshotOptions): DeferredSnapshot {
  let timer: number | null = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };

  const flush = () => {
    if (timer === null) return;
    cancel();
    const markdown = read();
    if (markdown !== null) deliver(markdown);
  };

  return {
    touch: () => {
      cancel();
      timer = setTimer(flush, delayMs);
    },
    flush,
    cancel,
  };
}
