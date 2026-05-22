# 7. Module Specification

Each module entry follows a normalized structure: Purpose, Location, Status, Public Interface (methods with signatures, inputs, outputs, side effects, transactional behavior), Dependencies, Error Behavior.

---

## 7.1 Setup Tool

| Field | Value |
|---|---|
| **Purpose** | Desktop GUI installer for deploying the backend server |
| **Location** | `src/main.py` |
| **Type** | Standalone Python application |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects |
|---|---|---|---|
| `copy_server(directory)` | Target directory path | None (raises on error) | Copies `resources/server/` to `<dir>/server/` |
| `update_env_file(path, vars)` | Server path, env var dict | None | Appends to `.env` (skips existing keys) |
| `check_node()` | None | Boolean (Node.js on PATH) | None |
| `on_continue()` | GUI state | None | Orchestrates copy + env write + validation |

### Path Resolution

| Context | Resolution |
|---|---|
| Development | `<project_root>/resources/server/` |
| Frozen (PyInstaller) | `sys._MEIPASS` first, then exe directory |

### Error Behavior

| Condition | Response |
|---|---|
| `FileExistsError` | Warning dialog if `server/` exists at destination |
| `FileNotFoundError` | Error dialog if bundled server missing |
| Node.js not found | Warning dialog (non-blocking) |

---

## 7.2 stateService

| Field | Value |
|---|---|
| **Purpose** | Core data mutation layer with transactional primitives |
| **Location** | `services/stateService.js` |
| **Lines** | 1477 |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects | Transactional |
|---|---|---|---|---|
| `createAgent(agentId, opts)` | agentId: string | Agent document | Inserts Agent | Yes |
| `getAgent(agentId)` | agentId: string | Agent document | None | No |
| `getAgents(filter)` | MongoDB filter | Agent[] | None | No |
| `getAgentByExternalId(agentId)` | agentId: string | Agent document | None | No |
| `createDelivery(orderId, dest, opts)` | orderId: string?, destination: {lat,lng} | Delivery document | Inserts DeliveryAssignment | Yes |
| `getDelivery(id)` | deliveryId: string | Delivery document | None | No |
| `getDeliveryByOrderId(orderId)` | orderId: string | Delivery document | None | No |
| `getDeliveriesByIds(ids)` | string[] | Delivery[] | None | No |
| `getDeliveries(filter)` | MongoDB filter | Delivery[] | None | No |
| `addToPending(agentId, deliveryId, opts)` | agentId, deliveryId | Agent document | Pushes to pending array, sets agentId, syncs pointers | Yes |
| `removeFromPending(agentId, deliveryId, opts)` | agentId, deliveryId | Agent document | Filters from pending, syncs pointers | Yes |
| `removeFromActive(agentId, deliveryId, opts)` | agentId, deliveryId | Agent document | Filters from active, syncs pointers | Yes |
| `clearPendingQueue(agentId, opts)` | agentId | string[] (cleared IDs) | Empties pending, clears delivery ownership/pointers | Yes |
| `setActiveRoute(agentId, orderedIds, opts)` | agentId, orderedIds: string[] | Agent document | Overwrites activeDeliveries, clears pending, syncs pointers | Yes |
| `replaceActiveRoute(agentId, orderedIds, opts)` | agentId, orderedIds | Agent document | Delegates to setActiveRoute | Yes |
| `unassignDelivery(deliveryId, opts)` | deliveryId | boolean | Removes from agent queues, clears ownership/pointers | Yes |
| `deleteDelivery(deliveryId, opts)` | deliveryId | boolean | Deletes document (only if unassigned) | Yes |
| `validateOwnership(agentId, deliveryIds)` | agentId, deliveryIds | void (throws on mismatch) | None | No |
| `getList(deliveryId)` | deliveryId | { before: string[], after: string[] } | None (refreshes traversal) | No |
| `getAgentCommittedDeliveries(agentId)` | agentId | Delivery[] | None | No |
| `setNextPickupLocation(agentId, loc, opts)` | agentId, {lat,lng} | Agent document | Updates nextPickupLocation | Yes |
| `clearNextPickupLocation(agentId, opts)` | agentId | Agent document | Sets nextPickupLocation to null | Yes |
| `getAgentLocation(agentId)` | agentId | {lat,lng} or null | None | No |
| `upsertAgentLocation(agentId, coords, opts)` | agentId, {lat,lng} | Location document | Upserts AgentLocation | Yes |
| `createPickupLocation(data, opts)` | {id, name, coords} | PickupLocation document | Inserts PickupLocation | Yes |
| `getPickupLocation(pickupId)` | pickupId | PickupLocation document | None | No |
| `deletePickupLocation(pickupId, opts)` | pickupId | PickupLocation document | Deletes document | Yes |
| `getPickupLocations(filter)` | MongoDB filter | PickupLocation[] | None | No |
| `syncGlobalFirstDeliveries()` | None | void | Upserts SystemState.firstDeliveries with first active delivery from each agent | No (self-contained) |
| `completeFirstActive(agentId, opts)` | agentId | { agent, completedId } | Removes first active delivery, deletes delivery document, syncs pointers | Yes |
| `cancelAndDeleteDelivery(orderId, opts)` | orderId | { agent, delivery, wasActive, wasFirst } | Removes from queue, deletes delivery document, syncs pointers | Yes |

