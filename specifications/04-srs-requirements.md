# 4. Standard SRS Requirements Layer

## 4.1 Functional Requirements

### FR-001: Agent Registration

| Field | Value |
|---|---|
| **ID** | FR-001 |
| **Title** | Agent Registration |
| **Statement** | The system shall allow creation of delivery agents with unique identifiers. |
| **Trigger** | POST `/api/agents/add` |
| **Inputs** | `{ agent_id: string }` |
| **Processing** | Validate uniqueness → create Agent document with empty queues. |
| **Outputs** | `{ success: true, agent: AgentDocument }` |
| **Exceptions** | 500 if agent already exists. 400 if `agent_id` missing. |
| **Dependencies** | stateService.createAgent |
| **Priority** | High |
| **Status** | IMPLEMENTED |

### FR-002: Delivery Creation and Auto-Assignment

| Field | Value |
|---|---|
| **ID** | FR-002 |
| **Title** | Delivery Creation with Automatic Agent Assignment |
| **Statement** | The system shall create a delivery and automatically assign it to the optimal agent. |
| **Trigger** | POST `/api/deliveries/add` |
| **Inputs** | `{ order_id?: string, coords: { lat: number, lng: number } }` |
| **Processing** | (1) assignmentService scores all agents by marginal insertion cost via routingEngineService.evaluateInsertion. (2) Prefers idle agents; applies busy-driver penalty to occupied agents. (3) Creates DeliveryAssignment via stateService.createDelivery. (4) Queues to selected agent via assignmentService.queueDeliveryToAgent → stateService.addToPending. (5) Updates nextPickupLocation via stateService.setNextPickupLocation. |
| **Outputs** | `{ success: true, agentId: string, agent: AgentDocument }` |
| **Exceptions** | 400 if coords missing. 500 if no agents exist. |
| **Dependencies** | assignmentService.assignAgent, deliveryService.assignDriver, stateService.createDelivery, stateService.addToPending, routingEngineService.evaluateInsertion |
| **Priority** | High |
| **Status** | IMPLEMENTED |

### FR-003: Pickup Processing

| Field | Value |
|---|---|
| **ID** | FR-003 |
| **Title** | Process Pickup Batch |
| **Statement** | Moves an agent's pending deliveries into their active route after optimization. |
| **Trigger** | POST `/api/deliveries/pickup` |
| **Inputs** | `{ agent_id: string }` |
| **Processing** | Validate no active deliveries remain → retrieve pending via stateService.getDeliveriesByIds → optimize route order via routingEngineService.evaluateRoute → activate via stateService.setActiveRoute → clear nextPickupLocation via stateService.clearNextPickupLocation → sync global state via stateService.syncGlobalFirstDeliveries. |
| **Outputs** | `{ success: true, agent: AgentDocument }` |
| **Exceptions** | Error if active deliveries remain or no pending exist. |
| **Dependencies** | deliveryService.processPickup, stateService.setActiveRoute, routingEngineService.evaluateRoute, stateService.clearNextPickupLocation, stateService.syncGlobalFirstDeliveries |
| **Priority** | High |
| **Status** | IMPLEMENTED |

### FR-004: Delivery Completion

| Field | Value |
|---|---|
| **ID** | FR-004 |
| **Title** | Complete Current Delivery |
| **Statement** | Removes the first active delivery from an agent's route and deletes it. |
| **Trigger** | POST `/api/deliveries/complete` |
| **Inputs** | `{ agent_id: string }` |
| **Processing** | Complete first active via stateService.completeFirstActive (atomically removes and deletes). Update nextPickupLocation: if active becomes empty and pending is non-empty, set from first pending delivery; if both empty, clear. Sync global state via stateService.syncGlobalFirstDeliveries. |
| **Outputs** | `{ success: true, agent: AgentDocument }` |
| **Exceptions** | Error if no active deliveries. |
| **Dependencies** | deliveryService.completeDelivery, stateService.completeFirstActive, stateService.setNextPickupLocation, stateService.syncGlobalFirstDeliveries |
| **Priority** | High |
| **Status** | IMPLEMENTED |

### FR-005: Delivery Cancellation

| Field | Value |
|---|---|
| **ID** | FR-005 |
| **Title** | Cancel Delivery |
| **Statement** | Removes a delivery from its agent's queue and deletes it. |
| **Trigger** | POST `/api/deliveries/cancel` |
| **Inputs** | `{ order_id: string }` |
| **Processing** | Cancel and delete via stateService.cancelAndDeleteDelivery. If was active and remaining > 0: reroute via routingEngineService.evaluateRoute → persist via stateService.replaceActiveRoute → clear nextPickupLocation. If active becomes empty and pending non-empty: set nextPickupLocation from pending. If both empty: clear nextPickupLocation. Sync global state. |
| **Outputs** | `{ success: true, agent: AgentDocument }` |
| **Exceptions** | Error if delivery not found. |
| **Dependencies** | deliveryService.cancelDelivery, stateService.cancelAndDeleteDelivery, routingEngineService.evaluateRoute, stateService.replaceActiveRoute, stateService.syncGlobalFirstDeliveries |
| **Priority** | High |
| **Status** | IMPLEMENTED |

