import { useCallback, useEffect, useState } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { distribution } from "@/distribution";
import { setLanguage, useT } from "@/i18n";
import { AboutDialog } from "@/ui/AboutDialog";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { FirstRunGuide } from "@/ui/FirstRunGuide";
import { useAppearance } from "@/ui/useAppearance";
import { useDocThemeInventory } from "@/ui/useDocThemeInventory";
import { useUiStyles } from "@/ui/useUiStyles";

export function AboutWindow() {
  const t = useT();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshThemes } = useDocThemeInventory();
  useUiStyles(settings, () => {}, refreshThemes, false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const language = await api.appLang().catch(() => null);
        if (language) setLanguage(language.effective);
        const current = await api.settings.get();
        if (alive) setSettings(current);
      } catch (reason) {
        if (alive) setError(String(reason));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const saved = await api.settings.patch(patch);
    setSettings(saved);
  }, [settings]);

  useAppearance(settings, updateSettings);

  if (error) {
    return (
      <div className="settings-window-error">
        <p>{t("Could not open About {0}.", distribution.identity.productName)}</p>
        <code>{error}</code>
      </div>
    );
  }
  if (!settings) return null;

  return (
    <ErrorBoundary>
      {guideOpen ? (
        <FirstRunGuide presentation="full" onDone={() => setGuideOpen(false)} />
      ) : (
        <AboutDialog
          presentation="full"
          standalone
          onClose={() => void api.window.hideAbout()}
          onOpenGuide={() => setGuideOpen(true)}
          debugMode={settings.general.debug_mode}
          onSetDebugMode={(debug_mode) =>
            void updateSettings({ general: { ...settings.general, debug_mode } })
          }
        />
      )}
    </ErrorBoundary>
  );
}