### Transaction Model

- Uses `withSession()` / `finalizeSession()` pattern.
- Creates new session + transaction if none provided; reuses caller's session otherwise.
- Auto-commits on success, auto-aborts on error (when owning the session).

### Internal Method

| Method | Purpose |
|---|---|
| `_syncPointersFromArray(agentId, type, session)` | Rebuilds prev/next pointers from agent's array order |

---

## 7.3 assignmentService

| Field | Value |
|---|---|
| **Purpose** | Agent selection and delivery assignment orchestration |
| **Location** | `services/assignmentService.js` |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects | Transactional |
|---|---|---|---|---|
| `assignAgent(coords)` | {lat, lng} | { agentId, agent } | None (read + compute only) | No |
| `scoreAgentForDelivery(agent, stop)` | Agent document, NormalizedStop | { marginalCost, route } | None | No |
| `buildCommittedStops(agentId)` | agentId: string | NormalizedStop[] | None | No |
| `queueDeliveryToAgent(agentId, deliveryId)` | agentId, deliveryId | Agent document | Calls stateService.addToPending | Yes (delegated) |
| `moveDeliveryToAgent(deliveryId, fromId, toId)` | deliveryId, fromAgentId, toAgentId | Result object | Unassigns from source, adds to target | Yes (delegated) |
| `isDriverAvailable(agent)` | Agent document | boolean | None | No |

### Algorithm: Agent Selection

1. Retrieve all agents via `stateService.getAgents()`.
2. Filter for available agents (prefer idle).
3. For each candidate: `buildCommittedStops()` → current route.
4. `routingEngineService.evaluateInsertion()` → marginal cost.
5. Add busy-driver penalty (default 1000) for non-idle agents.
6. Select agent with lowest total marginal cost.
7. If no available agents, evaluate ALL agents with penalty.

---

## 7.4 deliveryService

| Field | Value |
|---|---|
| **Purpose** | Delivery lifecycle orchestration (orchestration-only; no direct DB mutation) |
| **Location** | `services/deliveryService.js` |
| **Status** | IMPLEMENTED |

### Architectural Role

- Orchestration layer only
- Does not import mongoose models
- Delegates all mutations to stateService primitives
- Delegates routing to routingEngineService
- Delegates queuing to assignmentService

### Public Interface

| Method | Inputs | Outputs | Side Effects | Transactional |
|---|---|---|---|---|
| `assignDriver(agentId, orderId, coords)` | agentId, orderId?, {lat,lng} | Agent document | Creates delivery (stateService), queues to agent (assignmentService), updates nextPickupLocation (stateService) | Delegated |
| `processPickup(agentId)` | agentId | Agent document | Optimizes route (routingEngineService), sets active route (stateService), clears nextPickupLocation (stateService), syncs global state (stateService) | Delegated |
| `completeDelivery(agentId)` | agentId | Agent document | Completes first active (stateService), updates nextPickupLocation per trigger rules (stateService), syncs global state (stateService) | Delegated |
| `cancelDelivery(orderId)` | orderId | Agent document | Cancels and deletes delivery (stateService), reroutes if needed (routingEngineService + stateService), updates nextPickupLocation per trigger rules (stateService), syncs global state (stateService) | Delegated |
| `getAgentRoute(agentId)` | agentId | { activeDeliveries, nextPickupLocation } | None | Read-only |
| `assignExistingDelivery(deliveryId, agentId)` | deliveryId, agentId | Result object | Reassigns delivery (assignmentService.moveDeliveryToAgent) | Delegated |

