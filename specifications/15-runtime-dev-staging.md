# 15. Runtime-Dev Staging System

## 15.1 Purpose

The `runtime-dev/` directory simulates the installed application runtime filesystem during development. It provides a development-time analog to the production-installed directory structure without requiring PyInstaller packaging, actual installation, or modifications to the source tree.

This system ensures that all runtime execution targets a **staged artifact tree**, not the repository source tree directly.

## 15.2 Architecture

### Runtime-Dev Directory Structure

```
runtime-dev/                          ← Auto-generated, git-ignored
├── .manifest.json                    ← Staging metadata (timestamp, sources)
├── resources/                        ← Container for runtime components
│   └── server/                       ← Staged Node.js backend runtime
│       ├── server.js
│       ├── package.json
│       ├── package-lock.json
│       ├── node_modules/             ← Production-only dependencies
│       ├── .env                      ← Copied from .env.example
│       ├── config/
│       ├── models/
│       ├── services/
│       ├── routingStrategies/
│       ├── ecosystem.config.js
│       ├── vercel.json
│       └── frontend/
│           └── dist/                 ← Built frontend assets
├── runtime/                          ← Reserved for runtime abstractions
├── core/                             ← Reserved for core runtime modules
├── localAppData/                     ← Simulates %LOCALAPPDATA%/OptiRoute
│   └── data/                         ← From installed/SetupTool/data/
└── roamingAppData/                   ← Simulates %APPDATA%/OptiRoute
```

> **Note:** `resources/` acts as a container for runtime components. Currently it
> holds only the server. Future components (e.g. the agent app) will be added
> under `resources/` as separate subdirectories.

### Source → Runtime Mapping

| Source | Destination | Purpose |
|---|---|---|
| `resources/server/server.js` | `runtime-dev/resources/server/server.js` | Backend entrypoint |
| `resources/server/config/` | `runtime-dev/resources/server/config/` | Routing configuration |
| `resources/server/models/` | `runtime-dev/resources/server/models/` | Mongoose models |
| `resources/server/services/` | `runtime-dev/resources/server/services/` | Service layer |
| `resources/server/routingStrategies/` | `runtime-dev/resources/server/routingStrategies/` | Routing algorithms |
| `resources/server/frontend/dist/` | `runtime-dev/resources/server/frontend/dist/` | Built SPA assets |
| `resources/server/.env.example` | `runtime-dev/resources/server/.env` | Environment config |
| `installed/SetupTool/data/` | `runtime-dev/localAppData/data/` | Application data |

### Excluded From Staging

The following source-only artifacts are **never** staged:

- `resources/server/tests/` — Development tests
- `resources/server/add_data.js`, `add_5_deliveries.js`, `finish_and_add.js` — Seed scripts
- `resources/server/frontend/src/` — Raw frontend source (only `dist/` is staged)
- `resources/server/frontend/node_modules/` — Frontend dev dependencies
- `resources/server/node_modules/` — Source dev dependencies (rebuilt as prod-only)
- `resources/server/frontend/build_log.txt`, `build_error.txt` — Build artifacts
- `.env` files from source (runtime-dev gets a fresh copy from `.env.example`)

## 15.3 Staging Pipeline

### Location

```
scripts/stage-runtime-dev/
├── stage.js       ← Main staging script (Node.js)
└── stage.bat      ← Windows convenience wrapper
```

### Usage

```bash
# Full staging (builds frontend, installs deps)
node scripts/stage-runtime-dev/stage.js

# Skip frontend rebuild (uses existing dist/)
node scripts/stage-runtime-dev/stage.js --skip-frontend-build

# Via batch wrapper
scripts\stage-runtime-dev\stage.bat
scripts\stage-runtime-dev\stage.bat --skip-frontend-build
```

### Pipeline Steps

1. **Clean** — Removes existing `runtime-dev/` directory entirely.
2. **Create Structure** — Creates all canonical subdirectories.
3. **Stage Installed Data** — Copies `installed/SetupTool/data/` into `localAppData/`.
4. **Stage Backend** — Copies only runtime-relevant files from `resources/server/` into `resources/server/`.
5. **Stage Frontend** — Optionally builds frontend, copies `dist/` output.
6. **Install Dependencies** — Runs `npm install --omit=dev` in staged server.
7. **Write Manifest** — Creates `.manifest.json` with staging metadata.

### Idempotency

The pipeline is fully idempotent. Each run completely removes and recreates the `runtime-dev/` directory. There is no incremental staging.

## 15.4 Runtime-Dev Rules

1. `runtime-dev/` is **auto-generated** and **git-ignored**. It must never be committed.
2. `runtime-dev/` must **not** become a second source tree. Edits happen in `resources/server/`, then re-staged.
3. `runtime-dev/` must contain **only runtime-relevant artifacts** — no tests, seed scripts, or raw source.
4. `runtime-dev/resources/server/` executes against its own `node_modules/` (production-only).
5. `runtime-dev/` simulates installed runtime semantics, not repository semantics.
6. `runtime-dev/resources/` is a container for runtime components, not a mirror of `installed/SetupTool/resources/`.

## 15.5 Relationship to Installed Payload

```
Development Flow:
  resources/server/ (edit) → stage.js → runtime-dev/resources/server/ (execute)

Production Flow:
  resources/server/ (edit) → build pipeline → installed/SetupTool/ (package) → install
```

The `installed/SetupTool/` directory is the **authoritative runtime payload source**. The staging pipeline copies its `data/` directory into `runtime-dev/localAppData/` and stages the backend into `runtime-dev/resources/server/`, ensuring that runtime-dev mirrors installed runtime semantics.

## 15.6 Deferred to Later Phases

The following are explicitly NOT part of this phase:

- **Path abstraction layer** (`pathManager`) for resolving AppData locations
- **Launcher redesign** to launch from `runtime-dev/` instead of source
- **Backend service refactoring** for runtime-aware path resolution
- **`run-app.bat` replacement** with runtime-dev-aware launcher
- **Authentication/security** changes
- **OR-Tools/VRP scheduler** activation
