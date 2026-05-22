# 6. Architecture Specification

## 6.1 Architectural Style

Layered client-server monolith with pluggable strategy pattern for routing algorithms and strict persistence abstraction via stateService.

## 6.2 Layer Model

| Layer | Location | Responsibility | Dependencies |
|---|---|---|---|
| Presentation | `frontend/src/`, `agent/` | User interfaces (web + mobile) | Backend API |
| API / Controller | `server.js` (route handlers) | Request validation, response formatting | Service layer |
| Orchestration | `deliveryService.js` | Delivery lifecycle workflows | stateService, routingEngineService, assignmentService |
| Assignment | `assignmentService.js` | Agent selection and scoring | stateService, routingEngineService |
| Routing | `routingEngineService.js` | Route orchestration and strategy selection | Strategies, costModelService, matrixCacheService |
| Strategy | `routingStrategies/*.js` | Pluggable routing algorithms | Cost evaluator (injected) |
| Cost Model | `costModelService.js` | Weighted route cost evaluation | matrixCacheService, routingConfig |
| Matrix | `matrixCacheService.js` | Travel data, providers, caching | routingConfig |
| State / Mutation | `stateService.js` | Sole mutation authority; queue ops, CRUD, pointer sync | Models, Mongoose |
| Configuration | `config/routingConfig.js` | Centralized env-driven typed config | Environment variables |
| Data Access | `models/*.js` | Mongoose schema definitions | Mongoose/MongoDB |
| Persistence | MongoDB | Document storage | — |
| Installer | `src/main.py` | Desktop installer logic | Python stdlib |

## 6.3 Dependency Structure

### Directional Dependencies (→ = depends on)

| Source | Target | Import Type |
|---|---|---|
| server.js | deliveryService | `require()` |
| server.js | stateService | `require()` |
| server.js | assignmentService | `require()` |
| deliveryService | stateService | `require()` |
| deliveryService | routingEngineService | `require()` |
| deliveryService | matrixCacheService | `require()` (normalizeStop only) |
| deliveryService | assignmentService | `require()` |
| assignmentService | stateService | `require()` |
| assignmentService | matrixCacheService | `require()` |
| assignmentService | routingEngineService | `require()` |
| routingEngineService | matrixCacheService | `require()` |
| routingEngineService | costModelService | `require()` |
| routingEngineService | insertionStrategy | `require()` |
| routingEngineService | twoOptStrategy | `require()` |
| costModelService | routingConfig | `require()` |
| costModelService | matrixCacheService | `require()` |
| matrixCacheService | routingConfig | `require()` |
| vrpSolverService | routingConfig | `require()` |
| vrpSolverService | routingEngineService | `require()` |
| stateService | Agent, DeliveryAssignment, AgentLocation, PickupLocation, SystemState models | `require()` |

### Key Architecture Property: No Direct Model Access in Lifecycle Services

deliveryService does NOT import any mongoose models. All database operations are delegated to stateService primitives, ensuring:
- Transactional consistency
- Pointer integrity
- Single mutation authority
- Clear ownership boundaries

## 6.4 Cross-Cutting Concerns

| Concern | Implementation | Status |
|---|---|---|
| HTTP Logging | Morgan middleware, `combined` format, stdout | IMPLEMENTED |
| Application Logging | `console.log` / `console.error` only | IMPLEMENTED (minimal) |
| Security Headers | Helmet with custom CSP | IMPLEMENTED |
| CORS | `cors()` — all origins allowed | IMPLEMENTED (insecure) |
| Input Validation | Manual field checks in route handlers | PARTIAL (no schema validation) |
| Configuration | `routingConfig.js` with typed env-var fallbacks | IMPLEMENTED |
| Caching | In-memory Map with TTL + LRU in matrixCacheService | IMPLEMENTED |
| Authentication | Not implemented | PLANNED |
| Rate Limiting | Not implemented | PLANNED |
| Monitoring | Not implemented | PLANNED |
| Structured Logging | Not implemented | PLANNED |

## 6.5 Ownership Boundaries

| Boundary | Owner | Authority |
|---|---|---|
| Agent queue arrays (`activeDeliveries`, `pendingPickupDeliveries`) | stateService | Sole mutator of agent queue arrays |
| Delivery pointer fields (`prevDeliveryId`, `nextDeliveryId`) | stateService (`_syncPointersFromArray`) | Derived from agent arrays; rebuilt on every mutation |
| Agent assignment (which agent gets a delivery) | assignmentService | Decision authority for optimal agent selection |
| Delivery lifecycle (create, pickup, complete, cancel) | deliveryService | Orchestrates via stateService primitives; does not directly mutate |
| Route construction and optimization | routingEngineService + strategies | Owns algorithm selection and execution |
| Route cost evaluation | costModelService | Sole authority on cost computation |
| Travel matrix generation and caching | matrixCacheService | Owns cache state, provider integration |
| Global system state (`SystemState.firstDeliveries`) | stateService | Updates via `syncGlobalFirstDeliveries`; called by deliveryService after lifecycle changes |
| Agent GPS location | stateService | Writes via upsert; no ownership validation |
| nextPickupLocation | stateService (mutation) / deliveryService (trigger logic) | stateService owns the write; deliveryService determines when to update based on lifecycle trigger rules |