### Dependencies

| Dependency | Import | Usage |
|---|---|---|
| stateService | `createDelivery, getAgent, getDeliveriesByIds, getDeliveryByOrderId, getAgentLocation, setActiveRoute, setNextPickupLocation, clearNextPickupLocation, replaceActiveRoute, syncGlobalFirstDeliveries, completeFirstActive, cancelAndDeleteDelivery` | All state mutations |
| routingEngineService | `evaluateRoute` | Route optimization during pickup and rerouting |
| matrixCacheService | `normalizeStop` | Stop normalization for routing |
| assignmentService | `queueDeliveryToAgent, moveDeliveryToAgent` | Delivery queuing and transfer |


---

## 7.5 costModelService

| Field | Value |
|---|---|
| **Purpose** | Route quality evaluation via weighted composite cost function |
| **Location** | `services/costModelService.js` |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects |
|---|---|---|---|
| `routeCost(route, matrix, opts)` | NormalizedStop[], Matrix, options | number (cost) | None |
| `computeLatePenalty(route, matrix, opts)` | NormalizedStop[], Matrix, options | number (penalty) | None |
| `getLegMetrics(from, to, matrix)` | NormalizedStop, NormalizedStop, Matrix | { timeSeconds, distanceKm } | None |
| `getMatrixEntry(matrix, fromId, toId)` | Matrix (Map/obj), string, string | TravelMetrics or null | None |

### Cost Formula

```
cost = α·travelMinutes + β·distanceKm + γ·slaPenalty + δ·loadPenalty + ε·detourPenalty
```

Default weights: α=0.55, β=0.20, γ=0.15, δ=0.05, ε=0.05 (sum=1.00).

### Matrix Lookup Fallback Chain

1. Try `matrix.get(fromId, toId)` (function form).
2. Try `matrix.get(key)` (Map form with `"fromId::toId"` key).
3. Try `matrix[key]` (object property).
4. Compute Haversine fallback.

---

## 7.6 routingEngineService

| Field | Value |
|---|---|
| **Purpose** | Central orchestration for all routing operations |
| **Location** | `services/routingEngineService.js` |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects |
|---|---|---|---|
| `buildRoute(stops, matrix, opts)` | NormalizedStop[], Matrix, { strategy? } | NormalizedStop[] (ordered) | None |
| `optimizeRoute(route, matrix, opts)` | NormalizedStop[], Matrix, options | NormalizedStop[] (improved) | None |
| `evaluateRoute(stops, opts)` | StopInput[], { skipRoadMatrix? } | { route, cost, matrix } | Builds travel matrix (may call external API) |
| `evaluateInsertion(currentRoute, candidate, opts)` | NormalizedStop[], NormalizedStop, options | { currentCost, candidateCost, marginalCost, bestRoute } | Builds travel matrix |

### Strategy Dispatch

| Strategy Name | Implementation | Selection |
|---|---|---|
| `"insertion"` (default) | `insertionStrategy.buildInsertionRoute` | Always used (only strategy) |
| 2-opt optimization | `twoOptStrategy.optimizeTwoOpt` | Always applied after initial construction |

---

## 7.7 matrixCacheService

| Field | Value |
|---|---|
| **Purpose** | Travel matrix generation with multi-provider support and LRU caching |
| **Location** | `services/matrixCacheService.js` |
| **Lines** | 1115 |
| **Status** | IMPLEMENTED |

### Public Interface

| Method | Inputs | Outputs | Side Effects |
|---|---|---|---|
| `buildTravelMatrix(stops, opts)` | StopInput[], { skipRoadMatrix? } | TravelMatrixResult | External API calls, cache mutation |
| `getCachedTravelMetrics(from, to)` | StopInput, StopInput | TravelMetrics or null | Cache access order update |
| `normalizeStop(stop, fallbackId?)` | StopInput, string? | NormalizedStop or null | None |
| `deriveHaversineMetrics(from, to)` | NormalizedStop, NormalizedStop | TravelMetrics | None |
| `haversineDistanceKm(lat1, lng1, lat2, lng2)` | 4 numbers | number (km) | None |
| `getPairKey(fromId, toId)` | string, string | string (`"fromId::toId"`) | None |

