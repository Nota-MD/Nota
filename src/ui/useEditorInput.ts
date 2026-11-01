import { useCallback, useEffect, useRef, useState } from "react";

import { api, on, type PluginInfo } from "@/bridge/ipc";
import type { VimInputConfig } from "@/editor/plugin-vim-types";

/**
 * Pull the keyboard adapter published by a loaded `editor.input` extension.
 *
 * Profile data is state, not a transient event: the hook pulls once whenever
 * the plugin inventory changes. The plugin-specific event only asks for
 * another pull after its panel writes a setting.
 */
export function useEditorInput(plugins: PluginInfo[]): VimInputConfig | null {
  const [config, setConfig] = useState<VimInputConfig | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pull = useCallback(async (list: PluginInfo[]) => {
    const owners = list
      .filter(
        (plugin) =>
          plugin.state === "loaded" &&
          plugin.capabilities.includes("editor.input"),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    const found = await Promise.all(
      owners.map(async (plugin) => {
        try {
          const value = await api.plugin.call(plugin.id, "editor_input_profile");
          if (!value || typeof value !== "object") return null;
          const next = value as Omit<VimInputConfig, "plugin">;
          if (next.kind !== "vim" || next.enabled !== true) return null;
          return { ...next, plugin: plugin.id };
        } catch {
          return null;
        }
      }),
    );
    if (mounted.current) {
      setConfig(
        found.find((item): item is VimInputConfig => item !== null) ?? null,
      );
    }
  }, []);

  useEffect(() => {
    void pull(plugins);
  }, [plugins, pull]);

  useEffect(() => {
    let alive = true;
    const unlisteners: Array<() => void> = [];
    const owners = plugins.filter(
      (plugin) =>
        plugin.state === "loaded" &&
        plugin.capabilities.includes("editor.input"),
    );
    for (const plugin of owners) {
      const channel = `plugin:${plugin.id.replace(/\./g, "-")}:editor-input-profile`;
      void on<unknown>(channel, () => void pull(plugins)).then((unlisten) => {
        if (alive) unlisteners.push(unlisten);
        else unlisten();
      });
    }
    return () => {
      alive = false;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [plugins, pull]);

  return config;
}
