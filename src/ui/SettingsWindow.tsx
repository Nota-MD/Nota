import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  on,
  type PluginInfo,
  type PluginUpdateInfo,
  type Settings,
  type trustRecord,
} from "@/bridge/ipc";
import { setLanguage, useT } from "@/i18n";
import { MENUS } from "@/ui/commands";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { SettingsDialog } from "@/ui/settings/SettingsDialog";
import { Toasts } from "@/ui/Toasts";
import { useAppearance } from "@/ui/useAppearance";
import { useDocThemeInventory } from "@/ui/useDocThemeInventory";
import { useMenuTable } from "@/ui/useMenuTable";
import type { pluginAction } from "@/ui/usePlugins";
import { useToasts } from "@/ui/useToasts";
import { useUiStyles } from "@/ui/useUiStyles";
import { open, save } from "@/ui/file-picker";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";
import { ElementInspector } from "@/ui/element-inspector";
import { useSelectableUiText } from "@/ui/useSelectableUiText";

export function SettingsWindow() {
  const t = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toasts, toast, dismiss } = useToasts();
  useSelectableUiText(settings);
  const { themes, refresh: refreshThemes } = useDocThemeInventory();
  const {
    styles: uiStyles,
    openStylesDir,
    refreshStyles,
    importTheme,
    importTyporaTheme,
  } = useUiStyles(settings, toast, refreshThemes, false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const language = await api.appLang().catch(() => null);
        if (language) setLanguage(language.effective);
        const current = await api.settings.get();
        if (!alive) return;
        setSettings(current);
        document.documentElement.dataset.booted = "true";
        void api.frontendReady().catch((error) => {
          console.error("[nota] settings window frontend handshake failed", error);
        });
      } catch (error) {
        if (alive) setLoadError(String(error));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    void api
      .appLang()
      .then((language) => setLanguage(language.effective))
      .catch(() => {});
  }, [settings?.general.language]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await api.settings.set(next);
      } catch (error) {
        setSettings(previous);
        toast(t("Could not save the settings: {0}", String(error)), "error");
      }
    },
    [settings, toast],
  );

  useAppearance(settings, updateSettings);

  const menu = useMenuTable({
    allMenus: MENUS,
    recent: [],
    coverCover: settings?.keys?.overrides,
    exporter: settings?.export.custom_exporters ?? [],
  });

  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginTrust, setPluginTrust] = useState<trustRecord[]>([]);
  const [pluginUpdate, setPluginUpdate] = useState<PluginUpdateInfo[]>([]);
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmResolver = useRef<((answer: ConfirmAnswer) => void) | null>(null);
  const extensionsEnabled = settings?.general.extensions_enabled ?? true;
  const askConfirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<ConfirmAnswer>((resolve) => {
        confirmResolver.current = resolve;
        setConfirmRequest(request);
      }),
    [],
  );
  const answerConfirm = useCallback((answer: ConfirmAnswer) => {
    confirmResolver.current?.(answer);
    confirmResolver.current = null;
    setConfirmRequest(null);
  }, []);

  const refreshPlugins = useCallback(async () => {
    if (!extensionsEnabled) {
      setPlugins([]);
      setPluginTrust([]);
      setPluginUpdate([]);
      return;
    }
    const [installed, trusted, updates] = await Promise.all([
      api.plugin.list(),
      api.plugin.trustList(),
      api.plugin.updates(),
    ]);
    setPlugins(installed);
    setPluginTrust(trusted);
    setPluginUpdate(updates);
  }, [extensionsEnabled]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void on("nota:settings-package-imported", () => {
      refreshThemes();
      void refreshStyles();
      void refreshPlugins();
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, [refreshPlugins, refreshStyles, refreshThemes]);

  useEffect(() => {
    if (!settings) return;
    void refreshPlugins().catch((error) => {
      toast(t("Could not read extension status: {0}", String(error)), "error");
    });
  }, [settings?.general.extensions_enabled, refreshPlugins, toast]);

  const runPluginTask = useCallback(
    async (name: string, task: () => Promise<void>, success?: string) => {
      setPluginBusy(name);
      try {
        await task();
        await refreshPlugins();
        if (success) toast(success, "success");
      } catch (error) {
        toast(String(error), "error");
      } finally {
        setPluginBusy(null);
      }
    },
    [refreshPlugins, toast],
  );

  const pluginAction = useMemo<pluginAction>(
    () => ({
      install: () =>
        runPluginTask("install", async () => {
          const path = await open({
            title: t("Choose an extension package"),
            filters: [{ name: t("Nota extension"), extensions: ["nota-plugin", "zip"] }],
          });
          if (path) await api.plugin.install(path);
        }),
      export: (id) =>
        runPluginTask(id, async () => {
          const name = await api.plugin.exportName(id);
          const path = await save({
            title: t("Export extension"),
            defaultPath: name,
            filters: [{ name: t("Nota extension"), extensions: ["nota-plugin"] }],
          });
          if (path) await api.plugin.export(id, path);
        }),
      unload: (id) =>
        runPluginTask(id, async () => {
          const answer = await askConfirm({
            title: t("Uninstall This Extension?"),
            message: t("Delete this extension from disk?"),
            confirmLabel: t("Uninstall"),
            danger: true,
          });
          if (answer !== "confirm") return;
          await api.plugin.uninstall(id);
        }),
      openDirectory2: async () => {
        try {
          await api.plugin.openDir();
        } catch (error) {
          toast(String(error), "error");
        }
      },
      toggle: (id, enabled) =>
        runPluginTask(id, async () => {
          await api.plugin.setEnabled(id, enabled);
        }),
      messageTask: (id, keyId) =>
        runPluginTask(id, async () => {
          const fingerprint =
            keyId ?? plugins.find((plugin) => plugin.id === id)?.key_id ?? t("(unknown)");
          const message = t(
            "Trust the signer with fingerprint {0}?",
            fingerprint,
          );
          if ((await askConfirm({ title: t("Trust signer"), message })) !== "confirm") return;
          await api.plugin.trust(id);
        }),
      settings: (id, key, value) =>
        runPluginTask(`${id}:${key}`, async () => {
          await api.plugin.setSetting(id, key, value);
        }),
      command: async (id, command, args) => {
        let succeeded = false;
        await runPluginTask(`${id}:${command}`, async () => {
          const result = await api.plugin.call(id, command, args);
          if (
            result &&
            typeof result === "object" &&
            "ok" in result &&
            (result as { ok?: unknown }).ok === false
          ) {
            const detail = (result as { error?: unknown }).error;
            throw new Error(
              typeof detail === "string" ? detail : t("The extension command failed."),
            );
          }
          succeeded = true;
        });
        return succeeded;
      },
      checkForUpdates: () =>
        runPluginTask("check for updates", async () => {
          setPluginUpdate(await api.plugin.updates());
        }),
      update: (id) =>
        runPluginTask(id, async () => {
          await api.plugin.update(id);
        }),
      updateAll: () =>
        runPluginTask("update all", async () => {
          for (const update of pluginUpdate.filter((item) => item.available)) {
            await api.plugin.update(update.id);
          }
        }),
      busy: pluginBusy,
    }),
    [askConfirm, pluginBusy, plugins, pluginUpdate, runPluginTask, toast],
  );

  if (loadError) {
    return (
      <ErrorBoundary>
        <div className="settings-window-error">
          <p>{t("Could not open Preferences.")}</p>
          <code>{loadError}</code>
        </div>
      </ErrorBoundary>
    );
  }

  if (!settings) return null;

  return (
    <ErrorBoundary>
      <SettingsDialog
        standalone
        settings={settings}
        onChange={(patch) => void updateSettings(patch)}
        onClose={() => void api.window.hideSettings()}
        docThemes={themes}
        onOpenThemesDir={() => void api.theme.openDir()}
        onRefreshThemes={refreshThemes}
        uiStyles={uiStyles}
        onOpenStylesDir={() => void openStylesDir()}
        onRefreshUiStyles={() => void refreshStyles()}
        onImportTheme={() => void importTheme()}
        onImportTyporaTheme={() => void importTyporaTheme()}
        onOpenConfigDir={() => void api.settings.openDir()}
        onResetSettings={() =>
          void api.settings
            .reset()
            .then(setSettings)
            .catch((error) => toast(String(error), "error"))
        }
        onClearRecent={() =>
          void api.session
            .clear()
            .catch((error) => toast(String(error), "error"))
        }
        onRestoreDrafts={() =>
          void (async () => {
            try {
              const drafts = await api.draft.list();
              if (drafts.length === 0) {
                toast(t("No unsaved drafts were found."), "info");
                return;
              }
              const answer = await askConfirm({
                title: t("Restore drafts"),
                message: t("Restore {0} unsaved draft(s)?", drafts.length),
                confirmLabel: t("Restore"),
              });
              if (answer !== "confirm") return;
              for (const draft of drafts) await api.draft.restore(draft.id);
              toast(t("Restored {0} draft(s).", drafts.length), "success");
            } catch (error) {
              toast(String(error), "error");
            }
          })()
        }
        menus={menu}
        plugins={plugins}
        pluginTrust={pluginTrust}
        pluginUpdate={pluginUpdate}
        pluginAction={pluginAction}
        debugMode={settings.general.debug_mode}
        initialSection="appearance"
      />
      <Toasts
        items={toasts}
        onDismiss={dismiss}
        position={settings.updates.notification_position}
        tabbarVisible={false}
        statusbarVisible={false}
      />
      {confirmRequest && (
        <ConfirmDialog
          {...confirmRequest}
          onAnswer={answerConfirm}
        />
      )}
      <ElementInspector
        enabled={
          (settings.general.debug_mode ?? false) &&
          (settings.general.element_inspector ?? false)
        }
      />
    </ErrorBoundary>
  );
}
