# Development and verification

## Baseline and scope

Documentation baseline: version **2026.10.22.1**, commit `b12d6cb2d9aae46542c55b4da12f605ee8009b34`, reviewed **2026-10-22**. Source filenames below are stable lookup guidance without private repository links. Public package synchronization can carry a later calendar version; compare source behavior and host capabilities, not dates alone.

The current implementation covers Telegram text messages only. Discord, attachments, streaming, durable user-level denial, manual replay and alternate transports are not delivered features. Do not infer them from the product name or adapter-oriented design.

## Local checks

Use Node.js 24 or newer in the Switchboard repository:

```bash
npm run build
node --test test/server.test.mjs test/ui.test.mjs
```

`build` is syntax checking for the two server modules and Settings UI; it is not bundling or a live provider test. Most service tests use fakes. However, the first server test activates the service without passing its fetch stub and can attempt a Telegram request with a literal dummy token. Treat the server suite as network-capable until that test-isolation gap is fixed; do not run it where external provider calls are forbidden. Never supply a real bot token to this suite.

The Core contract test needs a current compatible Burrow-Backend checkout. By default it looks for the sibling checkout; set the explicit path when layouts differ:

```bash
# Install Backend dependencies in its own checkout first.
(cd ../Burrow-Backend && npm ci --no-audit --no-fund)
BURROW_CORE_ROOT="$(cd ../Burrow-Backend && pwd)" npm run test:core
```

`npm test` runs all test files, including that Core contract. A missing Core checkout/dependencies is not a reason to silently omit this prerequisite when reporting a full test pass.

## Test responsibilities

- `test/server.test.mjs`: admission/routing, token and API behavior, polling/reconciliation, send ambiguity and service lifecycle using controlled dependencies.
- `test/ui.test.mjs`: Settings rendering/actions, token preservation/replacement/clear, admission, mapping changes, retry and disposal through a fake DOM.
- `test/core-contract.test.mjs`: real Core discovery/host smoke coverage for manifest/settings registration, bootstrap and disabled-token configuration. External-turn capabilities are mocked; this is not a real model execution or full Telegram-to-agent roundtrip.

Fake-DOM tests do not replace browser layout/accessibility checks. Passing the contract test does not establish live Telegram credentials, network reachability or production delivery. With explicit operator authorization, test live integration separately with an operator-owned bot and a harmless limited-capability agent, without recording its secret.

## Release workflow

The repository workflow runs on main pushes and manual dispatch. It checks syntax, server/UI tests and the Core contract against a current Backend checkout, then assigns a UTC calendar version, commits changed version files, tags and creates a development release. Repeated same-day tags receive a numeric suffix.

A documentation push can therefore trigger the normal release workflow. Do not manually bump package or manifest versions merely to edit documentation. No changes to runtime, promotion or synchronization policy are required for these pages.

## Source map

| Source | Documentation responsibility |
| --- | --- |
| `burrow.mod.json` | Mod identity, version and four Settings registrations |
| `package.json` | Node requirement and check commands |
| `server/index.mjs` | Activation/cleanup, routes, operator-auth gate, response/error policy |
| `server/telegram.mjs` | Telegram calls, admission, mapping keys, polling offsets, Core turns, delivery states, bounded persistence |
| `ui/settings.js` | Actual operator controls, confirmation, snapshot loading, error presentation and disposal |
| `test/server.test.mjs` | Server/service regression coverage |
| `test/ui.test.mjs` | Fake-DOM Settings regression coverage |
| `test/core-contract.test.mjs` | Real-Core integration contract |
| `.github/workflows/release.yml` | CI and automatic development release behavior |
| `scripts/set-release-version.mjs` | Calendar version synchronization/check |

The hero in `docs/assets/hero.png` is the user-selected joint-effort Snickerdink image, preserved unchanged (1536 × 1024 PNG; SHA-256 `d5dc56f2ae2a2de646e16751f5e8eda21a5603bf88e3ea317ecd7de6aba1b49f`). It is not generated or reworked by this documentation pass.

## Pre-publication reconciliation

The source head was rechecked at `056f0749542e92cfe6b2346b6ef7c6f268b5e4e7` (version **2026.10.22.2**). Changes since the implementation baseline only add the selected hero/README image and the automatic release version; runtime behavior is unchanged. This documentation pass preserves that version and makes no runtime changes.
