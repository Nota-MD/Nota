import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTablistKeys } from "@/ui/useTablistKeys";

import { api, events, on, type PanelDirtyPayload, type PanelStreamPayload, type PluginInfo, type PluginPanel, type trustRecord } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { DockResizer } from "@/ui/DockResizer";
import { Icon } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";
import { PanelBody } from "@/ui/PanelBody";
import { debugEvent } from "@/ui/debug-log";
import type { MenuEntry } from "@/ui/commands";
import {
  recordRecall,
  recordHoldContentTable,
  startStartPage,
  thisValuePageDrawWhatWhat,
  type page,
  type PanelState,
} from "@/ui/panel-dock-state";

import { normalise } from "@/ui/panel-nodes";
import { positionName, ableForceName, comeSourceDescription, languageTag, languageMismatch, languageHint } from "@/ui/pluginText";
import type { PromptRequest } from "@/ui/useDialogs";
import type { PluginPanelFocus, pluginAction } from "@/ui/usePlugins";
import { reorderTabs, usePointerTabReorder } from "@/ui/tab-order";

interface Props {
  plugins: PluginInfo[];

  panels: PluginPanel[];


  messageTask: trustRecord[];

  onCall: (plugin: string, command: string, args?: unknown) => Promise<void>;

  onResize: (width: number) => void;
  onCollapse: () => void;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

  focusRequest: PluginPanelFocus | null;

  onOpenFull: (plugin: string, id: string) => Promise<void>;


  action: pluginAction;


  inert?: boolean;
  collapsed?: boolean;
}


function coordinate(p: PluginPanel): string {
  return `${p.plugin}/${p.id}`;
}


