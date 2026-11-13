import { useEffect, useMemo, useState } from "react";

import { api } from "@/bridge/ipc";
import type { DevBridgeStatus, GeneralSettings } from "@/bridge/types";
import { useT } from "@/i18n";
import { ActionButton } from "@/ui/settings/primitives";

function randomIndex(length: number, avoid = -1) {
  const values = new Uint32Array(1);
  let index = avoid;
  while (index === avoid) {
    crypto.getRandomValues(values);
    index = (values[0] ?? 0) % length;
  }
  return index;
}

function shuffledButtons() {
  const values = [1, 2, 3, 4, 5];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [values[index], values[swap]] = [values[swap]!, values[index]!];
  }
  return values;
}

export interface DeveloperBridgeDialogProps {
  general: GeneralSettings;
  passwordSet: boolean;
  onChange: (general: GeneralSettings) => void;
  onClose: () => void;
}

export function DeveloperBridgeDialog({
  general,
  passwordSet,
  onChange,
  onClose,
}: DeveloperBridgeDialogProps) {
  const t = useT();
  const warnings = [
    t("Connected clients can read and modify every open document."),
    t("Connected clients can load themes and reload Lua extensions."),
    t("Connected clients can run editor commands and inspect diagnostics."),
    t("The IP whitelist is not authentication; the debug password is still required."),
    t("I will connect only trusted Nota DevKit clients."),
  ];
  const [phase, setPhase] = useState<"warning" | "credentials">("warning");
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(() => randomIndex(5));
  const [buttons, setButtons] = useState(shuffledButtons);
  const [password, setPassword] = useState("");
  const [port, setPort] = useState(String(general.dev_bridge_port));
  const [whitelist, setWhitelist] = useState(
    (general.dev_bridge_whitelist.length
      ? general.dev_bridge_whitelist
      : ["127.0.0.1", "::1"]
    ).join("\n"),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const status = useMemo(() => ({ configured: passwordSet }), [passwordSet]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (phase !== "warning" || !/^[1-5]$/.test(event.key)) return;
      event.preventDefault();
      choose(Number(event.key));
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const choose = (number: number) => {
    if (number !== target + 1) {
      onClose();
      return;
    }
    if (step === warnings.length - 1) {
      setPhase("credentials");
      return;
    }
    const next = step + 1;
    setStep(next);
    setTarget(randomIndex(5, target));
    setButtons(shuffledButtons());
  };

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const numericPort = Number(port);
      if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
        throw new Error(t("Port must be an integer between 1 and 65535"));
      }
      const addresses = whitelist
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (addresses.length === 0) {
        throw new Error(t("The IP whitelist cannot be empty"));
      }
      const result = await api.devBridge.enable(
        password || null,
        numericPort,
        addresses,
      );
      if (!result.running) throw new Error(t("Developer bridge did not start"));
      onChange({
        ...general,
        dev_bridge_enabled: true,
        dev_bridge_port: result.port,
        dev_bridge_whitelist: result.whitelist,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dev-bridge-backdrop" role="dialog" aria-modal="true">
      <section className="dev-bridge-dialog">
        <header>
          <div>
            <span className="dev-bridge-kicker">{t("Developer Bridge")}</span>
            <h2>
              {phase === "warning"
                ? t("Security acknowledgement {0} of 5", String(step + 1))
                : t("Configure developer access")}
            </h2>
          </div>
          <button className="dev-bridge-close" onClick={onClose} aria-label={t("Close")}>
            ×
          </button>
        </header>

        {phase === "warning" ? (
          <>
            <p className="dev-bridge-warning">{warnings[step]}</p>
            <div className="dev-bridge-pad" aria-label={t("Confirmation keypad")}>
              {buttons.map((number) => (
                <button
                  key={number}
                  className="dev-bridge-key"
                  onClick={() => choose(number)}
                >
                  {number}
                </button>
              ))}
            </div>
            <p className="dev-bridge-instruction">
              {t("Press {0} to continue. Any other number cancels.", String(target + 1))}
            </p>
            <div className="dev-bridge-progress" aria-hidden="true">
              {warnings.map((_, index) => (
                <span key={index} className={index <= step ? "is-on" : ""} />
              ))}
            </div>
          </>
        ) : (
          <div className="dev-bridge-form">
            <label>
              <span>{t("Debug password")}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={status.configured ? t("Leave empty to keep the current password") : t("At least 8 characters")}
                autoFocus
              />
            </label>
            <label>
              <span>{t("Port")}</span>
              <input
                inputMode="numeric"
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </label>
            <label>
              <span>{t("Allowed IP addresses or CIDR ranges")}</span>
              <textarea
                rows={5}
                value={whitelist}
                onChange={(event) => setWhitelist(event.target.value)}
              />
            </label>
            <p className="dev-bridge-note">
              {t("Localhost is the default. Adding another address exposes the bridge to the local network; the password remains mandatory.")}
            </p>
            {error ? <p className="dev-bridge-error">{error}</p> : null}
            <footer>
              <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
              <ActionButton onClick={() => void enable()}>
                {busy ? t("Starting…") : t("Enable developer bridge")}
              </ActionButton>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}

export function DeveloperBridgeStatusRow({
  status,
  onEnable,
  onDisable,
  onRevoke,
}: {
  status: DevBridgeStatus | null;
  onEnable: () => void;
  onDisable: () => void;
  onRevoke: () => void;
}) {
  const t = useT();
  return (
    <div className="dev-bridge-status">
      <strong>{status?.running ? t("Developer bridge is running") : t("Developer bridge is off")}</strong>
      <span>
        {status?.running
          ? t("Port {0} · {1} active session(s)", String(status.port), String(status.sessions))
          : t("No local developer API is listening.")}
      </span>
      <div>
        <ActionButton onClick={status?.running ? onDisable : onEnable}>
          {status?.running ? t("Disable") : t("Enable…")}
        </ActionButton>
        {status?.running ? (
          <ActionButton onClick={onRevoke}>{t("Disconnect all")}</ActionButton>
        ) : null}
      </div>
    </div>
  );
}
