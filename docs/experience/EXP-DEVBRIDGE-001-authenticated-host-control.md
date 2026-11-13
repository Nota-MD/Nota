---
id: EXP-DEVBRIDGE-001
area: developer-bridge
status: adopted
related:
  - src-tauri/src/dev_bridge.rs
  - src-tauri/src/commands/dev_bridge.rs
  - src/ui/DeveloperBridgeDialog.tsx
---

# Authenticated Host Control

## Symptom

A development endpoint can become indistinguishable from a remote shell. A
single toggle, a fixed confirmation button, or a loopback assumption is not
enough once the endpoint can invoke editor commands and modify documents.

## Root cause

Developer tools often optimize for first-use speed and defer the trust decision.
That makes privileged access easy to grant accidentally. It also hides whether a
client is on the local machine or a local network.

## Decision

Nota exposes Host Control only when all of these are true:

1. Developer mode is enabled.
2. The bridge setting is enabled.
3. The client IP matches the whitelist.
4. The client supplies the debug password.
5. The client uses a live bearer session.

Enabling requires five randomized warning steps. The required button number and
button positions change each step. A wrong number cancels the flow.

The password is stored as an Argon2 hash in a private config file. Sessions are
memory-only, expire after twelve hours, bind to the authenticating IP, and can
be revoked together.

The legacy public `--mcp` entry and socket transport were removed. Internal
document helpers remain because they already provide tested access to live
documents, but only the authenticated bridge calls them.

## Evidence

- `cargo test --lib dev_bridge` covers CIDR matching and password hashing.
- DevKit tests cover authenticated protocol calls and dynamic preview rendering.
- Settings changes stop the listener when developer mode is disabled.
- POST requests require JSON content type and a Host header matching the peer.
