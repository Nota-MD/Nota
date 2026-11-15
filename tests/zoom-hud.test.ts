import { readFileSync } from "node:fs";

import {
  currentZoomHud,
  dismissZoomHud,
  showZoomHud,
  subscribeZoomHud,
} from "../src/ui/zoom-hud-state";

let notifications = 0;
const unsubscribe = subscribeZoomHud(() => {
  notifications += 1;
});

let plus = 0;
let minus = 0;
let reset = 0;
showZoomHud(
  "125%",
  () => {
    plus += 1;
  },
  () => {
    minus += 1;
  },
  () => {
    reset += 1;
  },
);
const shown = currentZoomHud();
if (!shown || shown.label !== "125%" || notifications !== 1) {
  throw new Error("zoom HUD was not published");
}
shown.onPlus();
shown.onMinus();
shown.onReset();
if (plus !== 1 || minus !== 1 || reset !== 1) {
  throw new Error("zoom HUD actions are not wired");
}
dismissZoomHud(shown.serial - 1);
if (!currentZoomHud()) throw new Error("stale HUD dismissal removed the current HUD");
dismissZoomHud(shown.serial);
if (currentZoomHud()) throw new Error("current HUD was not dismissed");
unsubscribe();

const component = readFileSync("src/ui/ZoomHud.tsx", "utf8");
const css = readFileSync("src/styles/zoom-hud.css", "utf8");
if (!component.includes("hud.onPlus") || !component.includes("hud.onMinus")) {
  throw new Error("zoom HUD lost a plus or minus control");
}
if (!css.includes("right: 16px;")) throw new Error("zoom HUD is not in the top-right corner");

console.log("Zoom HUD: 8 checks passed");
