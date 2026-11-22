import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STREAM_BASE_CPMS,
  STREAM_MAX_DELAY_MS,
  nextStreamRelease,
} from "../src/ui/smooth-stream";

let pass = 0;
let fail = 0;

function ok(value: boolean, label: string): void {
  if (value) pass++;
  else {
    fail++;
    console.log(`  FAIL ${label}`);
  }
}

{
  const first = nextStreamRelease(0, 100, 16);
  ok(first.count >= 1, "first animation frame releases at least one code point");
  ok(first.count <= Math.ceil((STREAM_BASE_CPMS * 16) / 1000) + 1, "baseline frame stays near 54 cp/s");

  const large = nextStreamRelease(0, 200, 16);
  ok(large.count > first.count, "a larger backlog accelerates toward the deadline");
}

{
  let count = 0;
  let carry = 0;
  for (let elapsed = 0; elapsed < STREAM_MAX_DELAY_MS; elapsed += 16) {
    const released = nextStreamRelease(count, 1400, 16, carry, elapsed);
    count = released.count;
    carry = released.carry;
  }
  ok(count === 1400, "maximum visual delay is enforced for a 1400-code-point backlog");
}

{
  const reset = nextStreamRelease(90, 12, 16, 0.7);
  ok(reset.count === 12 && reset.carry === 0, "a shorter replacement snapshot resets safely");

  const stalled = nextStreamRelease(12, 12, 16, 0.7);
  ok(stalled.count === 12 && stalled.carry === 0, "a caught-up stream never moves backward");

  const bounded = nextStreamRelease(0, 1000, 10_000, 0);
  ok(bounded.count > 0 && bounded.count < 1000, "a long hidden-frame gap is clamped");

  const invalid = nextStreamRelease(-4, -9, -20, -1);
  ok(invalid.count === 0 && invalid.carry === 0, "invalid inputs stay bounded");
}

{
  const panel = readFileSync(join("src", "ui", "PanelBody.tsx"), "utf8");
  ok(panel.includes("requestAnimationFrame(tick)"), "PanelBody runs the release loop through rAF");
  ok(panel.includes("prefers-reduced-motion: reduce"), "PanelBody honours reduced motion");
  ok(panel.includes("scroll.scrollTop = scroll.scrollHeight"), "PanelBody follows the latest text");
  ok(panel.includes("panel-stream-follow"), "PanelBody exposes a resume-following control");
  ok(
    !panel.includes("    update();\n    scroll.addEventListener"),
    "a new stream starts in follow mode instead of inheriting the old scroll position",
  );
  ok(!panel.includes("nota.ai"), "the smooth renderer has no AI extension special case");
  ok(!panel.includes('node.from === "ai" &&'), "smooth rendering does not gate on the sender role");

  const dockCss = readFileSync(join("src", "styles", "dock.css"), "utf8");
  ok(dockCss.includes("scrollbar-gutter: stable"), "the dock reserves its scrollbar gutter");

  const panelCss = readFileSync(join("src", "styles", "panel.css"), "utf8");
  ok(panelCss.includes("@keyframes panel-stream-pulse"), "the stream cursor has a restrained pulse");
  ok(panelCss.includes("@media (prefers-reduced-motion: reduce)"), "the cursor pulse has a reduced-motion fallback");
}

console.log(`Smooth stream UI: ${pass} checks passed, ${fail} failed`);
if (fail > 0) process.exit(1);
