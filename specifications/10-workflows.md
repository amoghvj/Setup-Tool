# 10. Workflow and Runtime Behavior Specification

## 10.1 Startup Lifecycle

### Backend Server (`server.js`)

| Step | Action | Failure Behavior |
|---|---|---|
| 1 | `require('dotenv').config()` — load `.env` | Missing `.env` → uses hardcoded defaults |
| 2 | `require()` all service modules | Missing module → crash |
| 3 | Create Express app | — |
| 4 | Apply middleware: Helmet → CORS → Morgan → `express.json()` → `express.static` | — |
| 5 | Define all route handlers (agent, delivery, pickup, SPA) | — |
| 6 | `mongoose.connect(MONGODB_URI)` | Connection failure → logs error, continues (API returns 500) |
| 7 | `app.listen(PORT)` | Port in use → logs error, `process.exit(1)` |
| 8 | Log "Server running on port X" | — |


### Middleware Execution Order (per request)

| Order | Middleware | Effect |
|---|---|---|
| 1 | Helmet | Sets security headers (CSP, X-Frame-Options, etc.) |
| 2 | CORS | Adds `Access-Control-*` headers (all origins allowed) |
| 3 | Morgan | Logs request in `combined` format to stdout |
| 4 | `express.json()` | Parses JSON request body |
| 5 | Route handler | Processes business logic |

### Mobile App Startup

| Step | Action | Failure Behavior |
|---|---|---|
| 1 | Expo loads `_layout.tsx` → ThemeProvider → Stack navigator | — |
| 2 | `(tabs)/index.tsx` mounts | — |
| 3 | Agent registration: POST `/api/agents/add` | 409 tolerated (already registered); other errors → Alert dialog |
| 4 | Request foreground location permission | Denied → Alert dialog, no tracking |
| 5 | Get initial position via `getCurrentPositionAsync` | — |
| 6 | Start `watchPositionAsync` (3s interval, 5m distance) | — |
| 7 | Start route polling (5s interval via `setInterval`) | — |

### Frontend Dashboard Startup

| Step | Action | Failure Behavior |
|---|---|---|
| 1 | Browser loads `/manager/` → `index.html` | — |
| 2 | Vite module loader runs `main.tsx` | — |
| 3 | `App` component mounts with `RouterProvider` | — |
| 4 | `DashboardLayout` renders, `useLiveLogisticsData` hook fires | — |
| 5 | Hook fetches `/api/agents` and `/api/deliveries` in parallel | Fetch error → logs to console, `isLoading` set to false |
| 6 | Maps backend data to UI types; renders components | Missing fields → uses fallback defaults (e.g., lat 40.7128) |

---

## 10.2 Request Lifecycle (Backend)

### Typical Request Flow

```
Client → HTTP Request
  → Helmet (headers)
  → CORS (headers)
  → Morgan (log)
  → express.json (parse body)
  → Route Handler
    → try {
        → Input validation (manual field checks)
        → Service call(s)
          → MongoDB operations (with or without transaction)
        → res.json({ success: true, ...data })
      } catch (err) {
        → res.status(500).json({ error: err.message })
      }
```

### Transaction-Wrapped Request Pattern

Used by: pickup, complete, cancel, assign.

```
1. Start MongoDB session + transaction (withSession)
2. Perform multi-document reads
3. Validate business rules
4. Perform multi-document writes
5. Sync pointers (_syncPointersFromArray)
6. Commit transaction (finalizeSession)
7. Post-transaction: sync global state (non-transactional)
8. Return response
```

On error: abort transaction → propagate error → return 500.

---

## 10.3 Major Workflows

### WF-001: Server Installation

| Step | Actor | Action | Side Effects |
|---|---|---|---|
| 1 | User | Launches Setup Tool | GUI displayed |
| 2 | User | Clicks "Set Up Server" | Form view shown |
| 3 | User | Fills optional env vars, clicks "Continue" | — |
| 4 | System | Opens directory selection dialog | — |
| 5 | System | `shutil.copytree(resources/server, dest/server)` | Files copied |
| 6 | System | `update_env_file()` appends vars to `.env` | `.env` modified |
| 7 | System | Checks Node.js on PATH | Warning if missing |
| 8 | System | Shows success, returns to main view | — |

**Failure Paths:** FileExistsError (folder exists) → warning dialog. FileNotFoundError (bundled server missing) → error dialog.

### WF-002: Delivery Assignment

| Step | Service | Action |
|---|---|---|
| 1 | server.js | Validate `coords` |
| 2 | assignmentService | `assignAgent(coords)` — retrieve all agents |
| 3 | assignmentService | Filter for available agents |
| 4 | assignmentService | For each: `buildCommittedStops()` → current route |
| 5 | routingEngineService | `evaluateInsertion()` → build matrix → insertion → 2-opt → marginal cost |
| 6 | assignmentService | Add busy-driver penalty for non-idle agents |
| 7 | assignmentService | Select lowest marginal cost agent |
| 8 | deliveryService | `assignDriver()` → create delivery → queue to pending |
| 9 | deliveryService | Compute next pickup location |
| 10 | server.js | Return agent state |

