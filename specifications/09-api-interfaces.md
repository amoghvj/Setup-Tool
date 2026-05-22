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

