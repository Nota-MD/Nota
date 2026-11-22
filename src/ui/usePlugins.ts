



























import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@/ui/file-picker";

import {
  api,
  events,
  on,
  type PluginInfo,
  type PluginMenuItem,
  type PluginPanel,
  type PluginPanelFocusPayload,
  type PluginReloadedPayload,
  type PluginSetting,
  type PluginReview,
  type PluginUpdateInfo,
  type TableContextAction,
  type trustRecord,
  type exportReport,
} from "@/bridge/ipc";
import { t, useLanguage } from "@/i18n";
import { MENUS, type MenuSpec } from "@/ui/commands";
import { recognizeRecognizeOfMenu, withPluginDock, pluginItemId } from "@/ui/pluginMenus";
import { askParameter } from "@/ui/plugin-prompt";
import { keyNameDescription } from "@/ui/pluginText";
import type { Toast } from "@/ui/Toasts";
import type { ConfirmAnswer, ConfirmRequest, PromptRequest } from "@/ui/useDialogs";
import { pluginApiHintFromError, pluginApiHintKey } from "@/ui/plugin-api";
import type { VimInputConfig } from "@/editor/plugin-vim-types";
import { useEditorInput } from "@/ui/useEditorInput";

export interface PluginsWiring {
  toast: (message: string, level?: Toast["level"]) => void;
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;

  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;

  setDockOpen: (open: boolean) => void;

  extensionsEnabled: boolean;
}

/** One panel reveal request. `serial` distinguishes repeated requests for the same panel. */
export interface PluginPanelFocus extends PluginPanelFocusPayload {
  serial: number;
}







export interface pluginAction {

  install: () => Promise<void>;








  export: (id: string) => Promise<void>;

  unload: (id: string) => Promise<void>;







  openDirectory2: () => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<void>;







  messageTask: (id: string, pointTexture?: string | null) => Promise<void>;






  settings: (id: string, key: string, value: string | number | boolean) => Promise<void>;

  checkForUpdates: () => Promise<void>;

  update: (id: string) => Promise<void>;

  updateAll: () => Promise<void>;

  busy: string | null;
}

export interface PluginsState {

  plugins: PluginInfo[];
  /** Keyboard adapter currently contributed by a loaded extension. */
  editorInput: VimInputConfig | null;

  panels: PluginPanel[];








  messageTask: trustRecord[];

  pluginUpdate: PluginUpdateInfo[];






  menus: MenuSpec[];
  /** Context actions contributed by active table-capable extensions. */
  tableActions: TableContextAction[];




  handlers: Record<string, () => void>;






  configure: (plugin: string, command: string, args?: unknown) => Promise<void>;

  action: pluginAction;




  review: PluginReview | null;

  receivePreview: () => Promise<void>;

  panelFocus: PluginPanelFocus | null;

  focusPanel: (plugin: string, id: string) => void;

  openPanelFull: (plugin: string, id: string) => Promise<void>;
}