### WF-003: Pickup Processing

| Step | Service | Action | Transactional |
|---|---|---|---|
| 1 | server.js | Validate `agent_id` | No |
| 2 | deliveryService | Validate: no active deliveries, has pending (stateService.getAgent) | No |
| 3 | deliveryService | Retrieve pending delivery documents (stateService.getDeliveriesByIds) | No |
| 4 | deliveryService | Normalize to routing stops | No |
| 5 | routingEngineService | `evaluateRoute()` — build matrix → insertion → 2-opt → optimized ordering | No |
| 6 | deliveryService | Activate optimized route (stateService.setActiveRoute) | Delegated |
| 7 | deliveryService | Clear nextPickupLocation (stateService.clearNextPickupLocation) | Delegated |
| 8 | deliveryService | Sync global state (stateService.syncGlobalFirstDeliveries) | No |

### WF-004: Mobile App Lifecycle

| Step | Trigger | Action | Interval |
|---|---|---|---|
| 1 | App mount | Register agent (POST `/api/agents/add`) | Once |
| 2 | Permission granted | Start GPS watch | 3s / 5m |
| 3 | GPS update | Report to POST `/api/agents/location` | On each update |
| 4 | Registration + GPS ready | Poll GET `/api/agents/route` | Every 5s |
| 5 | Route fingerprint changes | Rebuild Google Directions polyline | On change |
| 6 | User taps "Mark Delivered" | POST `/api/deliveries/complete` | On action |
| 7 | User taps "Picked Up" | POST `/api/deliveries/pickup` | On action |

---

## 10.4 State Transitions

### Delivery Lifecycle (Derived — not stored)

| From State | Event | To State | Trigger |
|---|---|---|---|
| (not exists) | `createDelivery()` | UNASSIGNED | POST `/api/deliveries/add` |
| UNASSIGNED | `addToPending()` | PENDING_PICKUP | Assignment |
| PENDING_PICKUP | `processPickup()` | IN_TRANSIT | POST `/api/deliveries/pickup` |
| IN_TRANSIT | `completeDelivery()` | DELETED | POST `/api/deliveries/complete` |
| PENDING_PICKUP or IN_TRANSIT | `cancelDelivery()` | DELETED | POST `/api/deliveries/cancel` |

**Derivation logic:** Status is determined by queue membership:
- `agentId == null` → UNASSIGNED
- In `agent.pendingPickupDeliveries` → PENDING_PICKUP
- In `agent.activeDeliveries` → IN_TRANSIT
- Document deleted → COMPLETED/CANCELLED (indistinguishable)

### Agent Availability (Derived)

| From State | Event | To State |
|---|---|---|
| AVAILABLE | Delivery assigned to pending | BUSY_PENDING |
| BUSY_PENDING | Pickup processed | BUSY_ACTIVE |
| BUSY_ACTIVE | All deliveries completed | AVAILABLE |
| BUSY_PENDING | All pending cancelled | AVAILABLE |

**Derivation:** `isDriverAvailable(agent)` returns `true` iff both `activeDeliveries.length === 0` and `pendingPickupDeliveries.length === 0`.

---

## 10.5 Polling and Async Behavior

| Component | Mechanism | Interval | Trigger |
|---|---|---|---|
| Mobile: route polling | `setInterval(fetchRoute, 5000)` | 5 seconds | After registration + GPS ready |
| Mobile: location reporting | `watchPositionAsync` callback → fire-and-forget fetch | 3s / 5m | GPS update |
| Mobile: polyline rebuild | Google Directions API call | On route fingerprint change | Route data poll |
| Dashboard: data fetch | `useEffect` → `fetchData()` | Once on mount | Component mount |
| VRP scheduler (STUBBED) | `setInterval(runFn, interval)` | Configurable (default 15 min) | Never activated |

### Route Fingerprint Logic (Mobile)

Polyline is only rebuilt when route content changes, determined by:
```
fingerprint = JSON.stringify({
  orders: deliveries.map(d => d.orderId),
  pickup: nextPickupLocation
})
```
Compared against `lastRouteFingerprintRef.current`. Prevents unnecessary Google API calls.

---

## 10.6 Cache Lifecycle

| Event | Action |
|---|---|
| Server start | Cache is empty (in-memory Map) |
| `buildTravelMatrix()` called | Entries added via `cacheEntry()` |
| `getCachedTravelMetrics()` called | Entry returned if exists and not expired |
| Entry age > TTL | Removed on next access attempt |
| Cache size > max entries | Oldest entries evicted to make room |
| Server restart | All cache lost |
| External data changes | No invalidation — cache unaware of changes |

---

## 10.7 Shutdown Behavior

| Component | Shutdown Mechanism | Cleanup |
|---|---|---|
| Backend server | Process termination (SIGINT/SIGTERM) | No graceful shutdown handler. In-flight requests may be dropped. MongoDB connections not explicitly closed. |
| PM2 managed | PM2 sends SIGINT → waits → SIGKILL | `autorestart: true` restarts process |
| Mobile app | OS background/kill | Location watch subscription removed via cleanup function |
| Dashboard | Browser tab close | No cleanup needed (stateless) |

---

