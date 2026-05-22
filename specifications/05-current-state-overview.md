# 5. Current-State Overview

## 5.1 As-Built Architecture

### Architecture Diagram

```
┌─────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   Setup Tool    │     │  Agent Mobile App │     │ Manager Dashboard │
│  (Python/Tk)    │     │  (Expo/RN)        │     │ (React/Vite SPA)  │
└────────┬────────┘     └────────┬──────────┘     └─────────┬─────────┘
         │                       │                          │
         │ Copies files          │ HTTP + GPS poll          │ HTTP fetch
         │                       │                          │
         │              ┌────────▼──────────────────────────▼──────────┐
         │              │         Express Backend (server.js)          │
         └──────────────►  API Layer → Service Layer → Models → MongoDB│
                        │  Static: /manager/* → frontend/dist/         │
                        └──────────────────────────────────────────────┘
```

### Service Architecture

```
┌──────────────────────────────────────────────────────┐
│                    server.js (API Layer)             │
│  Routes → deliveryService / assignmentService        │
│           stateService (read-only queries)           │
└──────┬─────────────┬─────────────┬───────────────────┘
       │             │             │
       ▼             ▼             ▼
┌────────────┐ ┌───────────┐ ┌───────────────────┐
│ delivery   │ │ assignment│ │   stateService     │
│ Service    │ │ Service   │ │ (mutation layer)   │
│ (lifecycle │ │ (agent    │ │ - queue ops        │
│  orchestr.)│ │  scoring) │ │ - pointer sync     │
└─────┬──────┘ └─────┬─────┘ │ - delivery CRUD   │
      │              │       │ - agent CRUD       │
      │              │       │ - location ops     │
      ▼              ▼       │ - global sync      │
┌──────────────────────┐     └────────┬────────────┘
│ routingEngineService │              │
│ (routing orchestr.)  │              ▼
│ - strategy selection │        ┌──────────────┐
│ - route evaluation   │        │  MongoDB     │
│ - marginal cost      │        │  (Mongoose)  │
└──────┬───────┬───────┘        └──────────────┘
       │       │
       ▼       ▼
┌──────────┐ ┌──────────────┐
│ routing  │ │ costModel    │
│Strategies│ │ Service      │
│ - insert │ │ - route cost │
│ - 2-opt  │ │ - SLA/load   │
└──────────┘ └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ matrixCache  │
             │ Service      │
             │ - haversine  │
             │ - providers  │
             │ - LRU cache  │
             └──────────────┘
```

### Dependency Direction Summary

| From | To | Mechanism |
|---|---|---|
| Mobile App → Backend | HTTP REST (polling every 5s) | fetch API |
| Mobile App → Google | HTTP (on route change) | Directions API |
| Dashboard → Backend | HTTP REST (fetch on mount, once) | fetch API via proxy |
| Backend → MongoDB | TCP (Mongoose ODM) | Connection string |
| Backend → Matrix Provider | HTTP (OSRM/GraphHopper/Mapbox) | Native fetch |
| Setup Tool → Filesystem | File copy (shutil) | Local disk |
| Backend → Dashboard | Static file serving | Express middleware |
| deliveryService → stateService | Function calls | Orchestration → mutation |
| deliveryService → routingEngineService | Function calls | Orchestration → routing |
| assignmentService → stateService | Function calls | Agent scoring → state reads |
| assignmentService → routingEngineService | Function calls | Marginal cost evaluation |
| routingEngineService → routingStrategies | Function calls | Strategy delegation |
| routingEngineService → costModelService | Function calls | Route cost evaluation |
| costModelService → matrixCacheService | Function calls | Travel metrics resolution |

### Mutation Ownership

| Service | Mutation Ownership | Transaction Ownership |
|---|---|---|
| stateService | Sole owner of all database mutations | Owns or reuses sessions |
| deliveryService | None — orchestration only | Delegates to stateService |
| assignmentService | None — orchestration only | Delegates to stateService |
| routingEngineService | None — pure computation | No transactions |
| costModelService | None — pure computation | No transactions |
| matrixCacheService | In-memory cache only | No transactions |

## 5.2 Current System vs Original Intent

