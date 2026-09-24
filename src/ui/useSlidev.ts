/**
 * Slidev 预览：一场会话的全部编排。
 *
 * 从 `App.tsx` 搬出来的（搬走时那边 992 行、上限 1000）。搬的判据和
 * `TopBar`/`TabBar` 那次不同——那两支是"只画不决策"，这一支恰恰全是决策；
 * 它搬走是因为**它可以整块独立存在**：只认"文档列表 + 现在编辑器里的正文"，
 * 不碰布局、不碰菜单表，App 那一层只剩三行接线。
 *
 * 一场预览是三步：**起进程 → 轮询到端口通 → 开窗口**。
 *
 * ⚠️ 中间那步不能挪到后端去："端口通了没有"第一次可能要等几分钟（几百 MB 的
 * Slidev 得先下下来），而 Tauri 的同步命令跑在主线程上——在后端等就是冻界面。
 * 所以后端每条命令都微秒级返回，等待由这里的循环承担。详见 `src-tauri/src/slidev.rs`。
 *
 * ⚠️ 这里**只管预览的生死和正文同步**。幻灯片怎么渲染是 Slidev 自己的事：
 * 我们只重写入口文件，它的热更新会接着把浏览器里那页换掉（不刷新）。
 *
 * ⚠️ 2026-09-24 起，点菜单**不再直接起进程**：先开一个"装没装"的面板
 * （`ui/SlidevPanel.tsx`），装好了才走上面那三步。理由见那里的文件头。
 */

import { useCallback, useEffect, useRef, useState } from "react";
// ⚠️ 是 `openUrl` 不是 `openPath`：这一句要交给系统浏览器的是个 **http 地址**。
// 权限也分开管——`capabilities/default.json` 里开的是 `opener:allow-open-url`。
import { openUrl } from "@tauri-apps/plugin-opener";

import { api, type DocId, type Document, type SlidevInfo, type SlidevProbe } from "@/bridge/ipc";
import type { Toast } from "@/ui/Toasts";

/**
 * Slidev 官方文档里"装它"的那一页。
 *
 * ⚠️ 2026-09-24 **当场核过**：`https://sli.dev/hashmap.json`（VitePress 的页面表）
 * 里有 `guide_index.md`，标题 "Getting Started"，正文就是 `npm init slidev@latest`
 * 那一段。
 *
 * ⚠️ 而 `/guide/install` 那个地址**不存在**——站点是 SPA，随便什么路径都回 200
 * 和同一个外壳，看着"能用"其实掉进了兜底页。核这种链接只能查页面表，
 * **看状态码是核不出来的**。
 */
const GUIDE_URL = "https://sli.dev/guide/";

/**
 * 这一场 Slidev 预览。
 *
 * ⚠️ 它**不落盘**（没进 `settings`）：它是"现在开着的东西"，和 `dockOpen` 同类。
 * 下次打开应用时那个子进程早就没了，把 `true` 记在设置里只会让菜单勾着一个
 * 不存在的会话。真正的存活状态在 Rust 那边，这里靠 `api.slidev.status()` 拉。
 */
export interface SlidevSession {
  /** 这场预览是给哪份文档起的。**同步只认它**——切到别的文档不动预览。 */
  docId: DocId;
  /** 服务器信息。`phase === "starting"` 时还不知道端口，所以是 `null`。 */
  info: SlidevInfo | null;
  /** `starting` = 进程起了、端口还没通；`on` = 能看了，开始同步正文。 */
  phase: "starting" | "on";
}

/**
 * 「装没装」那个面板的状态。`null` = 面板没开。
 *
 * ⚠️ 和 `SlidevSession` 是**两件事**：这个只是"菜单点了、正在问"，还没有进程。
 * 用户可能看完就关掉（"哦，没装"），那什么都不该发生。
 */
export interface SlidevGate {
  /** 面板要对哪份文档开预览（用户点菜单时的那份）。 */
  docId: DocId;
  /** 后端给的报告。`null` = 还在检测。 */
  probe: SlidevProbe | null;
}

interface Options {
  /** 用来按 `docId` 找回正文、以及判断预览的那份还在不在。 */
  docs: Document[];
  /** 提示条。签名照 `App.tsx` 的 `toast`。 */
  toast: (message: string, level?: Toast["level"]) => void;
  /**
   * 编辑器里**当前**的正文。开预览时优先拿它——用户刚敲的字可能还没过完去抖、
   * 没进 `docs`，用 `docs` 里的旧文本会让第一屏少一段。
   */
  getMarkdown: () => string | undefined;
}

