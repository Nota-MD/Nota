import React from "react";
import ReactDOM from "react-dom/client";

import { installErrorHooks } from "@/ui/ErrorBoundary";
import { SettingsWindow } from "@/ui/SettingsWindow";

import "./styles/theme.css";
import "./styles/theme/adwaita-fonts.css";
import "./styles/app.css";
import "./styles/toast.css";
import "./styles/overlay.css";
import "./styles/element-inspector.css";
import "./styles/file-picker.css";
import "./styles/update-debug.css";
import "./styles/panel.css";
import "./styles/plugin-list.css";
import "./styles/settings.css";
import "./styles/settings-controls.css";
import "./styles/settings-widgets.css";
import "./styles/settings-export.css";
import "./styles/developer-bridge.css";
import "./styles/color-picker.css";
import "./styles/icons.css";

installErrorHooks();

const root = document.getElementById("root");
if (!root) throw new Error("No #root mount point; was settings.html broken?");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SettingsWindow />
  </React.StrictMode>,
);
