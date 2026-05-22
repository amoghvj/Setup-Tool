# 1. Document Control

**Document Title:** OptiRoute Pro — Current-State Software Specification
**Version:** 1.1.0
**Status:** Current — Derived from codebase analysis performed 2026-05-15. Refined for full compliance.
**Authors / Maintainers:** Amogh Vijay (project owner)
**Last Updated:** 2026-05-15

## 1.1 Change Summary

| Version | Date | Description |
|---|---|---|
| 1.0.0 | 2026-05-15 | Initial specification generated from full codebase analysis. |
| 1.1.0 | 2026-05-15 | Normalized formatting, expanded runtime analysis, added internal interfaces, standardized status taxonomy, added failure analysis, expanded traceability. |

---

# 2. Purpose and Scope

## 2.1 Purpose of the Document

This specification describes the **current implemented state** of the OptiRoute Pro system. It serves as the authoritative reference for what the system actually does, how it is built, and where implementation diverges from documented intent. It is optimized for LLM consumption via normalized, repeatable structural patterns.

## 2.2 Scope of the System

The OptiRoute Pro system consists of four interconnected subsystems:

| Subsystem | Type | Purpose |
|---|---|---|
| **Setup Tool** | Python/tkinter desktop app | Deploys the server component to a user's machine |
| **Backend Server** | Node.js/Express REST API | Manages agents, deliveries, routing optimization, pickups |
| **Manager Dashboard** | React/Vite SPA (at `/manager/`) | Logistics management UI with data visualization |
| **Agent Mobile App** | React Native/Expo mobile app | Driver-facing GPS tracking, route visualization, delivery actions |

## 2.3 Out of Scope

- Real-time push notifications (no WebSocket or SSE).
- User authentication and authorization.
- Payment processing or invoicing.
- Customer-facing tracking interfaces.
- Multi-tenancy or organization-level separation.
- Offline-first mobile functionality.

## 2.4 Audience

- Developers maintaining or extending the system.
- LLM-based analysis tools consuming this specification.
- Reviewers evaluating system architecture.

## 2.5 Reading Guidance

1. **Section 3** — High-level system shape.
2. **Section 5** — What is actually built vs. planned (start here for reality check).
3. **Sections 6–7** — Architecture and module deep-dive.
4. **Section 9** — All REST endpoints and internal service contracts.
5. **Section 10** — Runtime lifecycle and execution flows.
6. **Section 15** — Known issues and technical debt.

---

# 3. System Summary

## 3.1 High-Level System Goal

OptiRoute Pro automates delivery logistics: it assigns deliveries to drivers using marginal insertion cost analysis, optimizes routes using cheapest-insertion + 2-opt heuristics, and provides fleet visibility through a web dashboard and a mobile driver app. The Setup Tool exists as a standalone desktop utility that deploys the backend server onto target machines.

## 3.2 Core Capabilities

| ID | Capability | Description | Status |
|---|---|---|---|
| CAP-01 | Automated Agent Assignment | Selects optimal driver via marginal insertion cost with busy-driver penalty | IMPLEMENTED |
| CAP-02 | Route Optimization | Greedy insertion TSP + iterative 2-opt segment swaps | IMPLEMENTED |
| CAP-03 | Composite Cost Scoring | Weighted formula: `α·time + β·distance + γ·SLA + δ·load + ε·detour` | IMPLEMENTED |
| CAP-04 | Multi-Provider Distance Matrix | OSRM, GraphHopper, Mapbox with Haversine fallback | IMPLEMENTED |
| CAP-05 | In-Memory LRU Cache | Pairwise travel metrics with TTL and max-entry eviction | IMPLEMENTED |
| CAP-06 | Delivery Lifecycle | Create → assign → pickup → deliver → complete/cancel via stateService primitives and routingEngineService orchestration | IMPLEMENTED |
| CAP-07 | Agent GPS Tracking | Mobile app reports live location; backend stores latest position | IMPLEMENTED |
| CAP-08 | Manager Dashboard | React SPA: overview, tracking, deliveries, routes, analytics, settings | PARTIAL (mock data in KPIs/analytics) |
| CAP-09 | Desktop Installer | Python/tkinter copies server bundle, writes `.env` | IMPLEMENTED |
| CAP-10 | Fleet Re-optimization | VRP solver scheduler for batch re-optimization | STUBBED (never activated) |

## 3.3 System Type

Multi-component platform:
- **Desktop tool** — Python/tkinter, compiled via PyInstaller.
- **Backend service** — Node.js/Express REST API, single-process monolith.
- **Web application** — React SPA served by backend at `/manager/`.
- **Mobile application** — React Native/Expo.

## 3.4 Primary Actors

| Actor | Role | Interface |
|---|---|---|
| Fleet Manager | Monitors drivers, manages deliveries, views analytics | Manager Dashboard (web) |
| Delivery Agent | Views assigned route, marks deliveries complete, triggers pickups | Mobile App |
| System Administrator | Installs server, configures environment | Setup Tool (desktop) |
| External Matrix Provider | Provides road-network distances | HTTP API (OSRM/GraphHopper/Mapbox) |

## 3.5 Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Setup Tool | Python 3, tkinter, shutil, subprocess | 3.x |
| Setup Build | PyInstaller | N/A |
| Backend Runtime | Node.js | ≥ 18 (native fetch required) |
| Backend Framework | Express | 4.x |
| ODM | Mongoose | 8.x |
| Database | MongoDB | Compatible with Mongoose 8 |
| Backend Middleware | Helmet, CORS, Morgan | Latest |
| Frontend Framework | React | 18.3.1 |
| Frontend Build | Vite | 6.3.5 |
| Frontend CSS | TailwindCSS | 4.1.12 |
| Frontend Routing | React Router | 7.13.0 |
| Frontend Charts | Recharts | 2.15.2 |
| Frontend Maps | Leaflet + react-leaflet | 1.9.4 / 5.0.0 |
| Frontend UI Kit | MUI 7, Radix UI, shadcn/ui | Mixed |
| Mobile Framework | React Native | 0.81.5 |
| Mobile Platform | Expo | 54 |
| Mobile Maps | react-native-maps | 1.20.1 |
| Mobile Navigation | React Navigation | 7.x |
| Deployment (VPS) | PM2 | via ecosystem.config.js |
| Deployment (Serverless) | Vercel | via vercel.json |

## 3.6 Deployment Model