const PROBE_INTERVAL_MS = 500;
/** 180 秒。第一次要下 Slidev，慢是正常的；但也不能无限等下去。 */
const PROBE_TRIES = 360;

export function useSlidev({ docs, toast, getMarkdown }: Options) {
  // `null` = 没开（菜单不勾）。
  const [session, setSession] = useState<SlidevSession | null>(null);
  /**
   * 每次开始/停止预览都 +1。**进行中的那段轮询靠它判断"我这一轮还算不算数"**：
   * 用户等端口的时候又点了一次菜单（或把窗口叉了），旧循环若还接着跑，就会在
   * 停掉之后凭空开出一个窗口、并且没人关得掉它（那时 `session` 已经是 `null`）。
   */
  const run = useRef(0);

  /** 收摊。重复调用无害（后端 `stop` 对"本来就没开"是空操作）。 */
  const stop = useCallback(async () => {
    run.current += 1; // 让还在轮询的那一轮作废，别再往下开窗口
    setSession(null);
    try {
      await api.slidev.stop();
    } catch (e) {
      // ⚠️ 收摊失败**不把界面改回去**：那只会让菜单重新勾上，而用户的意图明明
      // 是关掉。真正要紧的是那个子进程（可能已经自己退了，也可能得等下次开
      // 应用时随进程组一起走），这里记一笔就够。
      console.warn("[nota] 停 Slidev 失败：", e);
    }
  }, []);

  const start = useCallback(
    async (docId: DocId) => {
      // 正文以**编辑器里的**为准，退一步才用 `docs` 里那份。
      const markdown = getMarkdown() ?? docs.find((d) => d.id === docId)?.text ?? "";

      const me = ++run.current;
      setSession({ docId, info: null, phase: "starting" });

      let info: SlidevInfo;
      try {
        info = await api.slidev.start(docId, markdown);
      } catch (e) {
        if (me === run.current) setSession(null);
        toast(`起 Slidev 失败：${e}`, "error");
        return;
      }
      if (me !== run.current) return; // 中途被停掉了

      // 等端口通。⚠️ `probe` 在后端带 300ms 超时，所以最坏每轮 800ms，
      // 界面全程是有响应的。
      for (let i = 0; i < PROBE_TRIES; i += 1) {
        if (me !== run.current) return;
        try {
          if (await api.slidev.probe()) break;
        } catch {
          // 探活本身失败当"还没通"，下一轮再试——它不该把整场预览判死。
        }
        if (i === PROBE_TRIES - 1) {
          // 超时。**把 Slidev 自己的输出整段端给用户**：缺主题、端口被占、
          // 装不上包，病因都在里面，我们编不出比它更准的话。
          const tail = await api.slidev.log().catch(() => "");
          await stop();
          toast(`Slidev 起来了但 180 秒都没通端口。它最后的输出：\n${tail}`, "error");
          return;
        }
        await new Promise((r) => window.setTimeout(r, PROBE_INTERVAL_MS));
      }

      try {
        await api.slidev.openWindow();
      } catch (e) {
        // ⚠️ 开窗失败**不判整场失败**：退回系统浏览器，预览照样能看。
        // 窗口开不出来多半是环境的事（没有窗口管理器、WebView 起不来），
        // 那不该把"能看到幻灯片"一起带走。
        void openUrl(info.url);
        toast(`预览窗口没开出来（${e}），已改用系统浏览器打开`, "warn");
      }
      if (me === run.current) setSession({ docId, info, phase: "on" });
    },
    [docs, getMarkdown, stop, toast],
  );

  // ── 「装没装」那道闸（点菜单先看它）────────────────────────────────────

  const [gate, setGate] = useState<SlidevGate | null>(null);
  /**
   * 每次开面板/重新检测都 +1。和上面 `run` 一个道理：**晚到的报告不该把面板
   * 重新打开**——用户可能在检测还没回来的时候就把面板关了（或者又点了一次
   * 菜单，那次是另一次检测）。
   */
  const gateRun = useRef(0);

  /** 问后端一次。**只问不改变任何状态**（起进程是 `start` 的事）。 */
  const check = useCallback(async (docId: DocId) => {
    const me = ++gateRun.current;
    setGate({ docId, probe: null });
    try {
      const probe = await api.slidev.probeInstall(docId);
      if (me === gateRun.current) setGate({ docId, probe });
    } catch (e) {
      // ⚠️ 探测**自己**没跑起来 ≠ 没装。报成 `unknown`，面板会说"这不代表没装，
      // 要不要直接试"——比替用户断言"你没装"诚实。
      if (me === gateRun.current) {
        setGate({
          docId,
          probe: {
            state: "unknown",
            command: "",
            version: null,
            message: `探测没跑起来：${e}`,
            detail: "",
            project_dir: null,
          },
        });
      }
    }
  }, []);

  /** 关掉面板。**顺手让还在飞的那次探测作废**，否则它回来会把面板又弹出来。 */
  const closeGate = useCallback(() => {
    gateRun.current += 1;
    setGate(null);
  }, []);

  /** 主按钮「打开预览」：面板收掉，走原来那条"起进程"的路。 */
  const openPreview = useCallback(() => {
    const docId = gate?.docId;
    closeGate();
    if (docId !== undefined) void start(docId);
  }, [gate, closeGate, start]);

  /** 「去官网看安装指南」：交给系统浏览器。开不出来就报一句，别让它静默失败。 */
  const openGuide = useCallback(() => {
    void openUrl(GUIDE_URL).catch((e) => toast(`打不开浏览器：${e}`, "error"));
  }, [toast]);

  /** 点菜单：开着就关、关着就开。`activeId` 为 `null` 时是空操作（菜单也已灰着）。 */
  const toggle = useCallback(
    (activeId: DocId | null) => {
      if (session !== null) {
        void stop();
        return;
      }
      if (activeId === null) return;
      // ⚠️ 这里**不直接 `start`**：先出面板问"装没装"。见 `ui/SlidevPanel.tsx`。
      void check(activeId);
    },
    [session, check, stop],
  );

  /** 后端报"预览停了"（用户把预览窗叉了）→ 前端跟上，菜单的勾去掉。 */
  const onStopped = useCallback(() => {
    run.current += 1; // 万一还有一轮在轮询，别让它再开窗
    setSession(null);
  }, []);

  // 预览活着的时候，正文一改就重写入口文件——**Slidev 自己的热更新接着干剩下的**。
  //
  // ⚠️ 判据里有 `docId`：预览是**给某一份文档**开的，切到别的文档不该继续往里灌
  // 正文——否则窗口里显示的东西和当前文档毫无关系，比"停住不动"更难理解。
  // ⚠️ `docs` 一变就重跑（打字去抖之后就是这样）；`phase` 那半句把"端口还没通"
  // 的这段时间挡在外面：那时候入口文件还不如不写。
  useEffect(() => {
    if (session === null || session.phase !== "on") return;
    const doc = docs.find((d) => d.id === session.docId);
    if (doc === undefined) return;
    void api.slidev.sync(doc.text).catch((e) => console.warn("[nota] 同步给 Slidev 失败：", e));
  }, [docs, session]);

  // 把后端还活着的会话接回界面。
  //
  // 存在的理由：改前端代码存盘会**只热重载前端**，Rust 侧没重启，服务器和窗口都
  // 还在，而这里的 state 全清零了——菜单会显示"没开"，再点一下就会去起第二个
  // 服务器。⚠️ 这是**拉**不是等事件（`docs/06` §3.2：事件只报"发生了"，
  // 想知道现在什么样得自己去问）。
  useEffect(() => {
    void api.slidev
      .status()
      .then((s) => {
        if (s !== null) setSession({ docId: s.doc_id, info: s, phase: "on" });
      })
      .catch(() => {
        // 接不回来就当没开过：这只是恢复现场，失败不影响别的任何功能。
      });
  }, []);

  return {
    session,
    toggle,
    onStopped,
    /** 「装没装」那个面板。`null` = 没开，App 那边就别画它。 */
    gate,
    /**
     * 面板上的四个动作。
     *
     * ⚠️ 名字**照 `SlidevPanel` 的 props 取**（点开那个文件就能对上），别在这儿
     * 另起一套说法——面板管"点哪个"，这里管"点了干什么"。
     */
    gateActions: {
      onOpen: openPreview,
      onGuide: openGuide,
      // 面板没开就不会有人点它，但真到那一步也不能拿 `null` 去查——静默跳过。
      onRecheck: () => {
        if (gate !== null) void check(gate.docId);
      },
      onClose: closeGate,
    },
  };
}
