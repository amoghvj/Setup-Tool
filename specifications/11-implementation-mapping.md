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