### FR-006: Agent Location Tracking

| Field | Value |
|---|---|
| **ID** | FR-006 |
| **Title** | Agent Live Location Updates |
| **Statement** | Accept and store real-time GPS coordinates for agents. |
| **Trigger** | POST `/api/agents/location` |
| **Inputs** | `{ agent_id: string, coords: { lat: number, lng: number } }` |
| **Processing** | Upsert AgentLocation document via stateService.upsertAgentLocation. |
| **Outputs** | `{ success: true, location: AgentLocationDocument }` |
| **Exceptions** | 400 if any field missing. |
| **Dependencies** | stateService.upsertAgentLocation |
| **Priority** | Medium |
| **Status** | IMPLEMENTED |

### FR-007: Manual Delivery Reassignment

| Field | Value |
|---|---|
| **ID** | FR-007 |
| **Title** | Assign Existing Delivery to Different Agent |
| **Statement** | Transfer a delivery from one agent to another. |
| **Trigger** | POST `/api/deliveries/assign` |
| **Inputs** | `{ delivery_id: string, agent_id: string }` |
| **Processing** | Unassign from current owner via stateService.unassignDelivery → add to target's pending queue via stateService.addToPending. Delegated through assignmentService.moveDeliveryToAgent. |
| **Outputs** | `{ success: true, ...result }` |
| **Exceptions** | 400 if fields missing. |
| **Dependencies** | deliveryService.assignExistingDelivery, assignmentService.moveDeliveryToAgent, stateService.unassignDelivery, stateService.addToPending |
| **Priority** | Medium |
| **Status** | IMPLEMENTED |

### FR-008: Pickup Location Management

| Field | Value |
|---|---|
| **ID** | FR-008 |
| **Title** | CRUD for Pickup Locations |
| **Statement** | Manage static pickup hub/warehouse locations. |
| **Trigger** | POST `/api/pickups/add`, GET `/api/pickups/:id`, GET `/api/pickups`, DELETE `/api/pickups/:id` |
| **Inputs** | Varies by operation (see Section 9) |
| **Dependencies** | stateService pickup methods |
| **Priority** | Medium |
| **Status** | IMPLEMENTED |

### FR-009: Server Installation via Setup Tool

| Field | Value |
|---|---|
| **ID** | FR-009 |
| **Title** | Desktop Server Installer |
| **Statement** | Copy bundled server folder to user-selected directory and write environment variables. |
| **Trigger** | User clicks "Set Up Server" → fills form → selects directory |
| **Processing** | Copy `resources/server/` via `shutil.copytree` → append env vars to `.env` (skip existing keys) → warn if Node.js not on PATH. |
| **Dependencies** | Python stdlib |
| **Priority** | High |
| **Status** | IMPLEMENTED |
| **Deviation** | Env vars written (`EXAMPLE_API_KEY`, `EXAMPLE_ENDPOINT`, `MONGODB_URI`) are placeholder names; real routing vars not exposed in UI. |

### FR-010: Manager Dashboard

| Field | Value |
|---|---|
| **ID** | FR-010 |
| **Title** | Web-Based Logistics Dashboard |
| **Statement** | A React SPA providing fleet management UI. |
| **Pages** | Dashboard Overview, Live Driver Tracking, Delivery Management, Route Monitoring, Analytics, Settings |
| **Data Source** | `useLiveLogisticsData` hook fetches from `/api/agents` and `/api/deliveries`. KPIs/analytics use hardcoded mock data. |
| **Dependencies** | Frontend build, backend API |
| **Priority** | Medium |
| **Status** | PARTIAL — live data hook fetches real data but KPI/analytics render mock values from `mock-data.ts` |

### FR-011: Mobile Driver App

| Field | Value |
|---|---|
| **ID** | FR-011 |
| **Title** | Driver-Facing Mobile Application |
| **Statement** | Expo app for delivery agents to view routes, complete deliveries, trigger pickups. |
| **Features** | Agent auto-registration, GPS tracking (3s/5m interval), route polling (5s), Google Directions polyline, "Mark Delivered" and "Picked Up" actions. |
| **Dependencies** | Backend API, Google Directions API, expo-location |
| **Priority** | High |
| **Status** | IMPLEMENTED |

---

## 4.2 Non-Functional Requirements

### NFR-001: Routing Performance

| Field | Value |
|---|---|
| **Quality Attribute** | Performance |
| **Target** | Route optimization for up to 20 stops |
| **Measurement** | Integration test validates 20-stop optimization |
| **Status** | IMPLEMENTED (no explicit latency benchmark) |
| **Notes** | 2-opt is O(n²) per iteration; acceptable for small fleets |

### NFR-002: Concurrency Safety

