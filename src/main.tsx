import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { api } from "./bridge/ipc";
import { t, setLanguage } from "./i18n";
import { installErrorHooks } from "./ui/ErrorBoundary";
import { FocusAlarmWindow } from "./ui/FocusAlarmWindow";
import { ZoomHud } from "./ui/ZoomHud";
import adwaitaFontLicense from "./assets/fonts/adwaita/LICENSE.txt?url";

import "./styles/theme.css";
import "./styles/theme/adwaita-fonts.css";






import "./styles/app.css";

import "./styles/menubar.css";
import "./styles/command-palette.css";

import "./styles/tabs-status.css";
import "./styles/table-toolbar.css";

import "./styles/toast.css";
import "./styles/zoom-hud.css";




import "./styles/overlay.css";
import "./styles/dialog-close.css";
import "./styles/window-id.css";
import "./styles/element-inspector.css";
import "./styles/file-picker.css";
import "./styles/update-debug.css";


import "./styles/sidebar.css";








import "./styles/dock.css";


import "./styles/panel.css";

import "./styles/panel-data.css";


import "./styles/plugin-list.css";



import "./styles/gate.css";
import "./styles/settings.css";
import "./styles/settings-controls.css";
import "./styles/settings-widgets.css";
import "./styles/settings-export.css";
import "./styles/developer-bridge.css";
import "./styles/color-picker.css";







import "./styles/editor.css";
import "./styles/github-alert.css";

import "./styles/editor-inline.css";

import "./styles/editor-blocks.css";





import "./styles/code-block.css";






import "./styles/marks.css";



import "./styles/diagram.css";





import "./styles/math.css";




import "./styles/video.css";





import "./styles/diff.css";
import "./styles/review.css";


import "./styles/share.css";


import "./styles/heatmap.css";


import "./styles/bars.css";
// Vim input adapter: block cursor, disabled native caret, and the mode chip.
import "./styles/vim.css";






import "./styles/icons.css";

//

//





//


import "./styles/focus.css";


//



//


import "katex/dist/katex.min.css";




import "@milkdown/kit/prose/tables/style/tables.css";



installErrorHooks();

// Keep the licence next to the bundled Adwaita font assets without listing font
// acknowledgements in the user-facing About window.
const fontLicenseLink = document.createElement("link");
fontLicenseLink.rel = "license";
fontLicenseLink.href = adwaitaFontLicense;
document.head.appendChild(fontLicenseLink);

const root = document.getElementById("root");
if (!root) {

  throw new Error(t("No #root mount point; was index.html broken?"));
}


window.setTimeout(() => {
  document.documentElement.dataset.booted = "true";
}, 8000);

























const windowEntry = document.documentElement.dataset.window;
const isWarnReportWindow = windowEntry === "focus-alarm" || location.hash === "#focus-alarm";




















if (isWarnReportWindow) {
  document.documentElement.dataset.booted = "true";
  api.appLang()
    .then((language) => setLanguage(language.effective))
    .catch(() => {});
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {isWarnReportWindow ? (
      <FocusAlarmWindow />
    ) : (
      <>
        <App />
        <ZoomHud />
      </>
    )}
  </React.StrictMode>,
);
