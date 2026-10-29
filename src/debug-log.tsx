import React from "react";
import ReactDOM from "react-dom/client";

import { DebugLogWindow } from "@/ui/DebugLogWindow";

import "@/styles/debug-log.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root mount point; was debug-log.html broken?");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DebugLogWindow />
  </React.StrictMode>,
);