| Field | Value |
|---|---|
| **Quality Attribute** | Reliability |
| **Target** | Concurrent assignment must not produce duplicate queue entries |
| **Measurement** | 10-simultaneous-operation test in `concurrency.integration.test.js` |
| **Status** | IMPLEMENTED |
| **Notes** | MongoDB transactions used for multi-document mutations via stateService primitives |

### NFR-003: Matrix Cache Efficiency

| Field | Value |
|---|---|
| **Quality Attribute** | Performance |
| **Target** | Avoid redundant external matrix API calls |
| **Measurement** | In-memory LRU+TTL cache; max 5000 entries, 60 min default TTL |
| **Status** | IMPLEMENTED |

### NFR-004: Deployment Flexibility

| Field | Value |
|---|---|
| **Quality Attribute** | Portability |
| **Target** | Deployable locally, on VPS, or serverlessly |
| **Measurement** | PM2 config, Vercel config, local dev all present |
| **Status** | IMPLEMENTED |

---

## 4.3 Business Rules

| ID | Rule | Applies To | Location | Status |
|---|---|---|---|---|
| BR-001 | Agent is "available" iff both `activeDeliveries` and `pendingPickupDeliveries` are empty | assignmentService.isAvailable | `assignmentService.js:50-55` | IMPLEMENTED |
| BR-002 | Agent cannot pick up while active deliveries remain | deliveryService.processPickup | `deliveryService.js` | IMPLEMENTED |
| BR-003 | Cost coefficients (α,β,γ,δ,ε) should sum to ~1.0 | routingConfig | `config/routingConfig.js` defaults | IMPLEMENTED (convention, not validated) |
| BR-004 | Idle agents preferred; busy agents receive penalty (default 1000) | assignmentService scoring | `assignmentService.js` | IMPLEMENTED |
| BR-005 | Deliveries cannot be deleted while assigned to an agent | stateService.deleteDelivery | `stateService.js` | IMPLEMENTED |
| BR-006 | A delivery may only belong to one agent at a time | stateService.addToPending | `stateService.js` | IMPLEMENTED |
| BR-007 | Delivery status is derived contextually from queue membership, not persisted | Derived via queue inspection | All lifecycle services | IMPLEMENTED |
| BR-008 | Pointer chain (prevDeliveryId/nextDeliveryId) must be synchronized after every queue mutation | stateService._syncPointersFromArray | `stateService.js` | IMPLEMENTED |
| BR-009 | nextPickupLocation is set to the first pending delivery's destination when active becomes empty and pending is non-empty | deliveryService.completeDelivery, deliveryService.cancelDelivery | `deliveryService.js` | IMPLEMENTED |
| BR-010 | nextPickupLocation is cleared after pickup activation (agent is en route) | deliveryService.processPickup | `deliveryService.js` | IMPLEMENTED |
| BR-011 | All database mutations must go through stateService primitives; lifecycle services are orchestration-only | Architecture constraint | All services | IMPLEMENTED |

---

## 4.4 Constraints

| ID | Type | Statement | Impact |
|---|---|---|---|
| CON-001 | Technical | MongoDB required for persistence | Server cannot perform data operations without MongoDB |
| CON-002 | Technical | Node.js ≥ 18 required (native `fetch`) | External matrix providers fail on older versions |
| CON-003 | Platform | Setup Tool targets Windows only (`.bat` launcher, PyInstaller exe) | No macOS/Linux installer |
| CON-004 | External | Google Maps API key required for mobile route polylines | Mobile route rendering fails without valid key |
| CON-005 | Technical | CommonJS modules throughout server | Limits tree-shaking and modern module features |
| CON-006 | Technical | Single-process monolith | No horizontal scaling, no worker threads |
| CON-007 | Data | No delivery status field stored | Status derived from queue membership; no direct status queries |
| CON-008 | Architecture | stateService is the single mutation authority | No service may directly import or mutate mongoose models for delivery/agent state |
| CON-009 | Architecture | Strategy-based routing architecture | Route algorithms are interchangeable strategies; routingEngineService is the only routing orchestration layer |
| CON-010 | Architecture | Pointer-backed queue structure | Active and pending queues use arrays backed by bidirectional pointer chains (prevDeliveryId/nextDeliveryId) |

---

## 4.5 Assumptions and Dependencies

| Name | Type | Role | Required | Failure Impact |
|---|---|---|---|---|
| MongoDB | Database | Primary persistence | Critical | All data operations return 500 |
| Node.js ≥ 18 | Runtime | Server execution | Critical | Server cannot start |
| Python 3.x | Runtime | Setup Tool | Build-time | Cannot build/run installer |
| PyInstaller | Build tool | Compile to exe | Distribution | No standalone exe |
| OSRM/GraphHopper/Mapbox | External API | Road distances | Optional | Falls back to Haversine |
| Google Directions API | External API | Mobile polylines | Optional | Mobile shows no route line |
| Expo/React Native | Framework | Mobile app | Critical (mobile) | No mobile app |
| React/Vite | Framework | Dashboard | Critical (web) | No web dashboard |

---

