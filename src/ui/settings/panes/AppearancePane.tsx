import type { AppearanceSettings, BuiltinUiStyle, UiStyleInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { accentVars, parseAccent } from "@/styles/accent";
import { resolveStyle } from "@/styles/applyTheme";
import { useUiMode } from "@/ui/useUiMode";
import { recommendedEditorFontSize } from "@/ui/useZoom";
import { ColorPicker } from "../ColorPicker";
import { ActionButton, NumberInput, Radio, Range, Select, SettingRow, SettingsGroup, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";


const STYLE_ORDER: BuiltinUiStyle[] = [
  "adwaita",
];


function useResolvedAppearance(settings: PaneProps["settings"]) {
  const mode = useUiMode(settings.ui_mode);
  return { style: resolveStyle(settings.ui_style), mode };
}


function ModeSwatch({
  mode,
  label,
  style,
  accent,
  active,
  onPick,
}: {
  mode: "light" | "dark";
  label: string;
  style: string;

  accent: string;
  active: boolean;
  onPick: () => void;
}) {


  const strongConfigure = accentVars(accent);
  return (
    <button
      type="button"
      className="stg-swatch"
      data-active={active}
      aria-pressed={active}
      aria-label={label}
      onClick={onPick}
    >
      <span className="stg-swatch-page" data-ui-style={style} data-ui-mode={mode} style={strongConfigure ?? undefined}>
        <span className="stg-swatch-ink">Aa</span>
        <span className="stg-swatch-rule" />
      </span>
      <span className="stg-swatch-name">{label}</span>
    </button>
  );
}


function effectiveAccent(a: AppearanceSettings): string {
  const setDone = parseAccent(a.accent);
  if (setDone) return setDone;
  const readToOf = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  return parseAccent(readToOf) ?? "";
}

export function AppearancePane({
  settings,
  onChange,
  uiStyles,
  onOpenStylesDir,
  onRefreshUiStyles,
  onImportTheme,


  docThemes,
  onOpenThemesDir,
}: PaneProps) {


  const t = useT();


  const STYLES: Record<BuiltinUiStyle, { label: string; hint: string }> = {
    adwaita: { label: "Adwaita", hint: t("GNOME native — flat, depth from shadows") },
  };

  const write = paneWriter(settings, onChange, "appearance");
  const { style, mode: currentMode } = useResolvedAppearance(settings);
  const auto = settings.ui_mode === "auto";
  const a = settings.appearance;


  const recognizeNotOutput = a.accent !== "" && parseAccent(a.accent) === null;


  const levelName = (s: UiStyleInfo) => {
    const insidePlace = STYLES[s.id as BuiltinUiStyle];
    if (!insidePlace) return s.id;
    return s.builtin ? insidePlace.label : `${insidePlace.label} / ${t("overridden")}`;
  };


  const clearSingle: { value: string; label: string }[] =
    uiStyles.length > 0
      ? uiStyles.map((s) => ({ value: s.id, label: levelName(s) }))
      : STYLE_ORDER.map((v) => ({ value: v, label: STYLES[v].label }));


  const option = [...clearSingle];
  if (uiStyles.length > 0 && !option.some((o) => o.value === settings.ui_style)) {
    option.push({ value: settings.ui_style, label: t("(“{0}” not found)", settings.ui_style) });
  }

  const current = STYLES[settings.ui_style as BuiltinUiStyle];
  const shownFontSize = a.custom_font_size
    ? settings.ui_font_size
    : recommendedEditorFontSize;

  return (
    <>
      <SettingsGroup
        title={t("Interface style")}
        help={


          current
            ? t("Current {0}: {1}. The appearance of the whole interface follows.", current.label, current.hint)
            : t("Currently using “{0}”, the style you imported. The whole interface follows it.", settings.ui_style)
        }
      >







        <SettingRow label={t("Current interface style")}>
          <Select value={settings.ui_style} options={option} onChange={(ui_style) => onChange({ ui_style })} />
        </SettingRow>
        <SettingRow label={t("Interface theme sources")}>
          <div className="stg-inline stg-theme-actions">
            <ActionButton onClick={onOpenStylesDir} title={t("Open the interface themes folder. Drop a theme package in it to add a style.")}>
              {t("Interface themes folder…")}
            </ActionButton>
            <ActionButton onClick={onRefreshUiStyles}>{t("Refresh")}</ActionButton>
            <ActionButton onClick={onImportTheme}>{t("Import ZIP or CSS…")}</ActionButton>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Light/Dark")}>
        <SettingRow>
          <div className="stg-swatches">
            <ModeSwatch
              mode="light"
              label={t("Light")}
              style={style}
              accent={a.accent}
              active={!auto && settings.ui_mode === "light"}
              onPick={() => onChange({ ui_mode: "light" })}
            />
            <ModeSwatch
              mode="dark"
              label={t("Dark")}
              style={style}
              accent={a.accent}
              active={!auto && settings.ui_mode === "dark"}
              onPick={() => onChange({ ui_mode: "dark" })}
            />
          </div>
        </SettingRow>
      </SettingsGroup>







      <SettingsGroup title={t("Accent color")}>
        <SettingRow>
          <div className="stg-inline">
            <ColorPicker
              value={effectiveAccent(a) || "#000000"}
              onChange={(accent) => write({ accent })}
            />
            <ActionButton
              onClick={() => write({ accent: "" })}
              disabled={a.accent === ""}
              title={t("Go back to the accent that the current style ships with.")}
            >
              {t("Follow the style")}
            </ActionButton>





            {recognizeNotOutput && (
              <span className="stg-warn">{t("(Unrecognized: {0} — falling back to following the style)", a.accent)}</span>
            )}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Follow the system preference")}>
        <SettingRow>





          <Toggle checked={auto} onChange={(on) => onChange({ ui_mode: on ? "auto" : currentMode })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Font size")}
        help={t(
          "Automatic uses the recommended editor size of {0}px. Dragging the slider switches to Custom.",
          recommendedEditorFontSize,
        )}
      >
        <SettingRow>
          <Radio
            value={a.custom_font_size ? "custom" : "auto"}
            options={[
              { value: "auto", label: t("Automatic (Recommended)") },
              { value: "custom", label: t("Custom") },
            ]}
            onChange={(v) => write({ custom_font_size: v === "custom" })}
          />
        </SettingRow>

        <SettingRow label={t("Editor font size")}>
          <Range
            value={shownFontSize}
            min={12}
            max={32}
            suffix="px"
            onChange={(ui_font_size) =>
              onChange({
                ui_font_size,
                appearance: { ...a, custom_font_size: true },
              })
            }
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Zoom")}>
        <SettingRow>
          <NumberInput
            value={a.zoom}
            min={50}
            max={300}
            step={10}
            suffix="%"
            onChange={(zoom) => write({ zoom })}
          />
        </SettingRow>

        <SettingRow label={t("Use the scroll wheel while holding Ctrl")}>
          <Toggle
            checked={a.ctrl_wheel_zoom}
            onChange={(ctrl_wheel_zoom) => write({ ctrl_wheel_zoom })}
          />
        </SettingRow>

        <SettingRow label={t("What the wheel changes")}>
          <Radio
            value={a.ctrl_wheel_target}
            options={[
              { value: "font_size", label: t("Editor font size") },
              { value: "zoom", label: t("Whole interface zoom") },
            ]}
            onChange={(ctrl_wheel_target) => write({ ctrl_wheel_target })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Show menu bar")}>
        <SettingRow>
          <Toggle
            checked={a.show_menu_bar}
            onChange={(show_menu_bar) => write({ show_menu_bar })}
          />
        </SettingRow>
        <SettingRow
          label={t("Menu bar rendering")}
          description={t(
            "Use Nota's built-in menu on every platform, or the native system menu. On macOS, the system menu appears at the top of the screen.",
          )}
        >
          <Select
            value={a.menu_renderer}
            options={[
              { value: "nota", label: t("Nota (self-drawn)") },
              { value: "system", label: t("System native") },
            ]}
            onChange={(menu_renderer) => write({ menu_renderer })}
          />
        </SettingRow>
        <SettingRow
          label={t("Force Nota menu when maximized or full screen")}
          description={t(
            "Keep the menu reachable when a window manager or macOS full-screen mode hides the system menu. The saved menu style returns after leaving maximized or full-screen mode.",
          )}
        >
          <Toggle
            checked={a.force_nota_menu_when_expanded}
            onChange={(force_nota_menu_when_expanded) =>
              write({ force_nota_menu_when_expanded })
            }
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Show status bar")}>
        <SettingRow>
          <Toggle
            checked={a.show_status_bar}
            onChange={(show_status_bar) => write({ show_status_bar })}
          />
        </SettingRow>
      </SettingsGroup>







      <SettingsGroup title={t("Window")}>
        <SettingRow label={t("Show the file name in the title bar")}>
          <Toggle
            checked={a.show_filename_in_titlebar}
            onChange={(show_filename_in_titlebar) => write({ show_filename_in_titlebar })}
          />
        </SettingRow>
        <SettingRow
          label={t("Focus the target window after moving a tab")}
          help={t(
            "When a tab is moved to another Nota window, bring that window to the front after the document opens.",
          )}
        >
          <Toggle
            checked={a.focus_after_window_transfer}
            onChange={(focus_after_window_transfer) => write({ focus_after_window_transfer })}
          />
        </SettingRow>
        <SettingRow
          label={t("Preferences presentation")}
          help={t(
            "Full fills the current window, Embedded keeps the centered card, and Separate window opens native Preferences window. Changes take effect the next time Preferences opens.",
          )}
        >
          <Radio
            value={a.settings_window_style}
            options={[
              { value: "full", label: t("Full window") },
              { value: "embedded", label: t("Embedded card") },
              { value: "external", label: t("Separate window") },
            ]}
            onChange={(settings_window_style) => write({ settings_window_style })}
          />
        </SettingRow>
      </SettingsGroup>







      <SettingsGroup title={t("Focus Mode")}>
        <SettingRow label={t("Dimming strength")}>
          <Radio
            value={a.focus_mode_dim}
            options={[
              { value: "standard", label: t("Standard") },
              { value: "strong", label: t("Strong") },
              { value: "stronger", label: t("Stronger") },
            ]}
            onChange={(focus_mode_dim) => write({ focus_mode_dim })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Word count")}>
        <SettingRow label={t("Reading speed")}>
          <NumberInput
            value={a.reading_speed}
            min={100}
            max={1000}
            step={1}
            onChange={(reading_speed) => write({ reading_speed })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Formatting Toolbar")}>
        <SettingRow>





          <Radio
            value={a.toolbar}
            options={[
              { value: "always", label: t("Always Show") },
              { value: "hover", label: t("Show on Hover") },
              { value: "never", label: t("Never Show") },
            ]}
            onChange={(toolbar) => write({ toolbar })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Dark mode")}>
        <SettingRow label={t("Use a separate set of document themes")}>
          <Toggle
            checked={a.dark_theme_separate}
            onChange={(dark_theme_separate) => write({ dark_theme_separate })}
          />
        </SettingRow>

        <SettingRow label={t("Which set to use in dark mode")}>
          <div className="stg-inline">
            <Select
              value={a.dark_document_theme}
              options={[
                { value: "", label: t("Follow the light theme") },

                ...docThemes.map((theme) => ({ value: theme.id, label: theme.name })),
              ]}
              disabled={!a.dark_theme_separate}
              onChange={(dark_document_theme) => write({ dark_document_theme })}
            />
            <ActionButton onClick={onOpenThemesDir} title={t("Open the document themes folder. Put a theme package in it and it becomes selectable.")}>
              {t("Document themes folder…")}
            </ActionButton>
          </div>
        </SettingRow>







      </SettingsGroup>
    </>
  );
}