### Cache Architecture

| Property | Value |
|---|---|
| Structure | In-memory `Map<string, { entry, expiry }>` |
| Key Format | `"fromId::toId"` (directional) |
| Eviction | LRU-approximated (oldest entries removed when max exceeded) |
| TTL | Configurable, default 60 minutes |
| Max Entries | Configurable, default 5000 |
| Shared | No — single-process only, lost on restart |

### Provider Integration

| Provider | Config Value | Fetch Function | API Format |
|---|---|---|---|
| OSRM | `"osrm"` | `fetchOsrmMatrix` | `/table/v1/driving/{coords}` |
| GraphHopper | `"graphhopper"` | `fetchGraphHopperMatrix` | `/api/1/matrix` |
| Mapbox | `"mapbox"` | `fetchMapboxMatrix` | `/directions-matrix/v1/mapbox/driving/{coords}` |
| Haversine | `"haversine"` (default) | None (computed locally) | N/A |

### Fallback Chain

1. Try configured matrix provider API.
2. On failure (network, parse, missing data) → silently fall back to Haversine.
3. Haversine uses configurable speed (default 35 kph) to estimate time from distance.

---

## 7.8 vrpSolverService

| Field | Value |
|---|---|
| **Purpose** | Fleet-level route optimization and re-optimization scheduling |
| **Location** | `services/vrpSolverService.js` |
| **Status** | STUBBED |

### Public Interface

| Method | Inputs | Outputs | Side Effects | Status |
|---|---|---|---|---|
| `optimizeDriverRoute(stops)` | StopInput[] | { route, cost } | Builds matrix, calls external API | IMPLEMENTED |
| `optimizeFleetRoutes(fleetRoutes)` | { agentId, stops }[] | { agentId, route, cost }[] | Batch optimization | IMPLEMENTED |
| `runOrToolsBatch(fleetRoutes)` | { agentId, stops }[] | Same as optimizeFleetRoutes | Intended for OR-Tools; **always falls back** | STUBBED |
| `scheduleReoptimization(runFn)` | function | intervalId | Starts setInterval scheduler | IMPLEMENTED (never called) |
| `stopReoptimizationScheduler()` | None | void | Clears interval | IMPLEMENTED (never called) |
| `shouldApplyImprovement(current, optimized, threshold)` | number, number, number | boolean | None | IMPLEMENTED |

---

## 7.9 Routing Strategies

### 7.9.1 insertionStrategy

| Field | Value |
|---|---|
| **Purpose** | Greedy cheapest-insertion TSP heuristic |
| **Location** | `routingStrategies/insertionStrategy.js` |
| **Status** | IMPLEMENTED |
| **Complexity** | O(n³) |
| **Side Effects** | None (pure function) |

**Algorithm:** Start with first stop as anchor. For each unvisited stop, try every insertion position. Select lowest-cost position. Repeat until all stops inserted.

### 7.9.2 twoOptStrategy

| Field | Value |
|---|---|
| **Purpose** | Local search improvement via segment reversal |
| **Location** | `routingStrategies/twoOptStrategy.js` |
| **Status** | IMPLEMENTED |
| **Complexity** | O(n²) per iteration, repeated until convergence |
| **Side Effects** | None (pure function) |

**Algorithm:** Iteratively try all (i,j) segment swaps. Accept if cost improves (1e-9 tolerance). Skip if route ≤ 3 stops. Preserve first stop position (index 0).

---

## 7.10 routingConfig

| Field | Value |
|---|---|
| **Purpose** | Centralized environment-driven configuration |
| **Location** | `config/routingConfig.js` |
| **Status** | IMPLEMENTED |

### Exports

| Export | Type | Description |
|---|---|---|
| `routingWeights` | Object | `{ alpha, beta, gamma, delta, epsilon }` |
| `routingConfig` | Object | All other config (providers, cache, thresholds, flags) |
| `toNumber(value, fallback)` | Function | Safe numeric parser |
| `toBoolean(value, fallback)` | Function | Truthy string parser ("1","true","yes","on") |

---