## 6.6 Mutation Boundaries

| Data | Who Mutates | How | Transactional |
|---|---|---|---|
| Agent.activeDeliveries | stateService | `setActiveRoute`, `replaceActiveRoute`, `removeFromActive`, `completeFirstActive`, `cancelAndDeleteDelivery` | Yes (session) |
| Agent.pendingPickupDeliveries | stateService | `addToPending`, `removeFromPending`, `clearPendingQueue`, `cancelAndDeleteDelivery` | Yes (session) |
| Agent.nextPickupLocation | stateService | `setNextPickupLocation`, `clearNextPickupLocation` | Yes (session) |
| DeliveryAssignment (creation) | stateService | `createDelivery` | Yes (session) |
| DeliveryAssignment (deletion) | stateService | `deleteDelivery`, `completeFirstActive`, `cancelAndDeleteDelivery` | Yes (session) |
| DeliveryAssignment.agentId | stateService | `addToPending`, `unassignDelivery` | Yes (session) |
| DeliveryAssignment.prev/nextDeliveryId | stateService | `_syncPointersFromArray` (internal) | Yes (within parent session) |
| AgentLocation.location | stateService | `upsertAgentLocation` | Yes (session) |
| SystemState.firstDeliveries | stateService | `syncGlobalFirstDeliveries` | No (self-contained) |
| In-memory travel cache | matrixCacheService | `cacheEntry`, `buildTravelMatrix` | No (not transactional) |

## 6.7 Pointer Synchronization Model

### Queue Structure

Agent delivery queues (`activeDeliveries`, `pendingPickupDeliveries`) are arrays of ObjectId references. Each delivery document also maintains `prevDeliveryId` and `nextDeliveryId` pointer fields forming a doubly-linked list.

### Synchronization Rule

After every queue mutation, `_syncPointersFromArray` rebuilds the pointer chain from the array ordering:

```
Array: [D1, D2, D3]

D1.prevDeliveryId = null    D1.nextDeliveryId = D2
D2.prevDeliveryId = D1      D2.nextDeliveryId = D3
D3.prevDeliveryId = D2      D3.nextDeliveryId = null
```

### Invariants

1. Array order is authoritative; pointers are derived
2. Pointer chain must be bidirectionally consistent
3. No delivery may appear in more than one queue
4. No delivery may be owned by more than one agent

## 6.8 nextPickupLocation Lifecycle

### Trigger Rules

| Event | Condition | Action |
|---|---|---|
| Delivery assigned | New delivery queued to agent | Set to first pending delivery destination |
| Pickup activated | Pending moved to active | **Clear** (agent is en route, not navigating to pickup) |
| Delivery completed | Active becomes empty, pending non-empty | Set from first pending delivery destination |
| Delivery completed | Active becomes empty, pending empty | Clear |
| Delivery completed | Active still has remaining | No change |
| Delivery cancelled (active) | Remaining active > 0 | Clear (agent is en route after reroute) |
| Delivery cancelled (active) | Active becomes empty, pending non-empty | Set from first pending delivery destination |
| Delivery cancelled (active) | Active becomes empty, pending empty | Clear |
| Delivery cancelled (pending) | — | No change |

### Ownership

- **Trigger logic**: deliveryService determines when to update based on lifecycle events
- **Mutation**: stateService.setNextPickupLocation / clearNextPickupLocation

## 6.9 Routing Architecture

### Strategy Pattern

routingEngineService delegates to pluggable strategy implementations:

```
routingEngineService.buildRoute()
    → insertionStrategy.buildInsertionRoute()

routingEngineService.optimizeRoute()
    → twoOptStrategy.optimizeTwoOpt()
```

### Strategy Contract

Each strategy receives:
- `stops` — normalized stop array
- `matrix` — precomputed travel matrix
- `evaluateRouteCost` — injected cost function (from costModelService)
- `options` — configuration overrides

Strategies must NOT:
- Access the database
- Import models or services
- Maintain state between calls
- Assume specific cost model implementation

### Route Evaluation Pipeline

```
stops → buildTravelMatrix() → buildRoute() → optimizeRoute() → routeCost()
         matrixCacheService    insertionStrategy  twoOptStrategy    costModelService
```

---