| Area | Original Intent | Actual Implementation | Status |
|---|---|---|---|
| Routing Service | Unified `routingService.js` | Refactored into `routingEngineService.js` (orchestration), `costModelService.js` (scoring), `matrixCacheService.js` (travel data), `routingStrategies/` (algorithms). All references updated. | IMPLEMENTED |
| State Abstraction | N/A (original design used direct DB access) | Evolved to `stateService.js` as single mutation authority. All lifecycle services refactored to orchestration-only. | IMPLEMENTED |
| Delivery Lifecycle | Direct DB mutation in deliveryService | Refactored to pure orchestration. Delegates all mutations to stateService, all routing to routingEngineService. | IMPLEMENTED |
| OR-Tools Integration | Toggle via `ORTOOLS_ENABLED` | `vrpSolverService.js` has stub `runOrToolsBatch` that always falls back to internal optimizer. No OR-Tools binary. | STUBBED |
| VRP Scheduler | Scheduler scaffolding in Phase 3 | `scheduleReoptimization()` exists but is **never invoked** from server startup. | STUBBED |
| Test Suite | Validation tests in Phase 4 | Tests updated to import from new architecture (costModelService, twoOptStrategy, routingEngineService). | IMPLEMENTED |
| Dashboard Live Data | Live management tool | `useLiveLogisticsData` fetches real data; KPIs/analytics/driver performance use **hardcoded mock data**. | PARTIAL |
| Setup Tool Env Vars | Configure server environment | Writes `EXAMPLE_API_KEY`, `EXAMPLE_ENDPOINT`, `MONGODB_URI` — placeholder names, not real routing config vars. | IMPLEMENTED (with deviation) |

### Architecture Evolution Notes

1. **routingService.js → Decomposed Architecture**: The monolithic `routingService.js` was decomposed into four specialized components with clear separation of concerns:
   - `routingEngineService.js` — orchestration and strategy selection
   - `costModelService.js` — weighted route cost evaluation
   - `matrixCacheService.js` — travel data and caching
   - `routingStrategies/` — pluggable algorithm implementations

2. **Direct DB Mutation → stateService Abstraction**: Lifecycle services (`deliveryService.js`) no longer directly import mongoose models or perform database operations. All mutations flow through `stateService.js` primitives, ensuring pointer consistency, ownership validation, and transactional atomicity.

3. **Derived Delivery Status**: Delivery status is intentionally not persisted as a database field. Status is derived contextually by inspecting which queue a delivery belongs to (pending = awaiting pickup, active = en route, completed/cancelled = removed from queues and deleted).

## 5.3 Implementation Maturity Matrix

| Component | Location | Status | Notes |
|---|---|---|---|
| Setup Tool (GUI + build) | `src/main.py` | IMPLEMENTED | Fully functional |
| Express Server + Middleware | `server.js` | IMPLEMENTED | Helmet, CORS, Morgan, static serving |
| MongoDB Models (all 5) | `models/` | IMPLEMENTED | Agent, AgentLocation, DeliveryAssignment, PickupLocation, SystemState |
| stateService | `services/stateService.js` | IMPLEMENTED | Single mutation authority; queue ops, pointer sync, delivery/agent CRUD, location management, global state sync |
| deliveryService | `services/deliveryService.js` | IMPLEMENTED | Pure orchestration layer; lifecycle workflows via stateService + routingEngineService |
| assignmentService | `services/assignmentService.js` | IMPLEMENTED | Agent scoring via routingEngineService.evaluateInsertion; strategy-agnostic |
| costModelService | `services/costModelService.js` | IMPLEMENTED | Weighted cost formula with SLA, load, detour penalties |
| matrixCacheService | `services/matrixCacheService.js` | IMPLEMENTED | Multi-provider + LRU cache |
| routingEngineService | `services/routingEngineService.js` | IMPLEMENTED | Routing orchestration; strategy selection, route/insertion evaluation |
| routingStrategies/ | `routingStrategies/` | IMPLEMENTED | Insertion TSP + 2-opt optimization |
| config/routingConfig | `config/routingConfig.js` | IMPLEMENTED | Env-driven typed config |
| vrpSolverService | `services/vrpSolverService.js` | STUBBED | OR-Tools is no-op; scheduler never activated |
| Test Suite (3 files) | `tests/` | IMPLEMENTED | Updated to import from new architecture |
| Dashboard (UI rendering) | `frontend/src/` | IMPLEMENTED | All 6 pages render |
| Dashboard (live data) | `frontend/src/app/lib/` | PARTIAL | Hook fetches real data; KPIs/analytics use mocks |
| Mobile App | `agent/` | IMPLEMENTED | Full driver workflow |
| Authentication | N/A | PLANNED | Not implemented anywhere |
| run-app.bat | `run-app.bat` | IMPLEMENTED | Dev launcher script |
| Seed Scripts (3 files) | `add_data.js`, `add_5_deliveries.js`, `finish_and_add.js` | IMPLEMENTED | Test data generators |

---