| Target | Mechanism | Config |
|---|---|---|
| Local development | `node server.js` or `npm run dev` | `.env` via dotenv |
| VPS production | PM2 process manager | `ecosystem.config.js` (autorestart, 256M max memory) |
| Serverless | Vercel | `vercel.json` (routes to `server.js`) |
| Mobile dev | Expo dev server | `agent/.env` |
| Setup Tool | PyInstaller-compiled `.exe` | Bundled resources |

---

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

# 5. Current-State Overview

## 5.1 As-Built Architecture

### Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Setup Tool    │     │  Agent Mobile App │     │ Manager Dashboard │
│  (Python/Tk)    │     │  (Expo/RN)        │     │ (React/Vite SPA)  │
└────────┬────────┘     └────────┬──────────┘     └────────┬──────────┘
         │                       │                          │
         │ Copies files          │ HTTP + GPS poll          │ HTTP fetch
         │                       │                          │
         │              ┌────────▼──────────────────────────▼─────────┐
         │              │         Express Backend (server.js)          │
         └──────────────►  API Layer → Service Layer → Models → MongoDB│
                        │  Static: /manager/* → frontend/dist/         │
                        └──────────────────────────────────────────────┘
```

### Service Architecture

```
┌──────────────────────────────────────────────────────┐
│                    server.js (API Layer)               │
│  Routes → deliveryService / assignmentService          │
│           stateService (read-only queries)              │
└──────┬─────────────┬─────────────┬───────────────────┘
       │             │             │
       ▼             ▼             ▼
┌────────────┐ ┌───────────┐ ┌───────────────────┐
│ delivery   │ │ assignment│ │   stateService     │
│ Service    │ │ Service   │ │ (mutation layer)   │
│ (lifecycle │ │ (agent    │ │ - queue ops        │
│  orchestr.)│ │  scoring) │ │ - pointer sync     │
└─────┬──────┘ └─────┬─────┘ │ - delivery CRUD   │
      │               │       │ - agent CRUD       │
      │               │       │ - location ops     │
      ▼               ▼       │ - global sync      │
┌──────────────────────┐      └────────┬────────────┘
│ routingEngineService │               │
│ (routing orchestr.)  │               ▼
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

# 8. Data Model Specification

## 8.1 Entity Inventory

| Entity | Collection | Location | Status |
|---|---|---|---|
| Agent | `agents` | `models/Agent.js` | IMPLEMENTED |
| AgentLocation | `agentlocations` | `models/AgentLocation.js` | IMPLEMENTED |
| DeliveryAssignment | `deliveryassignments` | `models/DeliveryAssignment.js` | IMPLEMENTED |
| PickupLocation | `pickuplocations` | `models/PickupLocation.js` | IMPLEMENTED |
| SystemState | `systemstates` | `models/SystemState.js` | IMPLEMENTED |

---

## 8.2 Entity Definitions

### Agent

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `agentId` | String | Yes | — | Yes (unique) | External identifier |
| `activeDeliveries` | ObjectId[] | No | [] | No | Ordered active route (ref: DeliveryAssignment) |
| `pendingPickupDeliveries` | ObjectId[] | No | [] | No | Pending pickup queue (ref: DeliveryAssignment) |
| `nextPickupLocation` | { lat: Number, lng: Number } | No | null | No | Next pickup hub coordinates |
| `createdAt` | Date | Auto | — | No | Mongoose timestamp |
| `updatedAt` | Date | Auto | — | No | Mongoose timestamp |

**Invariants:**
- `agentId` is unique across all agents.
- Array ordering is the single source of truth for route sequence.
- `pendingPickupDeliveries` is append-only until pickup processing.
- A delivery ID may appear in at most one array across all agents.

### AgentLocation

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `agentId` | String | Yes | — | Yes (unique) | External identifier (no Mongoose ref) |
| `location.lat` | Number | Yes | — | No | Latitude |
| `location.lng` | Number | Yes | — | No | Longitude |
| `updatedAt` | Date | No | Date.now | No | Last report time |

**Invariants:**
- At most one location document per `agentId` (upsert semantics).
- No referential integrity enforcement between Agent and AgentLocation (string match only).

### DeliveryAssignment

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `orderId` | String | No | — | Yes (sparse) | External order identifier |
| `agentId` | String | No | null | No | Assigned agent (null = unassigned) |
| `destination.lat` | Number | Yes | — | No | Delivery latitude |
| `destination.lng` | Number | Yes | — | No | Delivery longitude |
| `prevDeliveryId` | ObjectId | No | null | No | Pointer to previous delivery (derived) |
| `nextDeliveryId` | ObjectId | No | null | No | Pointer to next delivery (derived) |
| `createdAt` | Date | Auto | — | No | Mongoose timestamp |
| `updatedAt` | Date | Auto | — | No | Mongoose timestamp |

**Invariants:**
- Status is NOT stored — derived from queue membership (see Section 10.2).
- Pointer fields are derived from Agent arrays; rebuilt by `_syncPointersFromArray` on every mutation.
- A delivery with non-null `agentId` cannot be deleted.
- `orderId` sparse index allows null/missing values without conflict.

### PickupLocation

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `pickupId` | String | Yes | — | Yes (unique) | External pickup identifier |
| `name` | String | Yes | — | No | Human-readable name |
| `location.lat` | Number | Yes | — | No | Latitude |
| `location.lng` | Number | Yes | — | No | Longitude |

**Invariants:**
- `pickupId` is unique.

### SystemState

| Field | Type | Required | Default | Indexed | Description |
|---|---|---|---|---|---|
| `configId` | String | Yes | `'global_optiroute_state'` | Yes (unique) | Singleton identifier |
| `firstDeliveries` | ObjectId[] | No | [] | No | First active delivery of each agent |
| `pickupPoints` | [{ lat, lng }] | No | [] | No | Global pickup coordinates |

**Invariants:**
- Singleton document pattern — exactly one document with `configId = 'global_optiroute_state'`.
- Updated via upsert from `deliveryService.syncGlobalFirstDeliveries()`.

---

## 8.3 Relationship Map

| From | To | Cardinality | Mechanism | Integrity |
|---|---|---|---|---|
| Agent → DeliveryAssignment | One-to-Many | ObjectId arrays (`activeDeliveries`, `pendingPickupDeliveries`) | Application-enforced |
| DeliveryAssignment → Agent | Many-to-One | `agentId` string field | Application-enforced |
| DeliveryAssignment → DeliveryAssignment | Self-referencing doubly-linked list | `prevDeliveryId`, `nextDeliveryId` ObjectId refs | Derived (rebuilt from arrays) |
| Agent ↔ AgentLocation | One-to-One | `agentId` string matching | No referential integrity |
| SystemState → DeliveryAssignment | One-to-Many | `firstDeliveries` ObjectId array | Application-enforced |

**Note:** No Mongoose `ref` population is used anywhere. All joins are manual lookups.

---

## 8.4 Data Lifecycle

| Event | Agent | DeliveryAssignment | AgentLocation | SystemState |
|---|---|---|---|---|
| **Created** | POST `/api/agents/add` | POST `/api/deliveries/add` | POST `/api/agents/location` (upsert) | Auto on first sync |
| **Updated** | On assign, pickup, complete, cancel | On assign (agentId), pointer sync | On each location report | On every delivery lifecycle event |
| **Deleted** | Never (no endpoint) | On completion or cancellation | Never (no endpoint) | Never |

### Orphan Prevention

| Scenario | Mechanism |
|---|---|
| Delivery deleted while assigned | `stateService.deleteDelivery` throws if `agentId` is non-null |
| Agent deleted with deliveries | No agent delete endpoint exists — prevented by omission |
| Pointer inconsistency | `_syncPointersFromArray` rebuilds all pointers from authoritative array on every mutation |

### Consistency Guarantees

| Guarantee | Mechanism | Scope |
|---|---|---|
| Agent queue ↔ delivery ownership | MongoDB transactions via `withSession` | Within single service call |
| Pointer ↔ array consistency | Pointers rebuilt on every array mutation | Eventual (derived) |
| SystemState ↔ agent state | `syncGlobalFirstDeliveries` called after lifecycle changes | Eventual (no transaction) |
| Cache ↔ reality | TTL-based expiry; no invalidation on data change | Best-effort |

### Stale State Risks

| Condition | Impact | Mitigation |
|---|---|---|
| SystemState not synced after crash mid-transaction | `firstDeliveries` may reference deleted deliveries | None — requires manual reconciliation |
| AgentLocation not updated (mobile offline) | Backend has stale GPS position | None — no staleness detection |
| Cache TTL not expired but road conditions changed | Cost estimates use outdated travel times | TTL eviction (default 60 min) |
| Pointer fields out of sync with arrays | Linked-list traversal returns incorrect order | Pointers are always rebuilt; reading arrays is authoritative |

### Retention Behavior

| Entity | Retention | Cleanup |
|---|---|---|
| Agent | Permanent (no delete) | None |
| AgentLocation | Permanent (no delete) | None |
| DeliveryAssignment | Deleted on completion/cancellation | deliveryService removes document |
| PickupLocation | Deleted on explicit delete request | stateService removes document |
| SystemState | Permanent singleton | Updated in-place |

---

# 9. API and Interface Specification

## 9.1 External API Inventory

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| POST | `/api/agents/add` | Register agent | IMPLEMENTED |
| GET | `/api/agents` | List all agents | IMPLEMENTED |
| POST | `/api/agents/location` | Update agent GPS | IMPLEMENTED |
| GET | `/api/agents/route` | Get agent's active route | IMPLEMENTED |
| POST | `/api/deliveries/add` | Create + auto-assign delivery | IMPLEMENTED |
| POST | `/api/deliveries/assign` | Reassign delivery | IMPLEMENTED |
| POST | `/api/deliveries/pickup` | Process pickup batch | IMPLEMENTED |
| POST | `/api/deliveries/complete` | Complete current delivery | IMPLEMENTED |
| POST | `/api/deliveries/cancel` | Cancel delivery | IMPLEMENTED |
| GET | `/api/deliveries` | List all deliveries | IMPLEMENTED |
| POST | `/api/pickups/add` | Create pickup location | IMPLEMENTED |
| GET | `/api/pickups/:id` | Get pickup location | IMPLEMENTED |
| GET | `/api/pickups` | List pickup locations | IMPLEMENTED |
| DELETE | `/api/pickups/:id` | Delete pickup location | IMPLEMENTED |
| GET | `/manager/*` | SPA static assets + fallback | IMPLEMENTED |

---

## 9.2 Endpoint Contracts

Each endpoint follows the structure: Method, Path, Input, Validation, Processing, Output, Side Effects, Auth, Idempotency.

### POST `/api/agents/add`

| Field | Value |
|---|---|
| **Input** | Body: `{ "agent_id": "string" }` |
| **Validation** | `agent_id` required → 400 |
| **Processing** | `stateService.createAgent(agent_id)` |
| **Output (200)** | `{ "success": true, "agent": AgentDocument }` |
| **Output (500)** | `{ "error": "Agent already exists." }` |
| **Side Effects** | Inserts Agent document |
| **Auth** | None |
| **Idempotency** | Not idempotent (duplicate → error) |

### GET `/api/agents`

| Field | Value |
|---|---|
| **Input** | None |
| **Processing** | `stateService.getAgents()` |
| **Output (200)** | `{ "success": true, "count": number, "agents": AgentDocument[] }` |
| **Side Effects** | None |
| **Pagination** | None — returns all documents |

### POST `/api/agents/location`

| Field | Value |
|---|---|
| **Input** | Body: `{ "agent_id": "string", "coords": { "lat": number, "lng": number } }` |
| **Validation** | All fields required → 400 |
| **Processing** | `stateService.upsertAgentLocation(agent_id, coords)` |
| **Output (200)** | `{ "success": true, "location": AgentLocationDocument }` |
| **Side Effects** | Upserts AgentLocation document |
| **Idempotency** | Idempotent (upsert) |

### GET `/api/agents/route`

| Field | Value |
|---|---|
| **Input** | Query: `?agent_id=string` |
| **Validation** | `agent_id` required → 400 |
| **Processing** | `deliveryService.getAgentRoute(agent_id)` — reads via stateService primitives |
| **Output (200)** | `{ "success": true, "activeDeliveries": [...], "nextPickupLocation": {...} | null }` |
| **Status** | IMPLEMENTED |

### POST `/api/deliveries/add`

| Field | Value |
|---|---|
| **Input** | Body: `{ "order_id"?: "string", "coords": { "lat": number, "lng": number } }` |
| **Validation** | `coords.lat` and `coords.lng` required → 400 |
| **Processing** | `assignmentService.assignAgent(coords)` → `deliveryService.assignDriver(agentId, order_id, coords)` |
| **Output (200)** | `{ "success": true, "agentId": "string", "agent": AgentDocument }` |
| **Side Effects** | Creates DeliveryAssignment (stateService), updates agent queues (stateService), updates pickup location (stateService) |
| **Status** | IMPLEMENTED |

### POST `/api/deliveries/assign`

| Field | Value |
|---|---|
| **Input** | Body: `{ "delivery_id": "string", "agent_id": "string" }` |
| **Validation** | Both required → 400 |
| **Processing** | `deliveryService.assignExistingDelivery(delivery_id, agent_id)` → delegates to `assignmentService.moveDeliveryToAgent` |
| **Output (200)** | `{ "success": true, ...result }` |
| **Status** | IMPLEMENTED |

### POST `/api/deliveries/pickup`

| Field | Value |
|---|---|
| **Input** | Body: `{ "agent_id": "string" }` |
| **Validation** | `agent_id` required → 400 |
| **Processing** | Validates no active deliveries → retrieves pending (stateService) → optimizes route (routingEngineService) → sets active route (stateService) → clears nextPickupLocation (stateService) → syncs global state (stateService). |
| **Output (200)** | `{ "success": true, "agent": AgentDocument }` |
| **Status** | IMPLEMENTED |

### POST `/api/deliveries/complete`

| Field | Value |
|---|---|
| **Input** | Body: `{ "agent_id": "string" }` |
| **Processing** | Completes first active delivery (stateService.completeFirstActive) → applies nextPickupLocation trigger rules → syncs global state (stateService). |
| **Output (200)** | `{ "success": true, "agent": AgentDocument }` |
| **Status** | IMPLEMENTED |

### POST `/api/deliveries/cancel`

| Field | Value |
|---|---|
| **Input** | Body: `{ "order_id": "string" }` |
| **Processing** | Cancels and deletes delivery (stateService.cancelAndDeleteDelivery) → reroutes if active (routingEngineService + stateService) → applies nextPickupLocation trigger rules → syncs global state (stateService). |
| **Output (200)** | `{ "success": true, "agent": AgentDocument }` |
| **Status** | IMPLEMENTED |

### GET `/api/deliveries`

| Field | Value |
|---|---|
| **Input** | None |
| **Processing** | `stateService.getDeliveries()` |
| **Output (200)** | `{ "success": true, "count": number, "deliveries": DeliveryDocument[] }` |
| **Pagination** | None |
| **Status** | IMPLEMENTED |

### POST `/api/pickups/add`

| Field | Value |
|---|---|
| **Input** | Body: `{ "id": "string", "name": "string", "coords": { "lat": number, "lng": number } }` |
| **Validation** | All required → 400 |
| **Processing** | `stateService.createPickupLocation(data)` |
| **Output (200)** | `{ "success": true, "pickup": PickupLocationDocument }` |

### GET `/api/pickups/:id`

| Field | Value |
|---|---|
| **Input** | Path param: `id` |
| **Processing** | `stateService.getPickupLocation(id)` |
| **Output (200)** | `{ "success": true, "pickup": PickupLocationDocument }` |

### DELETE `/api/pickups/:id`

| Field | Value |
|---|---|
| **Input** | Path param: `id` |
| **Processing** | `stateService.deletePickupLocation(id)` |
| **Output (200)** | `{ "success": true, "deleted": PickupLocationDocument }` |

### GET `/api/pickups`

| Field | Value |
|---|---|
| **Input** | None |
| **Processing** | `stateService.getPickupLocations()` |
| **Output (200)** | `{ "success": true, "count": number, "pickups": PickupLocationDocument[] }` |

### SPA Fallback (`/manager/*`)

| Behavior | Rule |
|---|---|
| Asset requests | `/manager/assets/*` → serve from `frontend/dist/assets/` → 404 if not found |
| Page routes | All other `/manager/*` → serve `frontend/dist/index.html` with `Cache-Control: no-cache` |
| Root redirect | `/manager` (no slash) → 301 to `/manager/` |

---

## 9.3 External Service Interfaces

| Service | Direction | Protocol | Purpose | Auth | Status |
|---|---|---|---|---|---|
| MongoDB | Backend → DB | TCP (Mongoose) | Persistence | Connection string | IMPLEMENTED |
| OSRM | Backend → External | HTTPS GET | Distance matrix | None | IMPLEMENTED |
| GraphHopper | Backend → External | HTTPS POST | Distance matrix | API key in URL | IMPLEMENTED |
| Mapbox | Backend → External | HTTPS GET | Distance matrix | Access token in URL | IMPLEMENTED |
| Google Directions | Mobile → External | HTTPS GET | Route polylines | API key in URL | IMPLEMENTED |

---

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

# 11. Implementation Mapping

## 11.1 Requirement → Module Matrix

| Req ID | stateService | assignmentService | deliveryService | routingEngine | costModel | matrixCache | vrpSolver | Setup Tool | Frontend | Mobile |
|---|---|---|---|---|---|---|---|---|---|---|
| FR-001 | ✦ | | | | | | | | | |
| FR-002 | ● | ✦ | ✦ | ● | ● | ● | | | | |
| FR-003 | ● | | ✦ | | | | | | | |
| FR-004 | ● | | ✦ | | | | | | | |
| FR-005 | ● | | ✦ | ● | | | | | | |
| FR-006 | ✦ | | | | | | | | | |
| FR-007 | ● | ✦ | ✦ | | | | | | | |
| FR-008 | ✦ | | | | | | | | | |
| FR-009 | | | | | | | | ✦ | | |
| FR-010 | | | | | | | | | ✦ | |
| FR-011 | | | | | | | | | | ✦ |

Legend: ✦ = Primary implementor. ● = Supporting dependency.

## 11.2 Module → Workflow Matrix

| Module | WF-001 | WF-002 | WF-003 | WF-004 |
|---|---|---|---|---|
| Setup Tool (main.py) | ✦ | | | |
| server.js | | ✦ | ✦ | |
| assignmentService | | ✦ | | |
| deliveryService | | ✦ | ✦ | |
| stateService | | ● | ● | |
| routingEngineService | | ● | | |
| costModelService | | ● | | |
| matrixCacheService | | ● | | |
| Mobile App | | | | ✦ |
| Frontend Dashboard | | | | |

## 11.3 Workflow → Interface Matrix

| Workflow | External Endpoints Used | Internal Services Called | Entities Mutated |
|---|---|---|---|
| WF-001 (Install) | None (filesystem) | None | Filesystem only |
| WF-002 (Assign) | POST `/api/deliveries/add` | assignmentService, deliveryService, stateService, routingEngine, costModel, matrixCache | Agent, DeliveryAssignment, AgentLocation (read), SystemState |
| WF-003 (Pickup) | POST `/api/deliveries/pickup` | deliveryService, stateService, routingEngineService | Agent, DeliveryAssignment, SystemState |
| WF-004 (Mobile) | POST `/api/agents/add`, POST `/api/agents/location`, GET `/api/agents/route`, POST `/api/deliveries/complete`, POST `/api/deliveries/pickup` | (called via API) | Agent, AgentLocation, DeliveryAssignment |

## 11.4 Interface → Entity Matrix

| Endpoint | Agent | AgentLocation | DeliveryAssignment | PickupLocation | SystemState |
|---|---|---|---|---|---|
| POST `/api/agents/add` | C | | | | |
| GET `/api/agents` | R | | | | |
| POST `/api/agents/location` | | CU | | | |
| GET `/api/agents/route` | R | | R | | |
| POST `/api/deliveries/add` | U | R | C | | U |
| POST `/api/deliveries/assign` | U | | U | | |
| POST `/api/deliveries/pickup` | U | | U | | U |
| POST `/api/deliveries/complete` | U | | D | | U |
| POST `/api/deliveries/cancel` | U | | D | | U |
| GET `/api/deliveries` | | | R | | |
| POST `/api/pickups/add` | | | | C | |
| GET `/api/pickups/:id` | | | | R | |
| GET `/api/pickups` | | | | R | |
| DELETE `/api/pickups/:id` | | | | D | |

Legend: C=Create, R=Read, U=Update, D=Delete, CU=Create or Update (upsert).

## 11.5 Implementation Completeness Matrix

| Req ID | Endpoint | Service | Model | Test | Status |
|---|---|---|---|---|---|
| FR-001 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-002 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-003 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-004 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-005 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-006 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-007 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-008 | ✅ | ✅ | ✅ | ❌ | IMPLEMENTED |
| FR-009 | N/A | ✅ | N/A | ❌ | IMPLEMENTED |
| FR-010 | ✅ | ⚠️ | N/A | ❌ | PARTIAL |
| FR-011 | N/A | N/A | N/A | ❌ | IMPLEMENTED |

## 11.6 Deviation Registry

### DEV-001: OR-Tools Stub

| Field | Value |
|---|---|
| **Type** | STUBBED integration |
| **What Changed** | OR-Tools integration planned but not implemented |
| **Current Behavior** | `runOrToolsBatch()` always delegates to `optimizeFleetRoutes()` regardless of `ORTOOLS_ENABLED` |
| **Impact** | No external solver available |
| **Classification** | Intentional scaffold |

### DEV-002: Dashboard Mock Data

| Field | Value |
|---|---|
| **Type** | PARTIAL implementation |
| **What Changed** | Dashboard built with mock data, then partially wired to live API |
| **Current Behavior** | `useLiveLogisticsData` hook fetches real data but KPIs, analytics, driver performance use hardcoded `mock-data.ts` |
| **Impact** | Dashboard displays mix of real and fake data |
| **Classification** | Incomplete migration |

### DEV-003: Setup Tool Placeholder Env Vars

| Field | Value |
|---|---|
| **Type** | IMPLEMENTED (with deviation) |
| **What Changed** | Setup Tool UI exposes `EXAMPLE_API_KEY`, `EXAMPLE_ENDPOINT`, `MONGODB_URI` |
| **Current Behavior** | Real routing config vars (ROUTE_ALPHA, MATRIX_PROVIDER, etc.) not configurable through installer UI |
| **Impact** | Users must manually edit `.env` for routing configuration |
| **Classification** | Intentional minimal scope |

---

# 12. Configuration and Environment Specification

## 12.1 Configuration Precedence

| Priority | Source | Mechanism |
|---|---|---|
| 1 (highest) | Environment variables | `process.env.VAR_NAME` |
| 2 | `.env` file | Loaded by `dotenv` at startup |
| 3 | Hardcoded defaults | `routingConfig.js` fallback values |

**Runtime reload:** Not supported. Configuration is read once at module load time. Server restart required for changes.

**Startup validation:** None. Invalid values silently fall back to defaults via `toNumber()` / `toBoolean()` parsers. No startup validation checks or warnings for misconfiguration.

## 12.2 Configuration Inventory

### Server Core

| Name | Type | Default | Required | Sensitive | Used By | Failure If Invalid |
|---|---|---|---|---|---|---|
| `PORT` | number | 3000 | No | No | server.js | Falls back to 3000 |
| `MONGODB_URI` | string | `mongodb://localhost:27017/optiroute-db` | No | Yes | server.js | Falls back to localhost |

### Routing Weights

| Name | Type | Default | Used By | Failure If Invalid |
|---|---|---|---|---|
| `ROUTE_ALPHA` | number | 0.55 | costModelService | Falls back to 0.55 |
| `ROUTE_BETA` | number | 0.20 | costModelService | Falls back to 0.20 |
| `ROUTE_GAMMA` | number | 0.15 | costModelService | Falls back to 0.15 |
| `ROUTE_DELTA` | number | 0.05 | costModelService | Falls back to 0.05 |
| `ROUTE_EPSILON` | number | 0.05 | costModelService | Falls back to 0.05 |

### Routing Parameters

| Name | Type | Default | Used By | Failure If Invalid |
|---|---|---|---|---|
| `ROUTE_EARTH_RADIUS_KM` | number | 6371 | matrixCacheService | Falls back to 6371 |
| `ROUTE_DEFAULT_SPEED_KPH` | number | 35 | matrixCacheService | Falls back to 35 |
| `ROUTE_SERVICE_TIME_MINUTES` | number | 0 | costModelService | Falls back to 0 |
| `ROUTE_SLA_PENALTY_MULTIPLIER` | number | 1 | costModelService | Falls back to 1 |
| `ROUTE_REGION_PRECISION` | number | 100 | matrixCacheService | Falls back to 100 |

### Matrix Provider

| Name | Type | Default | Sensitive | Condition | Failure If Invalid |
|---|---|---|---|---|---|
| `MATRIX_PROVIDER` | string | `haversine` | No | — | Falls back to haversine |
| `MATRIX_BASE_URL` | string | `""` | No | Required if provider ≠ haversine | Provider call fails → haversine fallback |
| `MATRIX_ACCESS_TOKEN` | string | `""` | Yes | Required for Mapbox | Mapbox call fails → haversine fallback |
| `MATRIX_CACHE_TTL_MINUTES` | number | 60 | No | — | Falls back to 60 |
| `MATRIX_CACHE_MAX_ENTRIES` | number | 5000 | No | — | Falls back to 5000 |

### VRP Solver

| Name | Type | Default | Used By | Status |
|---|---|---|---|---|
| `REOPTIMIZE_ORDER_THRESHOLD` | number | 5 | vrpSolverService | STUBBED |
| `REOPTIMIZE_INTERVAL_MINUTES` | number | 15 | vrpSolverService | STUBBED |
| `ORTOOLS_ENABLED` | boolean | false | vrpSolverService | STUBBED |
| `ORTOOLS_TIME_LIMIT_SECONDS` | number | 30 | vrpSolverService | STUBBED |

### Mobile App (`agent/.env`)

| Name | Type | Default | Sensitive |
|---|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | string | `http://192.168.0.48:3000` | No |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | string | (set in file) | Yes |
| `EXPO_PUBLIC_AGENT_ID` | string | `driver-001` | No |

## 12.3 Configuration Dependency Impact

| Config | Dependent Behavior | Impact If Missing/Invalid |
|---|---|---|
| `MONGODB_URI` | All data persistence | Silently uses localhost; fails if no MongoDB running |
| `MATRIX_PROVIDER` | Distance matrix source | Falls back to Haversine (no road data) |
| `MATRIX_BASE_URL` | Provider API calls | Provider call returns null → Haversine fallback |
| `ROUTE_ALPHA..EPSILON` | Cost evaluation | Falls back to defaults (silent) |
| `EXPO_PUBLIC_BACKEND_URL` | Mobile → backend connectivity | Mobile app cannot reach server |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Route polyline rendering | No polyline drawn on mobile map |
| `EXPO_PUBLIC_AGENT_ID` | Agent identity | Wrong agent identity used |

## 12.4 Sensitive Configuration Handling

| Data | Committed to Git? | Protection |
|---|---|---|
| Server `.env` | No (in `.gitignore`) | File-level access control |
| `MATRIX_ACCESS_TOKEN` | No | In `.env` |
| `MONGODB_URI` | No | In `.env` |
| `agent/.env` (Google Maps key) | **Yes** ⚠️ | Not protected — security concern |
| `.env.example` | Yes (template only) | Contains placeholder values |

---

# 13. Security and Trust Specification

## 13.1 Authentication Model

**Status:** PLANNED — not implemented.

No authentication mechanism exists. All API endpoints are publicly accessible without credentials, tokens, or API keys.

## 13.2 Authorization Model

**Status:** PLANNED — not implemented.

No role-based access control. No permission checks. Any client can perform any operation (create agents, assign deliveries, delete pickups, etc.).

## 13.3 Trust Boundaries

| Boundary | From → To | Trust Level | Verification |
|---|---|---|---|
| Client → Backend API | Any HTTP client → Express | Untrusted | None |
| Backend → MongoDB | Express → Mongoose | Trusted | Connection string |
| Backend → Matrix Provider | Express → OSRM/GH/Mapbox | Untrusted | HTTPS only |
| Mobile → Google APIs | Expo app → Google | Untrusted | API key (in URL) |
| Mobile → Backend | Expo app → Express | Untrusted | None |
| Dashboard → Backend | React app → Express (proxied) | Untrusted | None (same-origin in prod) |

## 13.4 Security Controls

| Control | Status | Implementation |
|---|---|---|
| Helmet Security Headers | IMPLEMENTED | Custom CSP (allows unsafe-inline, OpenStreetMap, Unsplash) |
| CORS | IMPLEMENTED (insecure) | `cors()` — all origins allowed |
| Input Validation | PARTIAL | Manual field-presence checks; no schema/type validation |
| Rate Limiting | PLANNED | Not implemented |
| HTTPS Enforcement | PLANNED | Not enforced; HTTP in development |
| Authentication | PLANNED | Not implemented |
| NoSQL Injection Protection | PARTIAL | Mongoose provides some ORM-level protection |
| Audit Trails | PLANNED | Not implemented |
| API Key Rotation | PLANNED | No key management system |

## 13.5 Threat / Risk Assessment

| ID | Threat | Severity | Mitigation | Status |
|---|---|---|---|---|
| SEC-001 | Open API — any client can modify all data | High | Implement authentication | PLANNED |
| SEC-002 | GPS spoofing — agent location accepted without verification | Medium | Location validation | PLANNED |
| SEC-003 | Committed API key — Google Maps key in `agent/.env` | High | Move to `.gitignore`, rotate key | Not started |
| SEC-004 | No rate limiting — susceptible to abuse | Medium | Implement rate limiter | PLANNED |
| SEC-005 | CORS allows all origins | Medium | Restrict to known origins | PLANNED |
| SEC-006 | Mapbox token in URL query params | Low | Use header-based auth | PLANNED |
| SEC-007 | No HTTPS enforcement | Medium | Configure TLS termination | PLANNED |

---

# 14. Operational and Observability Specification

## 14.1 Logging

| Layer | Mechanism | Format | Destination | Status |
|---|---|---|---|---|
| HTTP Requests | Morgan middleware | `combined` (Apache-style) | stdout | IMPLEMENTED |
| MongoDB connection | `console.log` | Unstructured | stdout | IMPLEMENTED |
| Server startup | `console.log` | Unstructured | stdout | IMPLEMENTED |
| Port-in-use error | `console.error` | Unstructured | stderr | IMPLEMENTED |
| VRP scheduler errors | Silently swallowed | None | Nowhere | IMPLEMENTED (intentional) |
| Application errors | Route handler catch blocks | `{ error: message }` JSON | HTTP response only | IMPLEMENTED |
| Structured logging lib | Not used | — | — | PLANNED |

**Gaps:** No log levels. No log rotation. No correlation IDs. No request tracing. No audit logging.

## 14.2 Monitoring and Health Checks

| Capability | Status |
|---|---|
| Health check endpoint (`/health`) | PLANNED |
| Readiness endpoint (`/ready`) | PLANNED |
| Metrics collection (Prometheus, etc.) | PLANNED |
| APM integration | PLANNED |
| Uptime monitoring | PLANNED |
| Alerting | PLANNED |

**Current liveness signal:** Server startup log message ("Server running on port X").

## 14.3 Recovery and Resilience

### Failure Modes

| Failure | Component | Behavior | Recovery | Severity |
|---|---|---|---|---|
| MongoDB connection failure | Backend | Logs error, continues running. All API data calls return 500. | Restart server after MongoDB restored. | Critical |
| Port already in use | Backend | Logs error, `process.exit(1)`. | Change port or kill conflicting process. | Critical |
| Matrix provider API failure | matrixCacheService | Silently falls back to Haversine estimation. | Automatic — no intervention needed. | Low |
| Matrix provider returns invalid data | matrixCacheService | Individual entries fall back to Haversine per-pair. | Automatic. | Low |
| Google Directions API failure | Mobile app | `buildRoutePolyline` returns `[]`. No polyline drawn. | Manual retry (next poll cycle). | Medium |
| Backend unreachable from mobile | Mobile app | Catches fetch error, logs to console. No retry/backoff. | Automatic on next poll. | Medium |
| Backend unreachable from dashboard | Dashboard | `console.error`, `isLoading` set to false. No retry. | Manual page refresh. | Medium |
| PM2 process crash | Backend (VPS) | PM2 `autorestart: true` restarts process. Max memory 256M triggers restart. | Automatic. | Low |
| MongoDB transaction failure | stateService | Session aborted, error propagated. No partial writes. | Automatic — caller retries or returns error. | Medium |
| In-memory cache corruption | matrixCacheService | N/A — cache is a simple Map, not corruptible. | Restart clears cache. | N/A |

### Fallback Execution Paths

| Primary Path | Fallback Path | Trigger |
|---|---|---|
| OSRM matrix → road distances | Haversine estimation | OSRM call fails or returns null |
| GraphHopper matrix → road distances | Haversine estimation | GraphHopper call fails |
| Mapbox matrix → road distances | Haversine estimation | Mapbox call fails |
| Road matrix entry for pair | Haversine for that specific pair | Individual entry missing/invalid |
| Matrix `.get()` method | Matrix Map `.get()` → object property | Polymorphic lookup in costModelService |
| Google Directions polyline | Empty route (`[]`) | API error or no routes returned |
| Agent location from AgentLocation doc | Fallback coords (40.7128, -74.0060) | No location document found (dashboard) |

### Rollback Behavior

| Operation | Rollback Mechanism | Scope |
|---|---|---|
| Multi-document mutations (pickup, complete, cancel) | MongoDB transaction abort via `finalizeSession` | All writes within session |
| Single-document writes (location upsert, agent create) | MongoDB transaction abort | Single write |
| In-memory cache writes | No rollback — cache state persists | Per-entry |
| SystemState sync | No rollback — runs outside transaction | Global |
| File copy (Setup Tool) | No rollback — partial copies remain | Filesystem |

### Degraded Mode Behavior

| Scenario | Subsystems Affected | Behavior |
|---|---|---|
| MongoDB down | All API endpoints | Server runs but returns 500 on all data operations |
| Matrix provider down | Route optimization | Routes optimized using Haversine (less accurate, faster) |
| Google API down | Mobile app only | Map renders without polyline; markers still visible |
| Backend down | Mobile + Dashboard | Mobile shows stale data; Dashboard shows loading/error |
| No agents registered | Delivery creation | Assignment fails (no candidates) → 500 error |

---

# 15. Constraints, Limitations, and Known Issues

## 15.1 Current Limitations

| ID | Limitation | Impact | Mitigation |
|---|---|---|---|
| LIM-001 | No authentication/authorization | All endpoints publicly accessible | Implement auth layer |
| LIM-002 | Single-process architecture | No horizontal scaling | Add clustering or worker threads |
| LIM-003 | In-memory cache only | Lost on restart, not shared across instances | Use Redis or similar |
| LIM-004 | No real-time push | Dashboard stale after initial load; mobile polls every 5s | Implement WebSocket/SSE |
| LIM-005 | No delivery status field | Cannot query by status without aggregation | Add explicit status field |
| LIM-006 | No pagination | GET endpoints return all documents | Add limit/offset params |
| LIM-007 | No agent deletion | Cannot remove decommissioned agents | Add delete endpoint |
| LIM-008 | No agent display names | Agents identified only by `agentId` | Add name field to schema |
| LIM-009 | Dashboard partially mocked | KPIs/analytics show fake data | Replace mock data with API calls |
| LIM-010 | Setup Tool placeholder vars | Real config vars not in installer UI | Expose actual vars |
| LIM-011 | No graceful shutdown | In-flight requests dropped on restart | Add shutdown handler |
| LIM-012 | No input schema validation | Type errors possible at runtime | Add Joi/Zod validation |

## 15.2 Technical Debt

| ID | Item | Severity | Description |
|---|---|---|---|
| TD-003 | Committed API key | High | `agent/.env` contains Google Maps API key tracked by Git. |
| TD-004 | CommonJS throughout | Medium | Server uses `require()`; limits modern tooling. |
| TD-005 | No input sanitization | Medium | Request bodies used with minimal validation. |
| TD-006 | Dual data model (pointers + arrays) | Medium | Delivery prev/next pointers duplicate Agent array information. |
| TD-007 | Frontend package name | Low | `@figma/my-make-file` — leftover from Figma Make template. |
| TD-008 | Mock data not removed | Medium | `mock-data.ts` still used by UI components alongside live data hook. |
| TD-009 | No structured logging | Medium | Only `console.log` — no levels, no correlation. |
| TD-010 | No health check | Medium | No liveness/readiness probe for orchestrators. |

## 15.3 Known Issues

| ID | Issue | Severity | Status |
|---|---|---|---|
| BUG-003 | CORS allows all origins | Medium | Known, accepted for dev |
| BUG-004 | Google Maps API key exposed in Git | High | Known, not fixed |
| BUG-005 | SystemState sync runs outside transaction — crash between transaction commit and sync leaves inconsistent global state | Low | Known, accepted |

## 15.4 Recommended Fixes

| ID | Fix | Priority | Effort |
|---|---|---|---|
| FIX-003 | Add `agent/.env` to `.gitignore`, rotate Google Maps API key | High | Low |
| FIX-004 | Add CORS origin whitelist | Medium | Low |
| FIX-005 | Replace mock data in dashboard with API calls | Medium | Medium |
| FIX-006 | Add health check endpoint | Medium | Low |

---

# 16. Traceability and Coverage Matrix

## 16.1 Full Requirement Coverage

| Req | Endpoint | Service | Model | Test | Frontend | Mobile | Status |
|---|---|---|---|---|---|---|---|
| FR-001 | ✅ | ✅ | ✅ | ❌ | — | ✅ (auto-reg) | IMPLEMENTED |
| FR-002 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-003 | ✅ | ✅ | ✅ | ❌ | — | ✅ (button) | IMPLEMENTED |
| FR-004 | ✅ | ✅ | ✅ | ❌ | — | ✅ (button) | IMPLEMENTED |
| FR-005 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-006 | ✅ | ✅ | ✅ | ❌ | — | ✅ (auto) | IMPLEMENTED |
| FR-007 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-008 | ✅ | ✅ | ✅ | ❌ | — | — | IMPLEMENTED |
| FR-009 | N/A | ✅ | N/A | ❌ | — | — | IMPLEMENTED |
| FR-010 | ✅ | ⚠️ | N/A | ❌ | ✅ | — | PARTIAL |
| FR-011 | N/A | N/A | N/A | ❌ | — | ✅ | IMPLEMENTED |

## 16.2 Dependency Ownership Mapping

| Module | Owns | Depends On |
|---|---|---|
| stateService | Agent CRUD, Delivery CRUD, queue mutation, pointer sync, location upsert, pickup CRUD | Mongoose models |
| assignmentService | Agent selection algorithm, marginal cost evaluation | stateService, matrixCacheService, routingEngineService |
| deliveryService | Delivery lifecycle orchestration, global state sync | stateService, assignmentService, routingEngineService |
| routingEngineService | Route construction/optimization orchestration | matrixCacheService, costModelService, strategies |
| costModelService | Cost formula evaluation, SLA penalty | routingConfig, matrixCacheService |
| matrixCacheService | Matrix generation, provider integration, caching | routingConfig |
| vrpSolverService | Fleet optimization, scheduler | routingConfig, routingEngineService |
| server.js | HTTP routing, middleware pipeline, MongoDB connection | All services |

## 16.3 Gap Summary

| Area | Gap | Impact |
|---|---|---|
| Authentication | No auth on any endpoint | Security vulnerability |
| Observability | No metrics, health checks, or structured logging | Operational blindness |
| Data pagination | Unbounded result sets | Performance risk at scale |
| Real-time communication | No push mechanism (WebSocket/SSE) | Dashboard shows stale data |
| Graceful shutdown | No shutdown handler | Data loss risk on restart |
| Input validation | No schema validation library | Type errors at runtime |

---

# 17. Appendix

## 17.1 Glossary

| Term | Definition |
|---|---|
| Agent | A delivery driver registered in the system |
| Active Deliveries | Deliveries currently being executed by an agent (ordered route) |
| Pending Pickup Deliveries | Deliveries assigned to an agent but not yet physically collected |
| Delivery (DeliveryAssignment) | A single delivery task with destination coordinates |
| Pickup Location | A static warehouse/hub where agents collect deliveries |
| Marginal Insertion Cost | Additional cost incurred by inserting a new stop into an existing route |
| 2-Opt | Local search optimization that improves routes by reversing segments |
| Cheapest Insertion | Greedy heuristic that builds routes by inserting at lowest-cost position |
| Travel Matrix | Pairwise distance/time matrix between all stops |
| Haversine | Great-circle distance formula for lat/lng pairs |
| VRP | Vehicle Routing Problem — fleet-level route optimization |
| Setup Tool | Python/tkinter desktop installer application |
| Pointer Sync | Process of rebuilding prev/next linked-list pointers from array order |
| NormalizedStop | Canonical stop format: `{ id, lat, lng, regionBucket, raw }` |
| Route Fingerprint | JSON hash of delivery orderIds + pickup location; used to detect route changes |

## 17.2 Acronyms

| Acronym | Meaning |
|---|---|
| API | Application Programming Interface |
| CORS | Cross-Origin Resource Sharing |
| CSP | Content Security Policy |
| GPS | Global Positioning System |
| LRU | Least Recently Used |
| ODM | Object-Document Mapper |
| OSRM | Open Source Routing Machine |
| PM2 | Process Manager 2 |
| REST | Representational State Transfer |
| SLA | Service Level Agreement |
| SPA | Single Page Application |
| TSP | Travelling Salesman Problem |
| TTL | Time To Live |
| VRP | Vehicle Routing Problem |
| CJS | CommonJS (module system) |
| ESM | ECMAScript Modules |
| RN | React Native |

## 17.3 References

| Reference | Location |
|---|---|
| Project README | `README.md` |
| Server .env example | `resources/server/.env.example` |
| Frontend README | `resources/server/frontend/README.md` |
| Figma Design Source | `https://www.figma.com/design/19X3ubFrS4JKm8aSqxHPmL/` |
| PM2 Config | `resources/server/ecosystem.config.js` |
| Vercel Config | `resources/server/vercel.json` |
| Installed App README | `installed/SetupTool/README.txt` |
| PyInstaller Spec | `SetupTool.spec` |

## 17.4 Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2026-05-15 | Antigravity (AI) | Initial specification from codebase analysis |
| 1.1.0 | 2026-05-15 | Antigravity (AI) | Normalized formatting, standardized status taxonomy, expanded runtime analysis, added internal interfaces, failure analysis, data lifecycle, traceability matrices, boundary definitions |

## 17.5 Open Architectural Questions

| ID | Question | Context |
|---|---|---|
| OQ-002 | Should the Setup Tool expose real routing config vars? | Currently only placeholder names are configurable |
| OQ-003 | Is the `agent/.env` API key commit intentional? | Appears to be development convenience but poses security risk |
| OQ-004 | Should the VRP scheduler be activated? | Code exists but is never called from server startup |
| OQ-005 | Should mock data be fully replaced in dashboard? | Unclear if mock data is kept for demo/testing or is an incomplete migration |
| OQ-006 | Should delivery status be stored explicitly? | Current derived-status model prevents direct status queries |
| OQ-007 | Should pointer fields (prev/next) be removed? | They duplicate array ordering and add maintenance overhead |
| OQ-008 | Is the CommonJS → ESM migration planned? | Referenced in past conversations but not started |

## 17.6 Status Taxonomy Reference

All status labels used in this document follow this normalized taxonomy:

| Status | Definition |
|---|---|
| IMPLEMENTED | Fully functional, code complete, no known defects |
| PARTIAL | Some functionality works; gaps or mock data remain |
| BROKEN | Code exists but fails at runtime due to defects |
| STUBBED | Interface/scaffold exists but core logic is a no-op |
| DEPRECATED | Superseded by newer implementation |
| EXPERIMENTAL | Prototype/proof-of-concept, not production-ready |
| PLANNED | Intended but no code exists |
| LEGACY | Outdated code still present but not actively used |

---