export function PluginDock({
  plugins,
  panels,
  messageTask,
  onCall,
  onResize,
  onCollapse,
  askPrompt,
  focusRequest,
  onOpenFull,
  action,
  inert,
  collapsed = false,
}: Props) {


  const t = useT();


  const rightSideOf = useMemo(() => panels.filter((p) => p.location === "right"), [panels]);


  const editorAreaOf = panels.filter((p) => p.location === "main");


  const noneDropFootPlaceOf = panels.filter((p) => p.location !== "right" && p.location !== "main");


  const keyString = rightSideOf.map(coordinate).join("\n");
  const keys = useMemo(
    () => rightSideOf.map(coordinate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyString],
  );
  const [tabOrder, setTabOrder] = useState<string[]>(() => [...recordRecall.tabOrder]);
  const [closedTabs, setClosedTabs] = useState<Set<string>>(() => new Set(recordRecall.closedTabs));
  const [addOpen, setAddOpen] = useState(false);
  const orderedKeys = useMemo(
    () => [
      ...tabOrder.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !tabOrder.includes(key)),
    ],
    [keys, tabOrder],
  );
  const visibleKeys = useMemo(
    () => orderedKeys.filter((key) => !closedTabs.has(key)),
    [closedTabs, orderedKeys],
  );


  const [current, setCurrent] = useState<page>(() => startStartPage(recordRecall.current, keys));
  const [contentTable, setContentTable] = useState<Record<string, PanelState>>(() => recordRecall.contentTable);


  const [actualTimeTable, setActualTimeTable] = useState<Record<string, string>>(() => recordRecall.actualTimeTable);


  useEffect(() => {
    recordRecall.current = current;
  }, [current]);
  useEffect(() => {
    recordRecall.contentTable = recordHoldContentTable(contentTable);
  }, [contentTable]);
  useEffect(() => {
    recordRecall.actualTimeTable = actualTimeTable;
  }, [actualTimeTable]);
  useEffect(() => {
    recordRecall.tabOrder = tabOrder;
  }, [tabOrder]);
  useEffect(() => {
    recordRecall.closedTabs = [...closedTabs];
  }, [closedTabs]);
  useEffect(() => {
    setTabOrder((order) => [...order.filter((key) => keys.includes(key)), ...keys.filter((key) => !order.includes(key))]);
    setClosedTabs((closed) => new Set([...closed].filter((key) => keys.includes(key))));
  }, [keyString, keys]);


  const handActionSelectPass = useRef(false);

  const pageKeyBar = useRef<HTMLElement>(null);
  useTablistKeys(pageKeyBar);
  const { dragId, dropTarget, begin } = usePointerTabReorder({
    container: pageKeyBar,
    onReorder: (sourceId, targetId, place) => {
      setTabOrder((order) =>
        reorderTabs(order.map((id) => ({ id })), sourceId, targetId, place).map((item) => item.id),
      );
    },
  });
  const splitTo = (page: page) => {
    handActionSelectPass.current = true;
    setCurrent(page);
  };


  useEffect(() => {
    const hasEffect = current !== null && visibleKeys.includes(current);
    if (hasEffect) return;
    if (handActionSelectPass.current && current !== null) return;
    if (current === null && handActionSelectPass.current) return;
    setCurrent(visibleKeys[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyString, visibleKeys]);

  const activity = current !== null && keys.includes(current) ? current : null;
  const activityPanel = rightSideOf.find((p) => coordinate(p) === activity) ?? null;
  const handledFocus = useRef(0);

  useEffect(() => {
    if (!focusRequest || focusRequest.serial === handledFocus.current) return;
    const key = `${focusRequest.plugin}/${focusRequest.id}`;
    if (!keys.includes(key)) return;
    handledFocus.current = focusRequest.serial;
    setClosedTabs((closed) => {
      if (!closed.has(key)) return closed;
      const next = new Set(closed);
      next.delete(key);
      return next;
    });
    handActionSelectPass.current = true;
    setCurrent(key);
  }, [focusRequest, keyString, keys]);


  const index = useRef<Record<string, number>>({});

  const pull = useCallback(async (plugin: string, id: string) => {
    const key = `${plugin}/${id}`;
    const thisCount = (index.current[key] = (index.current[key] ?? 0) + 1);

    setContentTable((m) => ({
      ...m,

      [key]: m[key]?.state === "ok" || m[key]?.state === "error" ? m[key] : { state: "loading" },
    }));

    try {
      const nodes = normalise(await api.plugin.panelContent(plugin, id));
      if (index.current[key] !== thisCount) return;
      setContentTable((m) => ({ ...m, [key]: { state: "ok", nodes, busy: null } }));


      setActualTimeTable((m) => (plugin in m ? { ...m, [plugin]: "" } : m));
    } catch (e) {
      if (index.current[key] !== thisCount) return;


      setContentTable((m) => ({
        ...m,
        [key]: { state: "error", message: String(e), busy: null },
      }));
    }
  }, []);


  useEffect(() => {
    if (!activityPanel) return;
    void pull(activityPanel.plugin, activityPanel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, pull]);


  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<PanelDirtyPayload>(events.pluginPanel, ({ plugin, id }) => {
      if (!activityPanel || activityPanel.plugin !== plugin) return;
      if (id === null || id === activityPanel.id) void pull(activityPanel.plugin, activityPanel.id);
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, pull]);


  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<PanelStreamPayload>(events.pluginStream, ({ plugin, text }) => {
      debugEvent("plugin", "panel stream", { plugin, length: text.length });
      setActualTimeTable((m) => ({ ...m, [plugin]: text }));
    }).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);


  const run = async (plugin: string, id: string, command: string, args?: unknown) => {
    const key = `${plugin}/${id}`;
    setContentTable((m) => {
      const oldValue = m[key];
      if (oldValue?.state !== "ok") return m;
      return { ...m, [key]: { ...oldValue, busy: command } };
    });
    try {
      await onCall(plugin, command, args);
    } finally {


      void pull(plugin, id);
    }
  };


  const pluginPage = (
    <>
      {editorAreaOf.length > 0 && (


        <section className="dock-orphans">
          <h4 className="dock-subtitle">{t("In-editor panels")}</h4>
          <p className="dock-hint">
            {t("These panels are laid over the editing area; the extension opens one when it needs to (e.g. “View in editor” after the AI proposes a change).")}
          </p>
          {editorAreaOf.map((p) => (
            <p key={coordinate(p)} className="dock-orphan">
              {p.title || p.id}
              <span className="dock-orphan-where">{t("editing area")}</span>
            </p>
          ))}
        </section>
      )}

      {noneDropFootPlaceOf.length > 0 && (
        <section className="dock-orphans">
          <h4 className="dock-subtitle">{t("Nowhere to land")}</h4>
          <p className="dock-hint">
            {t("These panels declare a location that does not exist yet, so they are not shown anywhere.")}
          </p>
          {noneDropFootPlaceOf.map((p) => (
            <p key={coordinate(p)} className="dock-orphan">
              {p.title || p.id}


              <span className="dock-orphan-where">{positionName(p.location) ?? p.location}</span>
            </p>
          ))}
        </section>
      )}

      <h4 className="dock-subtitle dock-subtitle-row">
        {t("Installed extensions")}


        <button
          type="button"


          className="btn plugin-install"
          disabled={action.busy !== null}
          title={t("Install from an extension package (.nota-plugin)")}
          onClick={() => void action.install()}
        >
          {action.busy === "install" ? t("Installing…") : t("Install from file…")}
        </button>
      </h4>
      {plugins.length ? (
        <ul className="plugins">
          {plugins.map((p) => (
            <li key={p.id} className={`plugin plugin-${p.state}`}>
              <div className="plugin-head">
                <span className="plugin-name">{p.name}</span>
                <span className="plugin-version">{p.version}</span>
              </div>
              <div className="plugin-id">
                {p.id}


                <span className="plugin-origin">{comeSourceDescription(p)}</span>
              </div>
              {p.description && <p className="plugin-desc">{p.description}</p>}





              {languageMismatch(p) && (
                <p className="plugin-lang">
                  {languageHint()}
                  <span className="plugin-lang-now">
                    {languageTag(p.lang ?? "en") ?? (p.lang ?? "en")}
                  </span>
                </p>
              )}
              {p.error && <p className="plugin-error">{p.error}</p>}
              {p.capabilities.length > 0 && (
                <div className="plugin-caps">
                  {p.capabilities.map((c) => (


                    <span key={c} className="cap" title={c}>
                      {ableForceName(c) ?? c}
                    </span>
                  ))}
                </div>
              )}
              <div className="plugin-actions">
                <button
                  type="button"
                  className="btn plugin-action"
                  disabled={action.busy !== null}
                  onClick={() => void action.toggle(p.id, p.state === "disabled")}
                >
                  {action.busy === p.id
                    ? "…"
                    : p.state === "disabled"
                      ? t("Enable")
                      : t("Disable")}
                </button>





                {p.removable && (
                  <button
                    type="button"
                    className="btn plugin-action plugin-action-danger"
                    disabled={action.busy !== null}
                    onClick={() => void action.unload(p.id)}
                  >
                    {t("Uninstall")}
                  </button>
                )}
                {p.signature === "unknown" && (
                  <button
                    type="button"
                    className="btn plugin-action"
                    disabled={action.busy !== null}
                    title={t("Trust {0}", p.key_id ?? t("this signer"))}
                    onClick={() => void action.messageTask(p.id, p.key_id)}
                  >
                    {t("Trust")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sidebar-empty">
          {t("No extensions installed. Use “Install from file…” above.")}
        </p>
      )}







      {messageTask.length > 0 && (
        <section className="dock-trust">
          <h4 className="dock-subtitle">{t("Trusted signers")}</h4>
          <p className="dock-hint">
            {t("Packages signed by these fingerprints count as verified. Edit ")}
            <code>trusted-keys.toml</code>
            {t(" to fix a mismatch.")}
          </p>
          {messageTask.map((k) => (
            <p key={k.key_id} className="trust-row">
              <span className="trust-key">{k.key_id}</span>
              <span className="trust-name">{k.name}</span>
            </p>
          ))}
        </section>
      )}
    </>
  );


  const body2 = (() => {
    if (activityPanel === null) return pluginPage;


    const key = coordinate(activityPanel);
    const state2 = contentTable[key] ?? { state: "loading" as const };


    const actualTime = actualTimeTable[activityPanel.plugin] ?? "";
    const draw = thisValuePageDrawWhatWhat(state2, actualTime);


    const thisPlugin = plugins.find((p) => p.id === activityPanel.plugin);
    return (
      <section className="dock-panels">


        <article key={key} className="panel">
          {thisPlugin && languageMismatch(thisPlugin) && (
            <p className="panel-lang">{languageHint()}</p>
          )}
          <div className="panel-body">
            {draw.notice === "load" && <p className="panel-pending">{t("Loading…")}</p>}
            {draw.error !== null && (
              <p className="panel-error" role="alert">
                {draw.error}
              </p>
            )}
            {


              draw.notice === "empty" && <p className="panel-empty">{t("The extension has nothing to show.")}</p>
            }
            {draw.nodes.length > 0 && (
              <PanelBody
                plugin={activityPanel.plugin}
                nodes={draw.nodes}
                busy={draw.busy}
                askPrompt={askPrompt}
                onCall={(plugin, command, args) => run(plugin, activityPanel.id, command, args)}
              />
            )}
          </div>
        </article>
      </section>
    );
  })();

  const closeDockTab = (key: string) => {
    const index = visibleKeys.indexOf(key);
    setClosedTabs((closed) => new Set(closed).add(key));
    if (current === key) {
      setCurrent(visibleKeys[index + 1] ?? visibleKeys[index - 1] ?? null);
    }
  };
  const hiddenKeys = orderedKeys.filter((key) => closedTabs.has(key));
  const hiddenEntries: MenuEntry[] = hiddenKeys.length
    ? hiddenKeys.map((key) => {
        const panel = rightSideOf.find((p) => coordinate(p) === key);
        return { id: key, label: panel?.title || panel?.id || key };
      })
    : [{ id: "__none", label: t("No closed extension panels") }];
  const hiddenDisabled = new Set(hiddenKeys.length ? [] : ["__none"]);

  useEffect(() => {
    if (!addOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".dock-tab-add")) return;
      setAddOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [addOpen]);

  return (


    <aside
      data-wide={activityPanel?.wide || undefined}
      data-collapsed={collapsed || undefined}
      className={`plugin-dock${collapsed ? " plugin-dock-collapsed" : ""}`}
      inert={inert || collapsed || undefined}
    >
      <nav className="dock-head">
        <span className="dock-title">
          {activityPanel ? activityPanel.title || activityPanel.id : t("Extensions")}
        </span>
        {activityPanel && (
          <button
            type="button"
            className="btn dock-head-action"
            title={t("Open in the editing area")}
            aria-label={t("Open in the editing area")}
            onClick={() => void onOpenFull(activityPanel.plugin, activityPanel.id)}
          >
            <Icon name="nota-expand-symbolic" />
          </button>
        )}





      </nav>







      <nav ref={pageKeyBar} className="dock-tabs" role="tablist" aria-label={t("Extension panels")}>
        {visibleKeys.map((key) => {
          const p = rightSideOf.find((panel) => coordinate(panel) === key);
          if (!p) return null;
          return (
            <div
              key={key}
              className="dock-tab-shell"
              data-tab-id={key}
              data-active={key === activity}
              data-dragging={dragId === key || undefined}
              data-drop-before={dropTarget?.id === key && dropTarget.place === "before" || undefined}
              data-drop-after={dropTarget?.id === key && dropTarget.place === "after" || undefined}
              onPointerDown={(event) => begin(key, event)}
            >
              <button
                type="button"
                role="tab"
                className="dock-tab"
                aria-selected={key === activity}
                title={t("Provided by extension {0}", p.plugin)}
                onClick={() => splitTo(key)}
              >
                {p.title || p.id}
              </button>
              <button
                type="button"
                className="dock-tab-close"
                title={t("Close extension panel")}
                aria-label={t("Close extension panel")}
                data-no-tab-drag
                onClick={() => closeDockTab(key)}
              >
                <Icon name="nota-tab-close-symbolic" size={12} />
              </button>
            </div>
          );
        })}
        <div className="dock-tab-add">
          <button
            type="button"
            className="dock-tab-add-button"
            title={t("Open a closed extension panel")}
            aria-label={t("Open a closed extension panel")}
            aria-expanded={addOpen}
            onClick={() => setAddOpen((open2) => !open2)}
          >
            +
          </button>
          {addOpen && (
            <MenuPopup
              label={t("Extension panels")}
              entries={hiddenEntries}
              disabled={hiddenDisabled}
              checks={{}}
              onPick={(key) => {
                setClosedTabs((closed) => {
                  const next = new Set(closed);
                  next.delete(key);
                  return next;
                });
                setCurrent(key);
                setAddOpen(false);
              }}
              onDismiss={() => setAddOpen(false)}
              onArrowOut={() => {}}
            />
          )}
        </div>
        <button
          type="button"
          role="tab"
          className="dock-tab dock-tab-plugins"
          data-active={activity === null}
          aria-selected={activity === null}
          title={t("Installed extensions (look here when something is wrong)")}
          onClick={() => splitTo(null)}
        >
          {t("Extensions")}
        </button>
      </nav>







      <div className="dock-body">
        {body2}
      </div>
      <DockResizer onCommit={onResize} onCollapse={onCollapse} />
    </aside>
  );
}
