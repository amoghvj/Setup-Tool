# Setup Tool

A desktop-based setup tool for the OptiRoute Pro project. It helps users install the Node.js + Express server component onto their local machine.

## Quick Start (Development)

```bash
python src/main.py
```

## Build to EXE

```bash
pip install -r requirements.txt
pyinstaller --onefile --windowed --add-data "resources/server;resources/server" --name "SetupTool" src/main.py
```

The compiled exe is output to `dist/SetupTool.exe`.

## Testing as Installed Application

1. Copy `dist/SetupTool.exe` → `installed/SetupTool/SetupTool.exe`
2. Copy `resources/server/` → `installed/SetupTool/resources/server/`
3. Run `installed/SetupTool/SetupTool.exe`

## Project Structure

| Directory | Purpose |
|---|---|
| `src/` | Python source code |
| `resources/server/` | Pre-packaged Node.js + Express server (bundled into exe) |
| `installed/SetupTool/` | Simulated install directory (mirrors Program Files layout) |
| `build/`, `dist/` | PyInstaller output (auto-generated) |

## Routing Upgrade Overview

The server routing stack has been upgraded in phases to support real-time optimization and tunable cost scoring.

### Phase 1 (Shipped)

- Haversine fallback distance replaced Euclidean point distance.
- Driver assignment now uses marginal insertion cost instead of delivery-count only.
- Frontend assignment actions are persisted via backend API.
- Driver availability and map delivery references are normalized.

### Phase 2 (Shipped)

- Matrix adapter supports `osrm`, `graphhopper`, and `mapbox` (with Haversine fallback).
- In-memory LRU+TTL matrix cache avoids full recomputation.
- Route search uses cheapest insertion + 2-opt local improvement.
- Composite weighted cost function is configurable through environment variables.

### Phase 3 (Scaffolded)

- `vrpSolverService.js` provides async fleet optimization and scheduler scaffolding.
- OR-Tools integration can be toggled via `ORTOOLS_ENABLED`.

### Phase 4 (Validation)

- Tests include route cost units, insertion vs 2-opt integration check, and concurrent assignment simulation.

## Backend Environment Schema

Copy `resources/server/.env.example` to `resources/server/.env` and set values as needed.

- `ROUTE_ALPHA` `ROUTE_BETA` `ROUTE_GAMMA` `ROUTE_DELTA` `ROUTE_EPSILON`: weighted composite cost coefficients.
- `MATRIX_PROVIDER`: `haversine`, `osrm`, `graphhopper`, or `mapbox`.
- `MATRIX_BASE_URL`: matrix API host (required for non-haversine providers).
- `MATRIX_ACCESS_TOKEN`: access token when using Mapbox.
- `MATRIX_CACHE_TTL_MINUTES`: matrix cache TTL.
- `MATRIX_CACHE_MAX_ENTRIES`: max LRU cache size.
- `REOPTIMIZE_ORDER_THRESHOLD`: trigger threshold for batch re-optimization.
- `REOPTIMIZE_INTERVAL_MINUTES`: scheduler interval.
- `ORTOOLS_ENABLED`: enables VRP solver mode.
- `ORTOOLS_TIME_LIMIT_SECONDS`: max solver time budget.
