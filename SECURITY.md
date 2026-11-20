# Security policy

## Reporting a vulnerability

Do not disclose exploitable details in a public issue. Prefer GitHub private
vulnerability reporting or a security advisory. If that is unavailable, contact
the repository owner and provide only the minimum necessary information.

Include:

- affected version or commit;
- platform and installation method;
- reproduction steps and impact;
- whether the issue involves plugin sandbox escapes, path traversal, command
  execution, credential disclosure or supply-chain risk;
- mitigations already attempted.

## Supported scope

The latest release line and the `main` branch are maintained. Reports involving
preview builds, third-party plugins or user-modified themes and fonts are also
welcome, but responsibility and licensing are evaluated by source.

## Plugin boundary

Lua plugins may only use capabilities declared in their manifest and supplied by
the host. Reports involving capability bypass, unauthorized path access, external
process execution or API key disclosure receive high priority.