export function usePlugins({
  toast,
  askPrompt,
  askConfirm,
  setDockOpen,
  extensionsEnabled,
}: PluginsWiring): PluginsState {




  //




  const language2 = useLanguage();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [panels, setPanels] = useState<PluginPanel[]>([]);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>([]);
  const [tableActions, setTableActions] = useState<TableContextAction[]>([]);

  const [trustTable, setTrustTable] = useState<trustRecord[]>([]);
  const [pluginUpdate, setPluginUpdate] = useState<PluginUpdateInfo[]>([]);
  const announcedStartupApiMismatch = useRef(new Set<string>());

  const [busy, setBusy] = useState<string | null>(null);









  const activeActive = useRef(true);
  useEffect(() => {
    activeActive.current = true;
    return () => {
      activeActive.current = false;
    };
  }, []);

  const heavyPull = useCallback(async () => {
    if (!extensionsEnabled) {
      setPlugins([]);
      setPanels([]);
      setMenuItems([]);
      setTableActions([]);
      setTrustTable([]);
      setPluginUpdate([]);
      setDockOpen(false);
      return;
    }
    const [plugins, panels, menus, trustEntries, tableActions] = await Promise.all([
      api.plugin.list(),
      api.plugin.panels(),
      api.plugin.menus(),
      api.plugin.trustList(),
      api.table.actions(),
    ]);
    if (!activeActive.current) return;
    setPlugins(plugins);
    setPanels(panels);
    setMenuItems(menus);
    setTrustTable(trustEntries);
    setTableActions(tableActions);
  }, [extensionsEnabled, setDockOpen]);



  //



  useEffect(() => {
    void (async () => {
      try {
        await heavyPull();
      } catch (e) {


        toast(t("Could not read extension status: {0}", String(e)), "error");
      }
    })();
  }, [heavyPull, toast]);

  useEffect(() => {
    const incompatible = plugins.filter((plugin) => !plugin.api_supported);
    const unseen = incompatible.filter((plugin) => {
      const key = `${plugin.id}@${plugin.api}`;
      if (announcedStartupApiMismatch.current.has(key)) return false;
      announcedStartupApiMismatch.current.add(key);
      return true;
    });
    if (unseen.length === 0) return;

    const needsUpdate = unseen.some(
      (plugin) => pluginApiHintKey(plugin.api, plugin.host_api) === "update",
    );
    toast(
      t(
        "{0} extension(s) did not start because their API version is incompatible. {1}",
        unseen.length,
        needsUpdate
          ? t("Please check for a software update or contact the developer.")
          : t("Please contact the developer."),
      ),
      "error",
    );
  }, [plugins, toast]);

  useEffect(() => {
    if (!extensionsEnabled) return;
    let unsubscribe: (() => void) | null = null;
    let active = true;
    void on<PluginReloadedPayload>(events.pluginReloaded, (payload) => {
      if (!active) return;
      if (payload.error) {
        toast(payload.error, "error");
        return;
      }
      void heavyPull().catch((error) => {
        if (active) toast(t("Could not refresh reloaded extension: {0}", String(error)), "error");
      });
    }).then((dispose) => {
      if (active) unsubscribe = dispose;
      else dispose();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [extensionsEnabled, heavyPull, toast]);


  useEffect(() => {
    if (!extensionsEnabled) return;
    let returnAt = true;
    api.plugin
      .updates()
      .then((updates) => {
        if (returnAt) setPluginUpdate(updates);
      })
      .catch(() => {

      });
    return () => {
      returnAt = false;
    };
  }, [extensionsEnabled]);











  const [review, setReview] = useState<PluginReview | null>(null);

  useEffect(() => {
    if (!extensionsEnabled) {
      setReview(null);
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let returnActiveActive = true;

    const pullPreview = async () => {
      try {
        const now = await api.plugin.review();
        if (returnActiveActive) {
          setReview(now);
          if (now) setDockOpen(false);
        }
      } catch (e) {
        if (returnActiveActive) toast(t("Could not read the in-editor preview status: {0}", String(e)), "error");
      }
    };

    void pullPreview();
    void on<Record<string, never>>(events.pluginReview, () => {
      void pullPreview();
    }).then((u) => {
      if (returnActiveActive) unsubscribe = u;
      else u();
    });

    return () => {
      returnActiveActive = false;
      unsubscribe?.();
    };
  }, [extensionsEnabled, setDockOpen, toast]);

  const receivePreview = useCallback(async () => {
    if (!review) return;
    try {
      await api.plugin.reviewClose(review.plugin);



      setReview(null);
    } catch (e) {

      toast(t("Could not close the preview: {0}", String(e)), "error");
    }
  }, [review, toast]);

  const focusSerial = useRef(0);
  const [panelFocus, setPanelFocus] = useState<PluginPanelFocus | null>(null);
  const focusPanel = useCallback(
    (plugin: string, id: string) => {
      if (!extensionsEnabled) return;
      focusSerial.current += 1;
      setPanelFocus({ plugin, id, serial: focusSerial.current });
      setDockOpen(true);
      if (review) {
        void api.plugin.reviewClose(review.plugin)
          .then(() => setReview(null))
          .catch(() => {
            /* Opening the sidebar must still work if closing the review fails. */
          });
      }
    },
    [extensionsEnabled, review, setDockOpen],
  );

  useEffect(() => {
    if (!extensionsEnabled) return;
    let unsubscribe: (() => void) | null = null;
    let alive = true;
    void on<PluginPanelFocusPayload>(events.pluginPanelFocus, ({ plugin, id }) => {
      focusPanel(plugin, id);
    }).then((u) => {
      if (alive) unsubscribe = u;
      else u();
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [extensionsEnabled, focusPanel]);

  const openPanelFull = useCallback(
    async (plugin: string, id: string) => {
      if (!extensionsEnabled) return;
      try {
        await api.plugin.reviewOpen(plugin, id);
        setDockOpen(false);
      } catch (e) {
        toast(t("Could not open extension panel {0}: {1}", `${plugin}/${id}`, String(e)), "error");
      }
    },
    [extensionsEnabled, setDockOpen, toast],
  );

  const configure = useCallback(
    async (plugin: string, command: string, args?: unknown) => {
      if (!extensionsEnabled) return;
      try {
        await api.plugin.call(plugin, command, args);
      } catch (e) {

        toast(t("Could not run “{1}” from extension {0}: {2}", plugin, command, String(e)), "error");
      }
    },
    [extensionsEnabled, toast],
  );

  const editorInput = useEditorInput(extensionsEnabled ? plugins : []);




  const menus = useMemo(
    () => withPluginDock(MENUS, extensionsEnabled ? menuItems : [], extensionsEnabled),
    [extensionsEnabled, menuItems, language2],
  );









  const handlers = useMemo(() => {
    const out: Record<string, () => void> = {};
    if (!extensionsEnabled) return out;
    for (const it of menuItems) {
      if (it.menu !== recognizeRecognizeOfMenu) continue;
      out[pluginItemId(it.plugin, it.command)] = () => {
        void (async () => {
          const ask = await askParameter({ prompt: it.prompt, askPrompt });
          if (!ask) return;
          await configure(it.plugin, it.command, ask.args);
        })();
      };
    }
    return out;
  }, [extensionsEnabled, menuItems, askPrompt, configure]);













  const run = useCallback(
    async <T,>(
      mark: string,
      doWhatWhat: () => Promise<T>,
      becomeDone?: string,
      onError?: (error: unknown) => Promise<void> | void,
    ): Promise<T | null> => {
      setBusy(mark);
      try {
        const value2 = await doWhatWhat();
        await heavyPull();
        if (becomeDone) toast(becomeDone, "info");
        return value2;
      } catch (e) {
        if (onError) await onError(e);
        else toast(String(e), "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [heavyPull, toast],
  );
















  const trustPlugin = useCallback(
    async (id: string, pointTexture?: string | null) => {

      const assertValuePointTexture = pointTexture ?? plugins.find((x) => x.id === id)?.key_id ?? null;
      const answer = await askConfirm({
        title: t("Trust This Signer?"),


        message:
          t("Fingerprint: {0}", assertValuePointTexture ?? t("(unknown)")) +
          "\n\n" +
          t("Once trusted, any package signed with this key counts as verified.") +
          "\n" +
          t("Trust is recorded by fingerprint — check it against the one the author publishes, not just the name."),
        confirmLabel: t("Trust"),
      });
      if (answer !== "confirm") return;
      await run(id, () => api.plugin.trust(id), t("Trusted {0}", assertValuePointTexture ?? id));
    },
    [plugins, askConfirm, run],
  );

  const checkForUpdates = useCallback(async () => {
    setBusy("check for updates");
    try {
      const updates = await api.plugin.updates();
      if (activeActive.current) setPluginUpdate(updates);
      const failures = updates.filter((update) => update.error);
      if (failures.length > 0) {
        toast(failures.map((update) => `${update.name}: ${update.error}`).join("\n"), "error");
      }
    } catch (e) {
      toast(t("Could not check extension updates: {0}", String(e)), "error");
    } finally {
      if (activeActive.current) setBusy(null);
    }
  }, [toast]);

  const updateOne = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const result = await api.plugin.update(id);
        await heavyPull();
        const updates = await api.plugin.updates().catch(() => null);
        if (updates && activeActive.current) setPluginUpdate(updates);
        toast(
          t("Updated {0} from {1} to {2}", result.id, result.fromVersion, result.toVersion),
          "info",
        );
        const list = await api.plugin.list().catch(() => []);
        const installed = list.find((plugin) => plugin.id === id);
        if (installed?.signature === "unknown") {
          await trustPlugin(installed.id, installed.key_id);
        }
      } catch (e) {
        toast(t("Could not update extension {0}: {1}", id, String(e)), "error");
      } finally {
        if (activeActive.current) setBusy(null);
      }
    },
    [heavyPull, trustPlugin, toast],
  );

  const updateAll = useCallback(async () => {
    const pending = pluginUpdate.filter((update) => update.available).map((update) => update.id);
    if (pending.length === 0) return;
    setBusy("update all");
    const failures: string[] = [];
    try {
      for (const id of pending) {
        try {
          await api.plugin.update(id);
        } catch (e) {
          failures.push(`${id}: ${String(e)}`);
        }
      }
      await heavyPull();
      const updates = await api.plugin.updates().catch(() => null);
      if (updates && activeActive.current) setPluginUpdate(updates);
      if (failures.length > 0) {
        toast(failures.join("\n"), "error");
      } else {
        toast(t("Updated {0} extensions.", pending.length), "info");
      }
    } finally {
      if (activeActive.current) setBusy(null);
    }
  }, [pluginUpdate, heavyPull, toast]);

  const installPlugin = useCallback(async () => {



    const select = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: t("Extension Package"), extensions: ["nota-plugin", "zip"] }],
    }).catch(() => null);
    if (typeof select !== "string") return;

    const id = await run(
      "install",
      () => api.plugin.install(select),
      undefined,
      async (error) => {
        const fallback = plugins.find((plugin) => plugin.host_api)?.host_api ?? "";
        const detail = pluginApiHintFromError(error, fallback);
        await askConfirm({
          title: t("Extension installation rejected"),
          message:
            detail.hint === "update"
              ? `${String(error)}\n\n${t("Please check for a software update or contact the developer.")}`
              : detail.hint === "contact"
                ? `${String(error)}\n\n${t("Please contact the developer.")}`
                : String(error),
          hideCancel: true,
          danger: true,
          confirmLabel: t("OK"),
        });
      },
    );
    if (id === null) return;



    //


    //


    const clearSingle = await api.plugin.list().catch(() => []);
    const p = clearSingle.find((x) => x.id === id);
    if (!p) return;
    toast(t("Installed: {0} ({1})", p.name, keyNameDescription(p.signature)), "info");
    if (p.signature === "unknown") await trustPlugin(p.id, p.key_id);
  }, [askConfirm, plugins, run, trustPlugin, toast]);

  const guideIt = useCallback(
    async (id: string) => {



      const defaultName = await api.plugin.exportName(id).catch(() => `${id}.nota-plugin`);
      const select = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: t("Extension Package"), extensions: ["nota-plugin"] }],
      }).catch(() => null);
      if (typeof select !== "string") return;





      const path = hasExtensionQuestion(select) ? select : `${select}.nota-plugin`;





      const reportInform = await run(id, () => api.plugin.export(id, path));
      if (!reportInform) return;
      toast(
        [
          t("Exported {0}", reportInform.path),
          t("{0} files, {1}", String(reportInform.files), largeSmallDescription(reportInform.bytes)),
          keyNameGoTowardDescription(reportInform.signature),
        ].join("\n"),
        "info",
      );
    },
    [run, toast],
  );

  const openDirectory = useCallback(async () => {


    await run("table of contents", () => api.plugin.openDir(), t("Opened the extension folder in your file manager"));
  }, [run]);

  const uninstallPlugin = useCallback(
    async (id: string) => {


      const answer = await askConfirm({
        title: t("Uninstall This Extension?"),

        message:
          t("The extension folder for “{0}” is deleted, along with the panels, menu items and commands it brings.", id) +
          "\n\n" +
          t("Its own settings file (the AI extension's API key, for example) is kept, and stays if you reinstall the same id."),
        confirmLabel: t("Uninstall"),
        danger: true,
      });
      if (answer !== "confirm") return;
      await run(id, () => api.plugin.uninstall(id), t("Uninstalled {0}", id));
    },
    [askConfirm, run],
  );

  const togglePlugin = useCallback(
    async (id: string, enabled: boolean) => {
      const name3 = plugins.find((p) => p.id === id)?.name ?? id;





      await run(
        id,
        () => api.plugin.setEnabled(id, enabled),
        enabled ? t("Enabled {0}", name3) : t("Disabled {0}", name3),
      );
    },
    [plugins, run],
  );


















  const writeSettings = useCallback(
    async (id: string, key: string, value: string | number | boolean) => {
      const hitFillSmall = (s: PluginSetting): PluginSetting => {
        if (s.kind === "range") return { ...s, value: Number(value) };
        if (s.kind === "toggle") return { ...s, on: value === true };
        return { ...s, text: String(value) };
      };
      setPlugins((ps) =>
        ps.map((p) =>
          p.id === id
            ? {
                ...p,
                settings: p.settings.map((s) => (s.key === key ? hitFillSmall(s) : s)),
              }
            : p,
        ),
      );
      try {
        await api.plugin.setSetting(id, key, value);
      } catch (e) {
        toast(t("Could not save a setting for extension {0}: {1}", id, String(e)), "error");
        await heavyPull().catch(() => {

        });
      }
    },
    [heavyPull, toast],
  );

  const action = useMemo<pluginAction>(
    () => ({
      busy,
      install: installPlugin,
      export: guideIt,
      unload: uninstallPlugin,
      openDirectory2: openDirectory,
      toggle: togglePlugin,
      messageTask: trustPlugin,
      settings: writeSettings,
      checkForUpdates,
      update: updateOne,
      updateAll,
    }),
    [
      busy,
      installPlugin,
      guideIt,
      uninstallPlugin,
      openDirectory,
      togglePlugin,
      trustPlugin,
      writeSettings,
      checkForUpdates,
      updateOne,
      updateAll,
    ],
  );

  return {
    plugins: extensionsEnabled ? plugins : [],
    editorInput,
    panels,
    messageTask: trustTable,
    pluginUpdate,
    menus,
    tableActions,
    handlers,
    configure,
    action,
    review: extensionsEnabled ? review : null,
    receivePreview,
    panelFocus,
    focusPanel,
    openPanelFull,
  };
}















function keyNameGoTowardDescription(goToward: exportReport["signature"]): string {
  switch (goToward) {
    case "kept":
      return t("The signature was carried over — this package still counts as verified for whoever receives it (as long as they trust that key).");
    case "dropped":
      return t("This extension was modified, so its signature no longer matches. The package does not contain a signature. It can still be installed, but it will be shown as unsigned.");
    default:
      return t("This extension was never signed.");
  }
}


function hasExtensionQuestion(path: string): boolean {
  const name3 = path.slice(path.lastIndexOf("/") + 1);


  return name3.lastIndexOf(".") > 0;
}


function largeSmallDescription(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}
