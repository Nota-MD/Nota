/**
 * 状态栏。对标 Typora 底栏：左侧文件信息，右侧字数统计。
 */

import { useMemo } from "react";

import type { Document } from "@/bridge/ipc";
import { countText } from "@/ui/outline";

export function StatusBar({ doc }: { doc: Document | null }) {
  const counts = useMemo(() => countText(doc?.text ?? ""), [doc?.text]);

  if (!doc) {
    return (
      <footer className="statusbar">
        <span className="status-left">就绪</span>
      </footer>
    );
  }

  return (
    <footer className="statusbar">
      <span className="status-left" title={doc.path ?? "尚未保存"}>
        {doc.path ?? "未保存"}
        {doc.dirty && <span className="status-dirty">● 已修改</span>}
      </span>

      <span className="status-right">
        <span title="词数（中文按字计）">{counts.words} 词</span>
        <span title="字符数（按码点计）">{counts.characters} 字符</span>
        <span title="行数">{counts.lines} 行</span>
        <span title="按每分钟 250 词粗略估算">
          约 {counts.readingMinutes} 分钟
        </span>
      </span>
    </footer>
  );
}
